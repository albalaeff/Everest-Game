import type { Point, Terrain } from "../physics";
import type { CampStretch } from "./camp-signs";

/** A flag on its string: its top corners, where it's tied on, its colour, and where in its
 * flutter it starts. */
interface Flag {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly colour: number;
  readonly phase: number;
}

/**
 * The prayer flags over Base Camp (docs/guidelines/graphics.md → Motion): strings of them from the
 * top of a mast between the tents down to the snow each side, sagging between, the flags in their
 * five colours in turn. In a calm they hang straight down; the gust blows them out the way the
 * wind blows, and they flutter on it, each a little after the one before. The drawing is the
 * layer's; this is where the mast, the strings and the flags are.
 */
export class PrayerFlags {
  /** How high the mast stands, how far along the camp from its start, and how far each side of
   * it the strings come down to the snow. */
  static readonly MAST_METRES = 5;
  private static readonly MAST_ALONG = 2.5;
  private static readonly REACH_METRES = 7;
  /** How far a string sags in its middle, and in how many pieces it's drawn. */
  private static readonly SAG_METRES = 0.35;
  private static readonly PIECES = 16;
  /** The flags: how far apart along a string, how wide, how far down they hang, between which
   * shares of the string; how many colours there are in turn. */
  private static readonly SPACING_METRES = 0.42;
  static readonly WIDTH_METRES = 0.3;
  static readonly DROP_METRES = 0.24;
  private static readonly FROM = 0.04;
  private static readonly TO = 0.95;
  static readonly COLOURS = 5;
  /** How far round from hanging straight down the full gust blows a flag, in radians, how far it
   * flutters either side of that, how often, and how far behind the near corner the far one is. */
  private static readonly BLOWN = 1.25;
  private static readonly FLUTTER = 0.35;
  private static readonly FLUTTER_HZ = 1.6;
  private static readonly LAG = 0.9;

  readonly mast: { readonly foot: Point; readonly top: Point };
  readonly strings: readonly (readonly Point[])[];
  private readonly flags: readonly Flag[];

  constructor(terrain: Terrain, camp: CampStretch) {
    const foot = terrain.point(camp.from + PrayerFlags.MAST_ALONG);
    const top = { x: foot.x, y: foot.y + PrayerFlags.MAST_METRES };
    this.mast = { foot, top };
    const ends = [-1, 1].map((side) => {
      const x = foot.x + side * PrayerFlags.REACH_METRES;
      return { x, y: terrain.height(x) };
    });
    this.strings = ends.map((end) =>
      Array.from({ length: PrayerFlags.PIECES + 1 }, (_, piece) =>
        PrayerFlags.on(top, end, piece / PrayerFlags.PIECES),
      ),
    );
    const flags: Flag[] = [];
    for (const end of ends) {
      const length = Math.hypot(end.x - top.x, end.y - top.y);
      const width = PrayerFlags.WIDTH_METRES / length;
      let colour = 0;
      for (
        let share = PrayerFlags.FROM;
        share + width <= PrayerFlags.TO;
        share += PrayerFlags.SPACING_METRES / length
      ) {
        // Tied on top-first along the string, so the near corner is the one nearer the mast.
        const near = PrayerFlags.on(top, end, share);
        const far = PrayerFlags.on(top, end, share + width);
        flags.push({
          x0: near.x,
          y0: near.y,
          x1: far.x,
          y1: far.y,
          colour: colour % PrayerFlags.COLOURS,
          phase: 0.13 * flags.length,
        });
        colour += 1;
      }
    }
    this.flags = flags;
  }

  /** How many flags there are. */
  get count(): number {
    return this.flags.length;
  }

  /** Each flag at `elapsed` seconds of picture on a gust of `gust`, 0 to 1: its colour, by its
   * place in turn, and its corners round from where it's tied on, the near one first. */
  forEach(
    elapsed: number,
    gust: number,
    draw: (
      colour: number,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x3: number,
      y3: number,
    ) => void,
  ): void {
    const blow = Math.min(Math.max(gust, 0), 1);
    const drop = PrayerFlags.DROP_METRES;
    for (const { x0, y0, x1, y1, colour, phase } of this.flags) {
      const wave = 2 * Math.PI * (PrayerFlags.FLUTTER_HZ * elapsed + phase);
      const near = blow * (PrayerFlags.BLOWN + PrayerFlags.FLUTTER * Math.sin(wave));
      const far =
        blow * (PrayerFlags.BLOWN + PrayerFlags.FLUTTER * Math.sin(wave - PrayerFlags.LAG));
      draw(
        colour,
        x0,
        y0,
        x1,
        y1,
        x1 + drop * Math.sin(far),
        y1 - drop * Math.cos(far),
        x0 + drop * Math.sin(near),
        y0 - drop * Math.cos(near),
      );
    }
  }

  /** The point `share` of the way along a string from the mast's top to its end, sagging. */
  private static on(top: Point, end: Point, share: number): Point {
    return {
      x: top.x + (end.x - top.x) * share,
      y: top.y + (end.y - top.y) * share - 4 * PrayerFlags.SAG_METRES * share * (1 - share),
    };
  }
}
