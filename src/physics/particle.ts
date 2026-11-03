import type { Point, Terrain } from "./terrain";

/** A particle as saves keep it: where it is, and where it was a sub-step before. */
export type ParticleSave = readonly [x: number, y: number, oldX: number, oldY: number];

/**
 * A point mass: a falling climber's body, or a point of a rope. Verlet integration keeps where it
 * is and where it was a sub-step ago, and the difference is its speed, so whatever moves it, the
 * ground or a rope, changes its speed too.
 */
export class Particle implements Point {
  constructor(
    private ownX: number,
    private ownY: number,
    private oldX = ownX,
    private oldY = ownY,
  ) {}

  static load([x, y, oldX, oldY]: ParticleSave): Particle {
    return new Particle(x, y, oldX, oldY);
  }

  get x(): number {
    return this.ownX;
  }

  get y(): number {
    return this.ownY;
  }

  save(): ParticleSave {
    return [this.ownX, this.ownY, this.oldX, this.oldY];
  }

  /** Its speed over the last sub-step, of `seconds`, in metres a second. */
  speed(seconds: number): number {
    return this.moved() / seconds;
  }

  /** How far it went in the last sub-step, in metres. */
  moved(): number {
    const x = this.ownX - this.oldX;
    const y = this.ownY - this.oldY;
    return Math.sqrt(x * x + y * y);
  }

  /** Goes on at its speed, pulled down by `gravity`, for a sub-step of `seconds`. */
  integrate(gravity: number, seconds: number): void {
    const { ownX: x, ownY: y } = this;
    this.ownX += x - this.oldX;
    this.ownY += y - this.oldY - gravity * seconds * seconds;
    this.oldX = x;
    this.oldY = y;
  }

  shift(x: number, y: number): void {
    this.ownX += x;
    this.ownY += y;
  }

  /**
   * Puts it back on the surface if it's gone into the ground, and lets friction take from its
   * slide over the surface what Coulomb's law gives: up to `friction` times the depth it was
   * pushed out. On a slope that comes to gravity's pull down it less `friction` times the push
   * into it, and a slope gentle enough holds it still. Says whether it touched the ground.
   */
  land(terrain: Terrain, friction: number): boolean {
    if (!terrain.holds(this)) {
      return false;
    }
    const surface = terrain.nearest(this);
    const outX = surface.x - this.ownX;
    const outY = surface.y - this.ownY;
    const depth = Math.sqrt(outX * outX + outY * outY);
    this.ownX = surface.x;
    this.ownY = surface.y;
    if (depth === 0) {
      return true;
    }
    const acrossX = -outY / depth;
    const acrossY = outX / depth;
    const slide = (this.ownX - this.oldX) * acrossX + (this.ownY - this.oldY) * acrossY;
    const grip = friction * depth;
    const kept = Math.abs(slide) <= grip ? 0 : slide > 0 ? slide - grip : slide + grip;
    this.ownX += (kept - slide) * acrossX;
    this.ownY += (kept - slide) * acrossY;
    return true;
  }
}
