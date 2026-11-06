import type { Point, Terrain } from "./terrain";

/** The real altitude of a section's two ends, in metres, from the knowledge base: plain data, as
 * a layout and a save keep it. */
export type SectionAltitude = {
  readonly start: number;
  readonly end: number;
};

/**
 * The scale a section is drawn at, and the altimeter's reading on it (docs/conventions/slope-physics.md
 * → The slope). Every section is drawn at the same share of life, 1/`route.drawn-scale`, and the
 * mountain's clock runs faster than that, the climber with it, so a section takes its real hours.
 * The real altitude goes from the start's to the end's by the share of the section's width
 * crossed, and the drawn ground's own ups and downs, above and below the straight line between the
 * ends, read at life size: a 10 m fall reads 10 m.
 */
export class SectionScale {
  private readonly first: Point;
  private readonly last: Point;

  constructor(
    terrain: Terrain,
    readonly altitude: SectionAltitude,
  ) {
    this.first = terrain.point(0);
    this.last = terrain.point(terrain.length);
  }

  /** The real altitude at a point of the section, in metres. */
  altitudeAt(point: Point): number {
    const { first, last, altitude } = this;
    const width = last.x - first.x;
    const share = width > 0 ? Math.min(Math.max((point.x - first.x) / width, 0), 1) : 0;
    const line = first.y + (last.y - first.y) * share;
    return altitude.start + (altitude.end - altitude.start) * share + (point.y - line);
  }

  /** How many real metres a drawn metre stands for: the real rise over the drawn one. */
  get ratio(): number {
    const drawn = this.last.y - this.first.y;
    if (drawn === 0) {
      throw new RangeError("A section that neither rises nor falls has no scale of its own");
    }
    return (this.altitude.end - this.altitude.start) / drawn;
  }
}
