import type { Point } from "../physics";
import type { SeededRandom } from "../simulation";
import { Noise } from "./noise";
import { Palette } from "./palette";

/** Where a point of the picture is on a wall's face (`IceWall`), in metres. */
export interface ReliefPlace {
  /** How far into the ice from the face's edge; negative out over the drop. */
  readonly across: number;
  /** How far back into the ice the face's bare ice shows at this height. */
  readonly deep: number;
  /** How far down from the wall's top. */
  readonly down: number;
  /** How far the face leans out here past the wall under it: a bulge under the lip, or nothing. */
  readonly lean: number;
  /** How far up from the wall's foot, and how high the drift of snow lies against the face
   * there. */
  readonly up: number;
  readonly bank: number;
}

/** The box a relief is drawn in, in the layer's metres, y up: its left, its top edge, and its
 * size. */
export interface ReliefBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What a wall's ice is like, each 0 to 1, drawn from its seed (#290): how much snow lies on it,
 * how fluted it hangs, how its ice is coloured, from grey-white to aqua, and how pitted with
 * scallops it is. */
export interface IceCharacter {
  readonly snow: number;
  readonly fluting: number;
  readonly aqua: number;
  readonly pitted: number;
}

/**
 * The ice of a wall's face as the Icefall's photos show it (#290), worked out as a relief and lit:
 * flutes running down it, big lobes swelling it, drip lines across it where the ice hangs over in
 * tiers with icicles under them, scallops pitting it, and snow on its top, its ledges and in
 * patches, or over most of a snowy wall. The light comes from above and from the open side, so
 * each flute has a lit side and a shaded one, the hollows and the undersides of the tiers are
 * blue, and the wet ice throws the light back in highlights. Each wall draws its own character
 * from its seed, so no two are alike. Its lumps stand out past the face's edge, so the wall's
 * outline is uneven, and its ice fades out where the face goes back into the glacier, on a ragged
 * line.
 *
 * Pure: pixels by day, for the hour to tint, and the highlights apart, for the sky's light at
 * night and a lamp's; the layer makes its textures of them. Its sizes are the drawing's numbers.
 */
export class IceRelief {
  /** How fine it's drawn. */
  static readonly PIXELS_A_METRE = 64;
  /** How far past the face's edge, out over the drop, its lumps may stand. */
  static readonly PROUD = 0.1;
  /** The chance a wall is snowy, how snowy it is then, and how snowy at most otherwise; how fluted
   * and how pitted a wall is, from the least to the most. */
  private static readonly SNOWY = { chance: 0.3, min: 0.55, max: 0.95, otherwise: 0.3 };
  private static readonly FLUTING = { min: 0.45, max: 1 };
  private static readonly PITTED = { min: 0.15, max: 1 };

  readonly character: IceCharacter;
  /** How many pixels across and down it is. */
  readonly columns: number;
  readonly rows: number;
  /** Its ice by day, four bytes a pixel, red, green, blue and how solid, row by row from the top
   * left. */
  readonly ice: Uint8ClampedArray;
  /** Its highlights alone, white and as strong as each is, as `ice` is laid out. */
  readonly gloss: Uint8ClampedArray;
  /** The points a lamp's beam makes shine, in the layer's metres: its strongest highlights. */
  readonly shines: readonly Point[];

  /** The relief of the face in `box`, `place` saying where each point of it is on the face, or
   * null above its top and below its foot, laid out by `random`. */
  constructor(
    readonly box: ReliefBox,
    place: (x: number, y: number) => ReliefPlace | null,
    random: SeededRandom,
  ) {
    const { SNOWY, FLUTING, PITTED, PIXELS_A_METRE: fine } = IceRelief;
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    this.character = {
      snow: random.chance(SNOWY.chance) ? between(SNOWY) : random.fraction() ** 2 * SNOWY.otherwise,
      fluting: between(FLUTING),
      aqua: random.fraction(),
      pitted: between(PITTED),
    };
    this.columns = Math.max(1, Math.ceil(box.width * fine));
    this.rows = Math.max(1, Math.ceil(box.height * fine));
    const layout = new ReliefLayout(this.character, box, this.columns, this.rows, random);
    layout.raise(place);
    this.ice = new Uint8ClampedArray(this.columns * this.rows * 4);
    this.gloss = new Uint8ClampedArray(this.columns * this.rows * 4);
    this.shines = layout.light(this.ice, this.gloss);
  }
}

/** How an `IceRelief` is worked out: the face raised point by point, then lit. Kept apart from the
 * relief, which holds only what comes of it. */
class ReliefLayout {
  /** The flutes: so many across a metre, so slowly changing down it, standing so high, with finer
   * ones on them, and wandering so far aside as they go down. */
  private static readonly FLUTES = {
    across: 3.1,
    down: 0.16,
    high: 0.16,
    fine: 0.05,
    wander: 0.22,
  };
  /** The lobes that swell the face, and the pits melted into it: how big across, and how high. */
  private static readonly LOBES = { across: 0.7, down: 0.5, high: 0.24 };
  private static readonly PITS = { across: 6.5, high: 0.04 };
  /** The tiers the ice hangs in: a drip line every so many metres down, ragged by so much, with
   * icicles under it up to so long; the ice under it set back so far, coming forward again over
   * so many metres; and the shadow under the line, so dark, fading over so many metres. */
  private static readonly TIERS = {
    every: { min: 1.2, max: 2.3 },
    ragged: 0.4,
    icicles: { across: 10, from: 0.58, long: 1.3 },
    back: 0.2,
    forward: 0.8,
    shadow: 0.5,
    shadowDown: 0.4,
  };
  /** How much of a bulge's lean shows as relief, so its underside is in shade. */
  private static readonly LEAN = 0.9;
  /** The snow: on a snowy wall, a mantle down from the top so far at the least and the most; in
   * patches where its noise is over a threshold that falls as the wall is snowier; and on ledges,
   * where the ice juts out this much for each metre down. */
  private static readonly MANTLE = { from: 0.5, least: 0.35, most: 1.5 };
  private static readonly PATCHES = { bare: 0.74, snowier: 0.36 };
  private static readonly LEDGE = 0.55;
  /** The light: where it comes from, across the face from the open side, from above, and from in
   * front; how much the sky lights what faces away from it; how tight the wet ice's highlights
   * are, and how strong; and the light through the thin ice at the face's edge, over so far. */
  private static readonly LIGHT = { across: -0.5, down: -0.62, out: 0.6 };
  private static readonly SKY = 0.3;
  private static readonly SHINE = { tight: 22, strong: 1 };
  /** How much of the light that falls full on the ice shows in its highlights too, over so much
   * light, so the lit sides of its flutes show under the night's sky. */
  private static readonly GLOW = { over: 0.62, strong: 1.1 };
  /** How ragged the snow's edges are: so fine, by so much of its threshold. */
  private static readonly SNOW_EDGE = { across: 4.3, by: 0.22 };
  private static readonly RIM = { over: 0.07, light: 0.45 };
  /** How much darker the grooves between the flutes are; and how much darker the ice gets down a
   * tall face, over so many metres. */
  private static readonly GROOVES = 0.3;
  private static readonly DOWN = { over: 12, darker: 0.28 };
  /** Where across the face its ice starts to fade into the glacier, and how ragged the line is. */
  private static readonly FADE = { from: 0.45, ragged: 0.2 };
  /** A lamp makes its strongest highlight shine in each patch of the face so big, if it's this
   * strong. */
  private static readonly SHINES = { patch: 0.3, least: 0.25 };

  private readonly noise: Noise;
  /** The drip lines, each so far down the wall, with its own place in the noise. */
  private readonly tiers: readonly { readonly down: number; readonly seed: number }[];
  /** Each pixel's height, how far across and down the face it is, how solid, how deep in a groove
   * or a tier's shadow, and whether snow lies on it by where it is. */
  private readonly heights: Float32Array;
  private readonly across: Float32Array;
  private readonly down: Float32Array;
  private readonly solid: Float32Array;
  private readonly hollow: Float32Array;
  private readonly snowed: Uint8Array;
  private readonly chance: Float32Array;

  constructor(
    private readonly character: IceCharacter,
    private readonly box: ReliefBox,
    private readonly columns: number,
    private readonly rows: number,
    random: SeededRandom,
  ) {
    const { TIERS } = ReliefLayout;
    this.noise = new Noise(random);
    const tiers: { down: number; seed: number }[] = [];
    let down = 0.5 + random.fraction() * TIERS.every.max;
    while (down < box.height - 0.4) {
      tiers.push({ down, seed: random.fraction() * 50 });
      down += TIERS.every.min + random.fraction() * (TIERS.every.max - TIERS.every.min);
    }
    this.tiers = tiers;
    const count = columns * rows;
    this.heights = new Float32Array(count);
    this.across = new Float32Array(count);
    this.down = new Float32Array(count);
    this.solid = new Float32Array(count);
    this.hollow = new Float32Array(count);
    this.snowed = new Uint8Array(count);
    this.chance = new Float32Array(count);
  }

  /** The face raised: each pixel's height off the wall, and what else the light needs of it. */
  raise(place: (x: number, y: number) => ReliefPlace | null): void {
    const { PIXELS_A_METRE: fine, PROUD } = IceRelief;
    const { FADE, MANTLE, PATCHES, SNOW_EDGE } = ReliefLayout;
    const { box, columns, rows, noise } = this;
    const { snow } = this.character;
    const mantle =
      snow >= MANTLE.from
        ? MANTLE.least + (MANTLE.most - MANTLE.least) * (snow - MANTLE.from) * 2
        : 0;
    for (let row = 0; row < rows; row += 1) {
      const y = box.top - (row + 0.5) / fine;
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const at = place(box.left + (column + 0.5) / fine, y);
        if (at === null || at.deep <= 0) {
          continue;
        }
        const u = Math.max(at.across, 0);
        const { height, hollow } = this.heightAt(u, at.down, at.lean);
        // Its lumps stand out past the face's edge; its ice fades out on a ragged line inside.
        const proud = Math.min(Math.max(this.heightAt(0, at.down, at.lean).height * 0.7, 0), PROUD);
        const share =
          at.across / at.deep + FADE.ragged * (noise.at(at.down * 2.3 + 91.7, u * 1.9) - 0.5);
        const fade = 1 - Math.min(Math.max((share - FADE.from) / (1 - FADE.from), 0), 1);
        this.heights[index] = height;
        this.across[index] = at.across;
        this.down[index] = at.down;
        this.hollow[index] = hollow;
        this.solid[index] = at.across < -proud ? 0 : fade * fade * (3 - 2 * fade);
        const patch = noise.fractal(u * 1.05 + 50.3, at.down * 1.25 + 60.7, 2);
        this.chance[index] = patch;
        // The snow's edges are ragged: its mantle from the top, its bank against the foot, and
        // its patches.
        const edge =
          1 +
          SNOW_EDGE.by *
            (noise.fractal(u * SNOW_EDGE.across + 70.9, at.down * SNOW_EDGE.across + 80.3, 2) -
              0.5) *
            2;
        const top = mantle * (0.45 + 1.1 * noise.at(u * 1.2 + 40.1, 2.2)) * edge;
        const bank = at.bank * (1 - 0.55 * Math.min(1, u / Math.max(at.deep, 0.01))) * edge;
        this.snowed[index] =
          at.down < top ||
          at.up < bank ||
          patch > (PATCHES.bare - PATCHES.snowier * snow) * (2 - edge)
            ? 1
            : 0;
      }
    }
  }

  /** The face lit: its ice by day into `ice`, its highlights into `gloss`, and the points a lamp
   * makes shine. */
  light(ice: Uint8ClampedArray, gloss: Uint8ClampedArray): Point[] {
    const { PIXELS_A_METRE: fine } = IceRelief;
    const { LIGHT, SKY, SHINE, GLOW, RIM, GROOVES, DOWN, LEDGE, SHINES, TIERS } = ReliefLayout;
    const { box, columns, rows, heights, solid } = this;
    const { aqua, snow } = this.character;
    const lightLength = Math.hypot(LIGHT.across, LIGHT.down, LIGHT.out);
    const light = [
      LIGHT.across / lightLength,
      LIGHT.down / lightLength,
      LIGHT.out / lightLength,
    ] as const;
    // Half way between the light and the eye, which looks straight at the face.
    const halfLength = Math.hypot(light[0], light[1], light[2] + 1);
    const half = [
      light[0] / halfLength,
      light[1] / halfLength,
      (light[2] + 1) / halfLength,
    ] as const;
    const patch = Math.max(1, Math.round(SHINES.patch * fine));
    const strongest = new Map<number, { shine: number; point: Point }>();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const alpha = solid[index] ?? 0;
        if (alpha <= 0) {
          continue;
        }
        const here = heights[index] ?? 0;
        const beside = (other: number, inRange: boolean): number =>
          inRange && (solid[other] ?? 0) > 0 ? (heights[other] ?? here) : here;
        const slopeAcross =
          ((beside(index + 1, column + 1 < columns) - beside(index - 1, column > 0)) * fine) / 2;
        const slopeDown =
          ((beside(index + columns, row + 1 < rows) - beside(index - columns, row > 0)) * fine) / 2;
        const down = this.down[index] ?? 0;
        const across = this.across[index] ?? 0;
        // Snow lies where it's plastered, and on the ledges, where the ice juts out going down.
        const ledge = slopeDown > LEDGE && (this.chance[index] ?? 0) > 0.5 - 0.3 * snow;
        const snowy = this.snowed[index] === 1 || ledge;
        const soft = snowy ? 0.3 : 1;
        const length = Math.hypot(slopeAcross * soft, slopeDown * soft, 1);
        const normal = [
          (-slopeAcross * soft) / length,
          (-slopeDown * soft) / length,
          1 / length,
        ] as const;
        const facing = Math.max(
          0,
          normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2],
        );
        const hollow = snowy ? 0 : (this.hollow[index] ?? 0);
        const lit =
          (SKY + (1 - SKY) * facing) *
          (1 - GROOVES * Math.min(hollow, 1)) *
          (1 - Math.min(Math.max(hollow - 1, 0), 1) * TIERS.shadow) *
          (1 - DOWN.darker * Math.min(1, down / DOWN.over));
        let colour = snowy
          ? Palette.mix(Palette.SNOW_SHADE, 0xffffff, lit)
          : Palette.ice(aqua, lit);
        const shine = snowy
          ? 0
          : Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]) **
              SHINE.tight *
            SHINE.strong;
        const rim = snowy ? 0 : RIM.light * Math.max(0, 1 - Math.max(across, 0) / RIM.over);
        const bright = Math.min(1, shine + rim);
        colour = Palette.mix(colour, 0xffffff, bright);
        // Its highlights, and what the light falls full on: the sky's light at night shows both.
        const glow = snowy ? 0 : Math.max(0, lit - GLOW.over) * GLOW.strong;
        const { red, green, blue } = Palette.channels(colour);
        const byte = index * 4;
        ice[byte] = red;
        ice[byte + 1] = green;
        ice[byte + 2] = blue;
        ice[byte + 3] = Math.round(alpha * 255);
        gloss[byte] = 255;
        gloss[byte + 1] = 255;
        gloss[byte + 2] = 255;
        gloss[byte + 3] = Math.round(Math.min(1, bright + glow) * alpha * 255);
        if (shine >= SHINES.least && alpha > 0.5) {
          const cell = Math.floor(row / patch) * columns + Math.floor(column / patch);
          if (shine > (strongest.get(cell)?.shine ?? 0)) {
            strongest.set(cell, {
              shine,
              point: { x: box.left + (column + 0.5) / fine, y: box.top - (row + 0.5) / fine },
            });
          }
        }
      }
    }
    return [...strongest.values()].map(({ point }) => point);
  }

  /** How high the ice stands off the wall `across` metres into the face and `down` from its top,
   * where the face leans out `lean`; and how deep in a groove it is there, 0 to 1, and past 1 in
   * the shadow under a tier's drip line. */
  private heightAt(across: number, down: number, lean: number): { height: number; hollow: number } {
    const { FLUTES, LOBES, PITS, TIERS, LEAN } = ReliefLayout;
    const { noise } = this;
    const { fluting, pitted } = this.character;
    const aside = across + FLUTES.wander * (noise.at(down * 0.6, 3.3) - 0.5);
    const ridge = noise.ridged(aside * FLUTES.across, down * FLUTES.down + 7.1);
    const fine = noise.ridged(aside * FLUTES.across * 2.6 + 11.3, down * FLUTES.down * 2.2 + 1.7);
    const lobes = noise.fractal(across * LOBES.across + 21.9, down * LOBES.down + 5.3, 3);
    const pits = noise.at(across * PITS.across + 31.1, down * PITS.across + 17.7);
    let height =
      FLUTES.high * fluting * ridge ** 1.4 +
      FLUTES.fine * fluting * fine +
      LOBES.high * (lobes - 0.5) +
      PITS.high * pitted * (pits - 0.5) +
      LEAN * lean;
    let hollow = fluting * (1 - ridge) ** 1.5;
    for (const tier of this.tiers) {
      const { icicles } = TIERS;
      const ragged = TIERS.ragged * (noise.at(across * 3.3 + tier.seed, 0.5) - 0.5);
      const icicle =
        (Math.max(0, noise.at(across * icicles.across + tier.seed * 3.1, 9.5) - icicles.from) /
          (1 - icicles.from)) *
        icicles.long;
      const under = down - (tier.down + ragged + icicle);
      if (under > 0) {
        height -= TIERS.back * Math.exp(-under / TIERS.forward);
        hollow += 1 + Math.exp(-under / TIERS.shadowDown);
      }
    }
    return { height, hollow };
  }
}
