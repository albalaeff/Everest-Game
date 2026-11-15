import { Application, Rectangle } from "pixi.js";

import type { Lamps, SlopePhysics } from "../physics";
import type {
  Body,
  Breathing,
  ClimberId,
  JoltWarning,
  JoltZone,
  MountainClock,
  ObjectiveHazards,
} from "../simulation";
import { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import type { CampStretch } from "./camp-signs";
import type { PartStretch } from "./glacier";
import type { GraphicsQuality } from "./graphics-quality";
import { Palette } from "./palette";
import type { ParallaxLayer } from "./parallax-layer";
import { SkyLayer } from "./sky-layer";
import { SkylineLayer } from "./skyline-layer";
import { SlopeLayer } from "./slope-layer";
import { SnowLayer } from "./snow-layer";
import type { BetweenSteps } from "./stepped-points";

/** What the scene draws, and reads each frame: the expedition's rules and who's on the slope. */
export interface SceneWorld {
  readonly physics: SlopePhysics;
  readonly hazards: ObjectiveHazards;
  readonly clock: MountainClock;
  readonly body: Body;
  /** The supplemental oxygen: a climber's mask is on while it flows. */
  readonly oxygen: Breathing;
  /** Whose headlamps are lit (#196): a dead one throws no light. */
  readonly lamps: Lamps;
  readonly camps: readonly CampStretch[];
  readonly parts: readonly PartStretch[];
  readonly climbers: readonly ClimberId[];
  readonly player: ClimberId;
  /** The climbers an agent steers: the Sherpa, in his blue suit (#212). */
  readonly npcs: readonly ClimberId[];
  readonly seed: number;
  /** The jolts on their way (#197): a gust streams the snow, a lashed ladder shudders. */
  readonly jolts?: {
    readonly zones: readonly JoltZone[];
    readonly warnings: readonly JoltWarning[];
  };
}

/**
 * The picture of the slope: a PixiJS application in the page's `#slope`, with the layers the
 * quality asks for, back to front, each placed by the camera every frame and lit by the hour of
 * the mountain's clock and the hazards' weather, and shaking while a hazard goes. It reads the
 * physics, the hazards, the clock, the body, the oxygen, the camps and the route's parts and holds
 * no game state: what it owns is the picture's own, the camera's place and zoom, the flakes and
 * the motes, the warnings' clocks, its own seconds and the frame count. For the page's stories it
 * writes what it draws into `#slope`'s data attributes, and reads a pixel back, since Playwright
 * can't read a WebGL canvas.
 */
export class SlopeScene {
  /** How far the picture shakes while a hazard goes, in slope metres a step of its cycle, and
   * how many frames the cycle runs. */
  private static readonly SHAKE_METRES = 0.06;
  private static readonly SHAKE_FRAMES = 5;
  /** A gust on its way (#197): the seconds of picture its wind takes to rise to its full blow, and
   * to die away once it has come and gone. */
  private static readonly GUST = { rise: 1.5, fall: 1.5 };

  private readonly app = new Application();
  private opened = false;
  private layers: readonly ParallaxLayer[] = [];
  private sky: SkyLayer | null = null;
  private skylines: readonly SkylineLayer[] = [];
  private slope: SlopeLayer | null = null;
  private snow: SnowLayer | null = null;
  private atmosphere: Atmosphere;
  private frames = 0;
  /** How hard a gust on its way blows the picture's wind now, 0 to 1. */
  private blowing = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly camera: Camera,
    private readonly world: SceneWorld,
    private quality: GraphicsQuality,
  ) {
    this.atmosphere = Atmosphere.at(world.clock.timeOfDay, world.hazards.weather, this.altitude);
  }

  /** Opens the canvas in the host: false when the browser can't draw, which is no WebGL. */
  async open(window: Window): Promise<boolean> {
    try {
      await this.app.init({
        resizeTo: window,
        autoDensity: true,
        resolution: this.quality.resolution(window.devicePixelRatio),
        antialias: true,
        background: Palette.NIGHT_SKY_HORIZON,
        preference: "webgl",
      });
    } catch {
      return false;
    }
    this.host.append(this.app.canvas);
    this.opened = true;
    this.build();
    return true;
  }

  /** Runs `frame` before each frame is drawn, with the real seconds since the last one and the
   * browser's clock. Not Pixi's `deltaMS`, which counts a frame longer than a tenth of a second
   * as a tenth: a device drawing a few frames a second would play slow. How long a frame may
   * count for is the game's. */
  eachFrame(frame: (seconds: number, nowMilliseconds: number) => void): void {
    this.app.ticker.add((ticker) => {
      frame(ticker.elapsedMS / 1000, ticker.lastTime);
    });
  }

  /** Another level: the layers built again, and the picture as sharp as it allows. */
  setQuality(quality: GraphicsQuality, devicePixelRatio: number): void {
    this.quality = quality;
    if (!this.opened) {
      return;
    }
    const { width, height } = this.app.screen;
    this.app.renderer.resize(width, height, quality.resolution(devicePixelRatio));
    this.build();
  }

  /** A frame, `between` the steps: the climbers and the ropes move to where they are drawn, the
   * camera follows the player there for `seconds` more, the air and the light are read from the
   * clock, the player's altitude and the weather, and every layer is placed by the camera and
   * lit. */
  draw(seconds: number, between: BetweenSteps): void {
    if (!this.opened) {
      return;
    }
    const { width, height } = this.app.screen;
    const { clock, hazards } = this.world;
    this.camera.resize(width, height);
    this.slope?.move(between);
    this.camera.follow(seconds, this.slope?.player ?? this.camera.climber);
    const gusting = (this.world.jolts?.warnings ?? []).some(({ kind }) => kind === "gust");
    const { rise, fall } = SlopeScene.GUST;
    this.blowing = Math.min(
      Math.max(this.blowing + (gusting ? seconds / rise : -seconds / fall), 0),
      1,
    );
    this.atmosphere = this.atmosphere.after(
      seconds,
      clock.timeOfDay,
      hazards.weather,
      this.altitude,
      this.blowing,
    );
    for (const layer of this.layers) {
      layer.place(this.camera);
    }
    this.sky?.light(this.atmosphere);
    for (const skyline of this.skylines) {
      skyline.light(this.atmosphere, seconds);
    }
    this.slope?.draw(seconds, this.camera, this.atmosphere);
    this.snow?.fall(seconds, this.atmosphere);
    this.shake();
    this.frames += 1;
    this.report();
  }

  /** The player's altitude, in metres: the air the sky is seen through. */
  private get altitude(): number {
    return this.world.physics.climber(this.world.player).altitude;
  }

  /** While a hazard goes, the whole picture shakes, a few centimetres of slope each way from
   * frame to frame; it's still otherwise. */
  private shake(): void {
    if (this.slope?.shaking !== true) {
      this.app.stage.position.set(0, 0);
      return;
    }
    const pixels = SlopeScene.SHAKE_METRES * this.camera.pixelsPerMetre;
    const step = (this.frames % SlopeScene.SHAKE_FRAMES) - (SlopeScene.SHAKE_FRAMES - 1) / 2;
    const [x, y] = this.frames % 2 === 0 ? [step, -step / 2] : [-step / 2, step];
    this.app.stage.position.set(x * pixels, y * pixels);
  }

  /** Where a point of the slope is on the screen, in its pixels: for the stories, which point at
   * the slope as a player does. */
  screenAt(x: number, y: number): readonly number[] {
    const at = this.camera.toScreen({ x, y });
    return [at.x, at.y];
  }

  /** The colour drawn at a point of the screen, red, green, blue and alpha, 0 to 255. */
  pixelAt(x: number, y: number): readonly number[] {
    const { pixels } = this.app.renderer.extract.pixels({
      target: this.app.stage,
      frame: new Rectangle(x, y, 1, 1),
      resolution: 1,
    });
    return [...pixels.slice(0, 4)];
  }

  private build(): void {
    this.app.stage.removeChildren();
    for (const layer of this.layers) {
      layer.destroy({ children: true });
    }
    const { layers: optional, flakes, motes, fogBanks, dithered } = this.quality;
    const { width, height } = this.app.screen;
    const { physics, hazards, body, oxygen, lamps, camps, parts, climbers, player, npcs, seed } =
      this.world;
    const { jolts } = this.world;
    const skyline = (style: typeof SkylineLayer.PEAKS, offset: number): SkylineLayer =>
      new SkylineLayer(style, physics.terrain, seed + offset, fogBanks, parts);
    this.sky = new SkyLayer(dithered);
    this.skylines = [
      ...(optional.farRanges ? [skyline(SkylineLayer.FAR_RANGES, 1)] : []),
      skyline(SkylineLayer.PEAKS, 2),
      ...(optional.nearRidge ? [skyline(SkylineLayer.NEAR_RIDGE, 3)] : []),
      ...(optional.foreground ? [skyline(SkylineLayer.FOREGROUND, 4)] : []),
    ];
    this.slope = new SlopeLayer(
      physics,
      hazards,
      body,
      oxygen,
      lamps,
      camps,
      parts,
      climbers,
      player,
      npcs,
      seed,
      motes,
      jolts,
    );
    this.snow = flakes > 0 ? new SnowLayer(flakes, width, height) : null;
    const behind = this.skylines.filter((layer) => layer.depth.x < 1);
    const inFront = this.skylines.filter((layer) => layer.depth.x >= 1);
    this.layers = [
      this.sky,
      ...behind,
      this.slope,
      ...inFront,
      ...(this.snow === null ? [] : [this.snow]),
    ];
    this.app.stage.addChild(...this.layers);
  }

  private report(): void {
    const { dataset } = this.host;
    const { x, y } = this.camera.position;
    const { climber } = this.camera;
    dataset.quality = this.quality.name;
    dataset.layers = String(this.layers.length);
    dataset.flakes = String(this.snow?.flakes ?? 0);
    dataset.climbers = String(this.slope?.climbers ?? 0);
    dataset.tents = String(this.slope?.tents ?? 0);
    dataset.frames = String(this.frames);
    dataset.camera = `${x.toFixed(2)} ${y.toFixed(2)}`;
    dataset.metresHigh = this.camera.metresHigh.toFixed(2);
    dataset.climber = `${climber.x.toFixed(2)} ${climber.y.toFixed(2)}`;
    dataset.phase = this.atmosphere.light.phase;
    dataset.weather = this.atmosphere.look.weather;
  }
}
