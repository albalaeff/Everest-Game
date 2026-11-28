import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";

import type { Point } from "../physics";
import { Atmosphere } from "../rendering/atmosphere";
import type { GraphicsQuality } from "../rendering/graphics-quality";
import type { SceneWorld } from "../rendering/slope-scene";
import type { BetweenSteps } from "../rendering/stepped-points";
import type { SkyTurn } from "../simulation";
import { Climbers } from "./climbers";
import { FirstPersonLook } from "./first-person-look";
import { GlacierGround } from "./glacier-ground";
import { GlacierShape } from "./glacier-shape";
import { GroundMaterial } from "./ground-material";
import { KitMaterial } from "./kit-material";
import { RouteKit } from "./route-kit";
import { SceneLight } from "./scene-light";
import { SeracField } from "./serac-field";
import { Sharpness } from "./sharpness";
import { SkyDome } from "./sky-dome";
import { SkyShare } from "./sky-share";
import { SunShadows } from "./sun-shadows";
import { TextureBaker } from "./texture-baker";
import { Trail } from "./trail";
import { ValleyWalls } from "./valley-walls";

/**
 * The Icefall in 3D, seen through the climber's own eyes (#311): a three.js picture in the
 * page's `#slope`, beside the 2D `SlopeScene` and answering the same calls, so the page runs
 * either. It reads the same world, the physics, the clock, the hazards and the body, and holds
 * no game state: what it owns is the picture's own, the ground's meshes, the light, where the
 * head is turned, and its seconds.
 */
export class IcefallScene {
  /** The level's own seed: the same Icefall on every climb, as a place is. */
  private static readonly LEVEL_SEED = 311;
  /** A climber's reach with a tool, in metres: how far ahead of their feet the ice is swung at,
   * how low the head tips before the hand goes to the crampons, in radians, and how high over
   * the feet a pick goes in, from the shoulder to a full stretch (`technique.pick-lock-off`,
   * `technique.pick-reach`: a little inside both, so a swing where they look always reaches). */
  private static readonly ARM = { AHEAD: 0.3, FEET: -0.9, SHOULDER: 1.45, STRETCH: 2.15 };
  /** How high a climber's eyes are over their feet, standing, in metres. */
  private static readonly EYES = 1.62;
  /** How wide the climber sees, in degrees up and down. */
  private static readonly FIELD_OF_VIEW = 68;

  readonly look = new FirstPersonLook();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(IcefallScene.FIELD_OF_VIEW, 1, 0.08, 12000);
  private readonly light = new SceneLight();
  private readonly trail: Trail;
  private readonly eye = new Vector3();
  private renderer: WebGLRenderer | null = null;
  private shadows: SunShadows | null = null;
  private sky: SkyDome | null = null;
  private kit: RouteKit | null = null;
  private climbers: Climbers | null = null;
  private atmosphere: Atmosphere;
  private sharpness: Sharpness;
  private devicePixelRatio = 1;
  private covered = false;
  private frames = 0;
  private seconds = 0;
  private triangles = 0;
  /** The milliseconds of a frame the page's own code takes, the game's steps and the picture's
   * orders to the graphics card: lately, and at the longest lately. */
  private busy = 0;
  private busiest = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly world: SceneWorld,
    private quality: GraphicsQuality,
  ) {
    const span = world.physics.terrain.points.at(-1)?.[0] ?? 0;
    this.trail = new Trail(span);
    this.atmosphere = Atmosphere.at(world.clock.timeOfDay, this.turning, this.altitude);
    this.camera.layers.enable(SunShadows.CLIMBERS);
    this.camera.layers.enable(SunShadows.SKY);
    this.camera.rotation.order = "YXZ";
    this.sharpness = new Sharpness(quality.name);
  }

  /** Opens the canvas in the host and builds the level: false when the browser can't draw. */
  open(window: Window): Promise<boolean> {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return Promise.resolve(false);
    }
    this.renderer = renderer;
    this.devicePixelRatio = window.devicePixelRatio;
    this.resize(renderer);
    renderer.autoClear = true;
    this.host.append(renderer.domElement);
    window.addEventListener("resize", () => {
      this.devicePixelRatio = window.devicePixelRatio;
      this.resize(renderer);
    });
    this.look.listen(renderer.domElement, window.document);
    this.build(renderer);
    this.look.face(this.trail.heading(this.world.physics.climber(this.world.player).x));
    return Promise.resolve(true);
  }

  /** Runs `frame` before each frame is drawn, with the real seconds since the last one and the
   * browser's clock. */
  eachFrame(frame: (seconds: number, nowMilliseconds: number) => void): void {
    let last: number | null = null;
    this.renderer?.setAnimationLoop((now: number) => {
      const began = performance.now();
      frame(last === null ? 0 : (now - last) / 1000, now);
      last = now;
      const took = performance.now() - began;
      this.busy += (took - this.busy) * 0.05;
      this.busiest = Math.max(this.busiest * 0.995, took);
    });
  }

  /** Another level of the graphics setting: the picture as sharp as it allows from now, and
   * the towers and the shadows as fine as it allows from the next time the level is opened. */
  setQuality(quality: GraphicsQuality, devicePixelRatio: number): void {
    this.quality = quality;
    this.sharpness = new Sharpness(quality.name);
    this.devicePixelRatio = devicePixelRatio;
    if (this.renderer !== null) {
      this.resize(this.renderer);
    }
  }

  /** A frame, `between` the steps: the eye where the climber is drawn, looking where the head
   * is turned, the light by the clock and the weather, and the picture drawn. */
  draw(seconds: number, between: BetweenSteps): void {
    const { renderer, world } = this;
    if (renderer === null || this.covered) {
      return;
    }
    this.seconds += seconds;
    if (this.sharpness.frame(seconds)) {
      this.resize(renderer);
    }
    this.climbers?.update(seconds, between, this.look.yaw);
    const feet = this.climbers?.playerFeet ?? this.eye;
    this.kit?.update(feet);
    this.climbers?.eyes(this.look.yaw, this.look.pitch, this.eye);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.look.pitch, this.look.yaw, 0);
    const { innerWidth, innerHeight } = this.host.ownerDocument.defaultView ?? {
      innerWidth: 1,
      innerHeight: 1,
    };
    this.camera.aspect = innerWidth / Math.max(innerHeight, 1);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.atmosphere = this.atmosphere.after(
      seconds,
      world.clock.timeOfDay,
      this.turning,
      this.altitude,
      0,
    );
    this.light.set(
      world.clock.timeOfDay,
      this.atmosphere,
      world.lamps.lit(world.player),
      this.seconds,
    );
    const { uLampPos, uLampDir } = this.light.uniforms;
    uLampPos.value.copy(this.eye).y += 0.07;
    this.camera.getWorldDirection(uLampDir.value);
    this.sky?.place(this.eye);
    this.shadows?.draw(renderer, this.scene, feet, seconds);
    renderer.render(this.scene, this.camera);
    this.frames += 1;
    this.report();
  }

  /** Where a point of the physics' plane is on the screen, in its pixels: for the page's pins
   * and the stories. Far off the screen when it's behind the eye. */
  screenAt(x: number, y: number): readonly number[] {
    const at = this.trail.place({ x, y });
    const seen = new Vector3(at.x, at.y, at.z).project(this.camera);
    if (seen.z > 1) {
      return [-10000, -10000];
    }
    const { innerWidth, innerHeight } = this.host.ownerDocument.defaultView ?? {
      innerWidth: 1,
      innerHeight: 1,
    };
    return [((seen.x + 1) / 2) * innerWidth, ((1 - seen.y) / 2) * innerHeight];
  }

  /** The way the player's body faces along the route, 1 up it and −1 down: the way they look,
   * near enough, and the way a push forward walks. */
  get way(): 1 | -1 {
    return this.climbers?.playerWay ?? 1;
  }

  /** The tool the player's hand goes to where they look, and the point of the physics' plane it
   * goes to: looking down at their boots, the crampons, at the ice under their toes; otherwise
   * the ice axe, into the ice an arm's length ahead, as high as they look, between the shoulder
   * and a full stretch. */
  aim(): { readonly tool: "ice-axe" | "crampons"; readonly x: number; readonly y: number } {
    const { x, y } = this.world.physics.climber(this.world.player);
    const { AHEAD, FEET, SHOULDER, STRETCH } = IcefallScene.ARM;
    const ahead = x + this.way * AHEAD;
    if (this.look.pitch < FEET) {
      return { tool: "crampons", x: ahead, y: y - 2 * AHEAD };
    }
    const high = IcefallScene.EYES + 3 * AHEAD * Math.tan(this.look.pitch);
    return { tool: "ice-axe", x: ahead, y: y + Math.min(Math.max(high, SHOULDER), STRETCH) };
  }

  /** Stops drawing while a screen covers the whole picture, as the tent's inside does. */
  cover(covered: boolean): void {
    this.covered = covered;
    if (this.renderer !== null) {
      this.renderer.domElement.style.visibility = covered ? "hidden" : "";
    }
  }

  /** Where the player is on their way through a tent's door: the 3D picture has no way
   * through one yet, so they're outside until the tent's screen covers it. */
  get passage(): "outside" | "going-in" | "inside" | "coming-out" {
    return this.world.physics.climber(this.world.player).sheltered ? "inside" : "outside";
  }

  /** The point over a camp's tent: none until the 3D picture has tents. */
  tentOver(): Point | null {
    return null;
  }

  /** The colour drawn at a point of the screen, red, green, blue and alpha, 0 to 255. */
  pixelAt(x: number, y: number): readonly number[] {
    const { renderer } = this;
    if (renderer === null) {
      return [0, 0, 0, 0];
    }
    renderer.render(this.scene, this.camera);
    const gl = renderer.getContext();
    const ratio = renderer.getPixelRatio();
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.round(x * ratio),
      gl.drawingBufferHeight - 1 - Math.round(y * ratio),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return [...pixel];
  }

  /** The canvas over the whole page, as sharp as the level and the frame rate allow. */
  private resize(renderer: WebGLRenderer): void {
    const { innerWidth, innerHeight } = this.host.ownerDocument.defaultView ?? {
      innerWidth: 1,
      innerHeight: 1,
    };
    renderer.setPixelRatio(this.sharpness.ratio(innerWidth, innerHeight, this.devicePixelRatio));
    renderer.setSize(innerWidth, innerHeight);
  }

  /** The sky as it turns, or the hazards' weather, steady. */
  private get turning(): SkyTurn {
    const { weather, hazards } = this.world;
    return weather?.turn ?? { from: hazards.weather, to: hazards.weather, share: 1 };
  }

  private get altitude(): number {
    return this.world.physics.climber(this.world.player).altitude;
  }

  /** The level, built once: the textures drawn, the ground cut into meshes, the sky hung. */
  private build(renderer: WebGLRenderer): void {
    const { physics, parts } = this.world;
    const baker = new TextureBaker(renderer);
    const textures = {
      snow: baker.bake(TextureBaker.SNOW),
      ice: baker.bake(TextureBaker.ICE),
      stone: baker.bake(TextureBaker.STONE),
      tracks: baker.bake(TextureBaker.TRACKS, 512),
    };
    const shape = new GlacierShape(
      physics.terrain,
      this.trail,
      parts,
      physics.ice,
      IcefallScene.LEVEL_SEED,
    );
    const material = new GroundMaterial(this.light, textures);
    const seracs = new SeracField(
      shape,
      material,
      IcefallScene.LEVEL_SEED,
      this.quality.name !== "low",
    );
    const ground = new GlacierGround(shape, material, new SkyShare(seracs.seracs));
    const walls = new ValleyWalls(
      shape,
      this.light,
      textures.snow,
      textures.stone,
      IcefallScene.LEVEL_SEED,
    );
    this.triangles = ground.triangles + seracs.triangles + walls.triangles;
    this.scene.add(ground.group, seracs.group, walls.mesh);
    const cloth = new KitMaterial(this.light, 0.07, 10);
    const metal = new KitMaterial(this.light, 0.8, 50);
    this.kit = new RouteKit(physics, this.trail, cloth, metal);
    this.climbers = new Climbers(this.world, this.trail, this.kit, cloth);
    this.scene.add(this.kit.group, this.climbers.group);
    this.sky = new SkyDome(this.light);
    this.scene.add(this.sky.group);
    this.shadows = new SunShadows(this.light, this.quality.name === "low" ? 1024 : 2048);
  }

  /** What the picture drew, in `#slope`'s data attributes, for the page's stories. */
  private report(): void {
    const { dataset } = this.host;
    const { x, y, z } = this.eye;
    dataset.view = "3d";
    dataset.quality = this.quality.name;
    dataset.frames = String(this.frames);
    dataset.triangles = String(this.triangles);
    dataset.busy = `${this.busy.toFixed(1)} ${this.busiest.toFixed(1)}`;
    dataset.shadows = String(this.shadows?.redrawn ?? 0);
    dataset.sharpness = (this.renderer?.getPixelRatio() ?? 0).toFixed(2);
    dataset.camera = `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`;
    dataset.facing = `${this.look.yaw.toFixed(2)} ${this.look.pitch.toFixed(2)}`;
    dataset.phase = this.atmosphere.light.phase;
    dataset.weather = this.atmosphere.look.weather;
  }
}
