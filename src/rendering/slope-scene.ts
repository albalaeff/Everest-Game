import { Application, Rectangle } from "pixi.js";

import type { SlopePhysics } from "../physics";
import type { ClimberId, ObjectiveHazards } from "../simulation";
import type { Camera } from "./camera";
import type { GraphicsQuality } from "./graphics-quality";
import type { ParallaxLayer } from "./parallax-layer";
import { SkyLayer } from "./sky-layer";
import { SkylineLayer } from "./skyline-layer";
import { SlopeLayer } from "./slope-layer";
import { SnowLayer } from "./snow-layer";

/**
 * The picture of the slope: a PixiJS application in the page's `#slope`, with the layers the
 * quality asks for, back to front, each placed by the camera every frame, and shaking while a
 * hazard goes. It reads the physics and the hazards and holds no game state: what it owns is the
 * picture's own, the camera's place and zoom, the flakes, the warnings' clocks and the frame
 * count. For the page's stories it writes what it draws into `#slope`'s data attributes,
 * and reads a pixel back, since Playwright can't read a WebGL canvas.
 */
export class SlopeScene {
  private static readonly BACKGROUND = "#0b1d3a";
  /** How far the picture shakes while a hazard goes, in slope metres a step of its cycle, and
   * how many frames the cycle runs. */
  private static readonly SHAKE_METRES = 0.06;
  private static readonly SHAKE_FRAMES = 5;

  private readonly app = new Application();
  private opened = false;
  private layers: readonly ParallaxLayer[] = [];
  private slope: SlopeLayer | null = null;
  private snow: SnowLayer | null = null;
  private frames = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly camera: Camera,
    private readonly physics: SlopePhysics,
    private readonly hazards: ObjectiveHazards,
    private readonly climbers: readonly ClimberId[],
    private readonly player: ClimberId,
    private quality: GraphicsQuality,
    private readonly seed: number,
  ) {}

  /** Opens the canvas in the host: false when the browser can't draw, which is no WebGL. */
  async open(window: Window): Promise<boolean> {
    try {
      await this.app.init({
        resizeTo: window,
        autoDensity: true,
        resolution: this.quality.resolution(window.devicePixelRatio),
        antialias: true,
        background: SlopeScene.BACKGROUND,
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

  /** A frame: the camera follows for `seconds` more, and every layer is placed by it. */
  draw(seconds: number): void {
    if (!this.opened) {
      return;
    }
    const { width, height } = this.app.screen;
    this.camera.resize(width, height);
    this.camera.follow(seconds);
    for (const layer of this.layers) {
      layer.place(this.camera);
    }
    this.slope?.draw(seconds, this.camera.pixelsPerMetre);
    this.snow?.fall(seconds);
    this.shake();
    this.frames += 1;
    this.report();
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
    const { layers: optional, flakes } = this.quality;
    const { width, height } = this.app.screen;
    const { terrain } = this.physics;
    const skyline = (style: typeof SkylineLayer.PEAKS, seed: number): SkylineLayer =>
      new SkylineLayer(style, terrain, this.seed + seed);
    this.slope = new SlopeLayer(this.physics, this.hazards, this.climbers, this.player);
    this.snow = flakes > 0 ? new SnowLayer(flakes, width, height) : null;
    this.layers = [
      new SkyLayer(),
      ...(optional.farRanges ? [skyline(SkylineLayer.FAR_RANGES, 1)] : []),
      skyline(SkylineLayer.PEAKS, 2),
      ...(optional.nearRidge ? [skyline(SkylineLayer.NEAR_RIDGE, 3)] : []),
      this.slope,
      ...(optional.foreground ? [skyline(SkylineLayer.FOREGROUND, 4)] : []),
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
    dataset.frames = String(this.frames);
    dataset.camera = `${x.toFixed(2)} ${y.toFixed(2)}`;
    dataset.metresHigh = this.camera.metresHigh.toFixed(2);
    dataset.climber = `${climber.x.toFixed(2)} ${climber.y.toFixed(2)}`;
  }
}
