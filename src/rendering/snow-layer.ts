import { FillGradient, Graphics, Particle, ParticleContainer, Texture } from "pixi.js";

import { SeededRandom } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { Snowfall } from "./snowfall";

/**
 * The falling snow, on the screen in front of everything: one particle a flake, as many as the
 * quality allows, of which the weather's share falls and the rest wait off the screen; the wind's
 * gust blows them all sideways, so their slant tells the wind at the climber. Behind the flakes,
 * in snow, a thin mist that clears around the climber, so the rope ahead still shows
 * (docs/guidelines/graphics.md → weather never hides what the player needs).
 */
export class SnowLayer extends ParallaxLayer {
  /** The snow's own seed: the picture's, not the expedition's. */
  private static readonly SEED = 42;
  private static readonly ALPHA = 0.85;
  /** How hard the full gust blows the flakes sideways, in pixels a second. */
  private static readonly WIND_PIXELS_A_SECOND = 320;
  /** Where a flake waits while the weather doesn't need it. */
  private static readonly PARKED = -20;
  /** The mist: how far around the climber it's clear, and from how far it's at its thickest, in
   * the screen's heights. */
  private static readonly MIST_CLEAR = 0.2;
  private static readonly MIST_FULL = 0.65;

  private readonly snowfall: Snowfall;
  private readonly particles: readonly Particle[];
  private readonly mist = new Graphics();
  private mistGradient: FillGradient | null = null;
  private mistFor = { width: 0, height: 0 };

  constructor(flakes: number, width: number, height: number) {
    super("snow", { x: 0, y: 0 });
    this.snowfall = new Snowfall(flakes, width, height, SeededRandom.fromSeed(SnowLayer.SEED));
    const texture = Texture.WHITE;
    const container = new ParticleContainer({
      dynamicProperties: {
        position: true,
        vertex: false,
        rotation: false,
        uvs: false,
        color: false,
      },
    });
    this.particles = this.snowfall.flakes.map((flake) => {
      const particle = new Particle({
        texture,
        x: flake.x,
        y: flake.y,
        scaleX: flake.size / texture.width,
        scaleY: flake.size / texture.height,
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: SnowLayer.ALPHA,
      });
      container.addParticle(particle);
      return particle;
    });
    this.mist.visible = false;
    this.addChild(this.mist, container);
  }

  /** How many flakes the layer has: the quality's budget. */
  get flakes(): number {
    return this.particles.length;
  }

  /** Screen space: the layer stays put, the snow fits the screen, and the mist's clearing is
   * where the climber is on it. */
  override place(camera: Camera): void {
    const { width, height } = camera.screen;
    this.snowfall.resize(width, height);
    if (width !== this.mistFor.width || height !== this.mistFor.height) {
      this.mistFor = { width, height };
      this.drawMist(width, height);
    }
    const { x, y } = camera.toScreen(camera.climber);
    this.mist.position.set(x, y);
  }

  /** `seconds` more of snow in this frame's air: the weather's share of the flakes, on the gust,
   * and the weather's mist in the air's colour. */
  fall(seconds: number, atmosphere: Atmosphere): void {
    const falling = Math.round(this.particles.length * atmosphere.look.snowfall);
    this.snowfall.fall(seconds, atmosphere.gust * SnowLayer.WIND_PIXELS_A_SECOND);
    for (const [index, flake] of this.snowfall.flakes.entries()) {
      const particle = this.particles[index];
      if (particle === undefined) {
        continue;
      }
      if (index < falling) {
        particle.x = flake.x;
        particle.y = flake.y;
      } else {
        particle.x = SnowLayer.PARKED;
        particle.y = SnowLayer.PARKED;
      }
    }
    const { mist } = atmosphere.look;
    this.mist.alpha = mist;
    this.mist.visible = mist > 0;
    this.mist.tint = atmosphere.palette.haze;
  }

  /** The mist, drawn white about the point it clears around, as far as the screen's corners
   * wherever that point is on it. */
  private drawMist(width: number, height: number): void {
    // The stops run from the middle out to the square's half width, the screen's diagonal.
    const reach = Math.hypot(width, height);
    const clear = (SnowLayer.MIST_CLEAR * height) / reach;
    const full = Math.min((SnowLayer.MIST_FULL * height) / reach, 1);
    this.mistGradient?.destroy();
    this.mistGradient = new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: Palette.css(0xffffff, 0) },
        { offset: clear, color: Palette.css(0xffffff, 0) },
        { offset: full, color: Palette.css(0xffffff, 1) },
        { offset: 1, color: Palette.css(0xffffff, 1) },
      ],
      textureSpace: "local",
      textureSize: 512,
    });
    this.mist
      .clear()
      .rect(-reach, -reach, 2 * reach, 2 * reach)
      .fill(this.mistGradient);
  }
}
