import { FillGradient, Graphics, NoiseFilter } from "pixi.js";

import { SeededRandom } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera, ScreenSize } from "./camera";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { Stars } from "./stars";

/**
 * The sky, filling the screen, which it stays on: a gradient of the hour's colours, dark above
 * and paler at the horizon, the top deeper the higher the climber and greyer under cloud, the
 * glow of dawn or dusk low on the side the sun is, and the stars, out at night and gone by day,
 * dimmed by cloud, more of them the thinner the air, each twinkling on the picture's own clock.
 * The gradient is drawn again only when the screen or the colours change; dithered, on a quality
 * that asks, so a dark night doesn't band (docs/guidelines/graphics.md → gradients are dithered).
 */
export class SkyLayer extends ParallaxLayer {
  /** The stars' own seed and count: the picture's, not the expedition's. */
  private static readonly SEED = 7;
  private static readonly STARS = 140;
  /** Where the glow sits: a share of the screen's width from the sun's edge, and of its height
   * up from the bottom; and how wide it spreads, in screen heights. */
  private static readonly GLOW_IN = 0.1;
  private static readonly GLOW_UP = 0.3;
  private static readonly GLOW_REACH = 0.9;
  /** The glow's strength at its middle, at the full glow. */
  private static readonly GLOW_ALPHA = 0.8;
  /** Noise too faint to see, but enough to break the gradient's steps. */
  private static readonly DITHER = 0.04;

  private readonly gradient = new Graphics();
  private readonly glow = new Graphics();
  private readonly stars: Stars;
  private readonly starField = new Graphics();
  private drawnFor: ScreenSize = { width: 0, height: 0 };
  private drawnWith: Atmosphere | null = null;

  constructor(dithered: boolean) {
    super("sky", { x: 0, y: 0 });
    this.stars = new Stars(SkyLayer.STARS, SeededRandom.fromSeed(SkyLayer.SEED));
    this.addChild(this.gradient, this.glow, this.starField);
    if (dithered) {
      this.gradient.filters = [new NoiseFilter({ noise: SkyLayer.DITHER, seed: SkyLayer.SEED })];
    }
  }

  override place(camera: Camera): void {
    const { width, height } = camera.screen;
    if (width !== this.drawnFor.width || height !== this.drawnFor.height) {
      this.drawnFor = { width, height };
      this.drawnWith = null;
    }
  }

  /** The sky in this frame's light: redrawn when it changes, the stars faded to it and to the
   * cloud, as many of them as the air above lets show. */
  light(atmosphere: Atmosphere): void {
    const { width, height } = this.drawnFor;
    if (width === 0 || height === 0) {
      return;
    }
    if (this.drawnWith === null || atmosphere.recoloured(this.drawnWith)) {
      this.drawGradient(atmosphere, width, height);
      this.drawGlow(atmosphere, width, height);
    }
    this.drawnWith = atmosphere;
    this.starField.alpha = atmosphere.stars;
    this.starField.visible = atmosphere.stars > 0;
    if (this.starField.visible) {
      this.twinkle(atmosphere);
    }
  }

  private drawGradient(atmosphere: Atmosphere, width: number, height: number): void {
    const { palette } = atmosphere;
    const gradient = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: Palette.css(palette.skyTop) },
        { offset: 0.55, color: Palette.css(Palette.mix(palette.skyTop, palette.skyHorizon, 0.5)) },
        { offset: 1, color: Palette.css(palette.skyHorizon) },
      ],
      textureSpace: "local",
    });
    this.gradient.clear().rect(0, 0, width, height).fill(gradient);
  }

  /** The glow of dawn or dusk: a disc of the hour's glow fading out, low on the sun's side, pink
   * before the sun is up and orange as it rises. */
  private drawGlow(atmosphere: Atmosphere, width: number, height: number): void {
    const { glow } = atmosphere;
    const { glowSide } = atmosphere.light;
    const colour = atmosphere.palette.glow;
    this.glow.clear();
    this.glow.visible = glow > 0.01;
    if (!this.glow.visible) {
      return;
    }
    const centre = {
      x: glowSide > 0 ? width * (1 - SkyLayer.GLOW_IN) : width * SkyLayer.GLOW_IN,
      y: height * (1 - SkyLayer.GLOW_UP),
    };
    const reach = height * SkyLayer.GLOW_REACH;
    const gradient = new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: Palette.css(colour, SkyLayer.GLOW_ALPHA * glow) },
        { offset: 0.5, color: Palette.css(colour, SkyLayer.GLOW_ALPHA * glow * 0.35) },
        { offset: 1, color: Palette.css(colour, 0) },
      ],
      textureSpace: "local",
    });
    this.glow.circle(centre.x, centre.y, reach).fill(gradient);
  }

  /** The stars this frame, each as bright as its twinkle and the air have it. */
  private twinkle(atmosphere: Atmosphere): void {
    const { width, height } = this.drawnFor;
    const { elapsed, air } = atmosphere;
    this.starField.clear();
    for (const star of this.stars.stars) {
      const alpha = Stars.twinkle(star, elapsed, air);
      if (alpha > 0) {
        this.starField
          .circle(star.x * width, star.y * height, star.size)
          .fill({ color: Palette.STAR, alpha });
      }
    }
  }
}
