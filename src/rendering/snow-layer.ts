import { Particle, ParticleContainer, Texture } from "pixi.js";

import { SeededRandom } from "../simulation";
import type { Camera } from "./camera";
import { ParallaxLayer } from "./parallax-layer";
import { Snowfall } from "./snowfall";

/** The falling snow, on the screen in front of everything: one particle a flake. */
export class SnowLayer extends ParallaxLayer {
  /** The snow's own seed: the picture's, not the expedition's. */
  private static readonly SEED = 42;
  private static readonly ALPHA = 0.85;

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

  get flakes(): number {
    return this.particles.length;
  }

  /** Screen space: the layer stays put, and the snow fits the screen. */
  override place(camera: Camera): void {
    const { width, height } = camera.screen;
    this.snowfall.resize(width, height);
  }

  /** `seconds` more of snow. */
  fall(seconds: number): void {
    this.snowfall.fall(seconds);
    for (const [index, flake] of this.snowfall.flakes.entries()) {
      const particle = this.particles[index];
      if (particle !== undefined) {
        particle.x = flake.x;
        particle.y = flake.y;
      }
    }
  }
}
