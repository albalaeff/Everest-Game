import type { Point } from "../../physics";
import { Palette } from "../../rendering/palette";
import type { Shape } from "./face";
import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

/** A prayer flag on its string: where it hangs from, how the string tilts there, in degrees,
 * its colour, and its flutter's clock, in seconds. */
export interface Flag {
  readonly at: Point;
  readonly tilt: number;
  readonly colour: number;
  readonly seconds: number;
  readonly delay: number;
}

/** A string of prayer flags: its sagging line as path data, and its flags. */
export interface FlagString {
  readonly path: string;
  readonly flags: readonly Flag[];
}

/**
 * The prayer flags of the ridge the viewer stands on, as on Kala Patthar's top: a cairn with a
 * pole, and strings of flags from it, in the flags' five colours in their order, as over Base
 * Camp (`Palette.PRAYER_FLAGS`), streaming to the left on the same wind as the plume.
 */
export class MenuFlags {
  /** The pole's foot and its top, where the strings are tied. */
  private static readonly FOOT: Point = { x: 1457, y: 716 };
  private static readonly TOP: Point = { x: 1457, y: 684 };
  /** Each string: where it sags through, where it ends, and how many flags it carries. */
  private static readonly STRINGS: readonly (readonly [Point, Point, number])[] = [
    [{ x: 1640, y: 664 }, { x: 1900, y: 452 }, 34],
    [{ x: 1352, y: 772 }, { x: 1246, y: 822 }, 19],
    [{ x: 1640, y: 760 }, { x: 1900, y: 742 }, 30],
  ];
  /** A flag's size, in pixels: its outline hangs from the middle of its top edge. */
  static readonly FLAG = Polyline.of(-5.75, 0, 5.75, 0, 5.15, 14.5, -4.95, 13.5).path(true);
  private static readonly STONE = 0x06091a;
  private static readonly STONE_LIT = 0x0b0f26;

  readonly strings: readonly FlagString[];
  /** The cairn's stones, from the lowest up. */
  readonly cairn: readonly Shape[] = [
    {
      path: Polyline.of(1436, 746, 1442, 731, 1454, 728, 1466, 733, 1472, 746).path(true),
      fill: MenuFlags.STONE,
    },
    {
      path: Polyline.of(1443, 731, 1447, 722, 1459, 720, 1464, 730).path(true),
      fill: MenuFlags.STONE_LIT,
    },
    {
      path: Polyline.of(1448, 722, 1451, 714, 1460, 713, 1462, 721).path(true),
      fill: MenuFlags.STONE,
    },
  ];
  readonly pole = new Polyline([MenuFlags.FOOT, MenuFlags.TOP]).path();

  constructor() {
    const random = new PictureRandom(108);
    const from = MenuFlags.TOP;
    this.strings = MenuFlags.STRINGS.map(([through, to, count]) => {
      const at = (share: number): Point => ({
        x: (1 - share) ** 2 * from.x + 2 * (1 - share) * share * through.x + share ** 2 * to.x,
        y: (1 - share) ** 2 * from.y + 2 * (1 - share) * share * through.y + share ** 2 * to.y,
      });
      const flags = Array.from({ length: count }, (_, index): Flag => {
        const share = (index + 0.7) / (count + 0.4);
        const here = at(share);
        const ahead = at(share + 0.01);
        const tilt = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
        return {
          at: here,
          // A flag hangs under its string, whichever way the string runs.
          tilt: tilt > 90 ? tilt - 180 : tilt < -90 ? tilt + 180 : tilt,
          colour: Palette.PRAYER_FLAGS[index % Palette.PRAYER_FLAGS.length] ?? Palette.STAR,
          delay: random.within(0, 2.4),
          seconds: random.within(1.25, 1.95),
        };
      });
      const numbers = [from, through, to].map(({ x, y }) => `${x} ${y}`);
      return { path: `M${numbers[0] ?? ""}Q${numbers[1] ?? ""} ${numbers[2] ?? ""}`, flags };
    });
  }
}
