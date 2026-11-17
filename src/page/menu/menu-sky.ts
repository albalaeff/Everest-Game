import type { Point } from "../../physics";
import { Palette } from "../../rendering/palette";
import { Elevation } from "./elevation";
import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

/** A star of the start's sky: where it is, its radius, how bright, its colour, and, if it
 * twinkles, how deep and on what clock, in seconds. */
export interface MenuStar {
  readonly at: Point;
  readonly size: number;
  readonly light: number;
  readonly colour: number;
  readonly twinkle: "deep" | "faint" | null;
  readonly seconds: number;
  readonly delay: number;
}

/** A flake of the snow that falls across the picture, or a puff of the summit's plume: its place
 * or its size, how bright, and its clock, in seconds. */
export interface Flake {
  readonly at: Point;
  readonly size: number;
  readonly light: number;
  readonly seconds: number;
  readonly delay: number;
}

/** A bank of mist in the valleys: an ellipse, how thick, and which of the two drifts it's on. */
export interface Mist {
  readonly at: Point;
  readonly across: number;
  readonly deep: number;
  readonly light: number;
  readonly slow: boolean;
}

/**
 * The air of the start's picture: the stars over the mountains, a few of them bright, the snow
 * that falls across it, the plume the south-west wind blows off Everest's summit, to the left
 * from this side, and the mist in the valleys. All of it is where a seeded generator of the
 * picture's own puts it; the page's style sheet moves it.
 */
export class MenuSky {
  private static readonly STARS = 280;
  /** How far down the picture the stars reach: the mountains cover the sky below. */
  private static readonly STARS_DOWN_TO = 600;
  private static readonly TINTS: readonly number[] = [
    Palette.STAR,
    Palette.STAR,
    0xdfe8ff,
    0xfff1dc,
  ];
  private static readonly BRIGHT = Polyline.of(
    ...[1242, 96, 486, 58, 1478, 236, 118, 212, 1012, 44, -170, 120, 1760, 150],
  );
  private static readonly FLAKES = 62;
  private static readonly PUFFS = 9;
  /** The plume's banner and its bright core, in pixels from the summit: it streams to the left. */
  private static readonly BANNER = Polyline.of(
    ...[2, -2, -20, -10, -60, -19, -110, -27, -170, -33, -240, -37, -304, -36, -350, -30],
    ...[-304, -13, -240, -9, -170, -7, -110, -4, -60, 0, -18, 3],
  );
  private static readonly CORE = Polyline.of(
    ...[2, -2, -24, -8, -60, -13, -100, -16, -144, -17, -100, -8, -60, -3, -24, 1],
  );

  readonly stars: readonly MenuStar[];
  readonly flakes: readonly Flake[];
  /** The plume's puffs: each one's size is its ellipse's radii across and down. */
  readonly puffs: readonly Flake[];
  readonly mists: readonly Mist[] = [
    { at: { x: 470, y: 722 }, across: 460, deep: 24, light: 0.2, slow: false },
    { at: { x: 1290, y: 780 }, across: 420, deep: 20, light: 0.15, slow: true },
    { at: { x: 250, y: 640 }, across: 330, deep: 17, light: 0.13, slow: true },
    { at: { x: 1010, y: 700 }, across: 230, deep: 12, light: 0.11, slow: false },
    { at: { x: -120, y: 700 }, across: 300, deep: 22, light: 0.16, slow: true },
    { at: { x: 1780, y: 800 }, across: 300, deep: 18, light: 0.13, slow: false },
  ];

  constructor() {
    const random = new PictureRandom(29032);
    const scattered = Array.from({ length: MenuSky.STARS }, (): MenuStar => {
      const at = {
        x: random.within(Elevation.LEFT, Elevation.RIGHT),
        y: random.fraction() ** 1.35 * MenuSky.STARS_DOWN_TO,
      };
      const size = 0.45 + random.fraction() ** 6 * 1.25 + random.fraction() * 0.35;
      const light = 0.28 + random.fraction() * 0.6;
      const kind = random.fraction();
      const colour = MenuSky.TINTS[Math.floor(random.fraction() * MenuSky.TINTS.length)];
      return {
        at,
        size,
        light,
        colour: colour ?? Palette.STAR,
        twinkle: kind < 0.24 ? "deep" : kind < 0.42 ? "faint" : null,
        seconds: random.within(2.4, 7),
        delay: random.within(0, 7),
      };
    });
    const bright = MenuSky.BRIGHT.points.map((at, index): MenuStar => ({
      at,
      size: 1.7,
      light: 0.95,
      colour: Palette.STAR,
      twinkle: "deep",
      seconds: 5.3,
      delay: index,
    }));
    this.stars = [...scattered, ...bright];

    const snow = new PictureRandom(2607);
    this.flakes = Array.from({ length: MenuSky.FLAKES }, (): Flake => {
      const size = snow.within(0.6, 1.9);
      const seconds = snow.within(9, 19) * (1.5 - size * 0.3);
      return {
        at: { x: snow.within(-220, 2300), y: snow.within(-260, 860) },
        size,
        light: snow.within(0.25, 0.75),
        seconds,
        delay: snow.within(0, seconds),
      };
    });

    const wind = new PictureRandom(8849);
    this.puffs = Array.from({ length: MenuSky.PUFFS }, (_, index): Flake => {
      return {
        at: { x: wind.within(9, 14), y: wind.within(4, 6.5) },
        size: 1,
        light: 1,
        seconds: wind.within(8.5, 12.5),
        delay: index * 1.25 + wind.fraction(),
      };
    });
  }

  /** The bright stars, which have a halo. */
  get bright(): readonly MenuStar[] {
    return this.stars.slice(MenuSky.STARS);
  }

  /** The plume off a summit, as path data: its long banner and its bright core. */
  plume(summit: Point): { readonly banner: string; readonly core: string } {
    const from = (line: Polyline): string =>
      new Polyline(line.points.map(({ x, y }) => ({ x: summit.x + x, y: summit.y + y }))).path(
        true,
      );
    return { banner: from(MenuSky.BANNER), core: from(MenuSky.CORE) };
  }
}
