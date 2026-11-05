import { Particle, ParticleContainer, Texture } from "pixi.js";

import { SeededRandom } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import { ParallaxLayer } from "./parallax-layer";
import { Snowfall } from "./snowfall";

/**
 * The falling snow, on the screen in front of everything: one particle a flake, as many as the
 * quality allows, of which the weather's share falls and the rest wait off the screen; the wind's
 * gust blows them all sideways, so their slant tells the wind at the climber.
 */
export class SnowLayer extends ParallaxLayer {
  /** The snow's own seed: the picture's, not the expedition's. */
  private static readonly SEED = 42;
  private static readonly ALPHA = 0.85;
  /** How hard the full gust blows the flakes sideways, in pixels a second. */
  private static readonly WIND_PIXELS_A_SECOND = 320;
  /** Where a flake waits while the weather doesn't need it. */
  private static readonly PARKED = -20;

  private readonly snowfall: Snowfall;
  private readonly particles: readonly Particle[];

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
    this.addChild(container);
  }

  /** How many flakes the layer has: the quality's budget. */
  get flakes(): number {
    return this.particles.length;
  }

  /** Screen space: the layer stays put, and the snow fits the screen. */
  override place(camera: Camera): void {
    const { width, height } = camera.screen;
    this.snowfall.resize(width, height);
  }

  /** `seconds` more of snow in this frame's air: the weather's share of the flakes, on the gust. */
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
  }
}
