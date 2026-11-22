import type { Point } from "../physics";
import type { SeededRandom } from "../simulation";
import { Noise } from "./noise";
import { Palette } from "./palette";

/** A wall's face (`IceWall`) at one height, in metres. */
export interface ReliefLevel {
  /** Where the face's edge is across, in the layer's metres: the wall's line, or the nose of a
   * bulge that leans out over it. */
  readonly edge: number;
  /** Which way the ice is from the edge: 1 to the right, -1 to the left. */
  readonly into: 1 | -1;
  /** How far back into the ice from the edge the face's bare ice shows. */
  readonly deep: number;
  /** How far down from the wall's top. */
  readonly down: number;
  /** How far the face leans out here past the wall under it: a bulge under the lip, or nothing. */
  readonly lean: number;
  /** How far up from the wall's foot, and how high the drift of snow lies against the face. */
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
 * columns of ice hanging down it side by side like organ pipes, with a crease between each two,
 * big lobes swelling it, drip lines across it where the ice hangs over in tiers with a fringe of
 * icicles under each, scallops pitting it, and snow on its top, against its foot and on its
 * ledges, or plastered over most of a snowy wall. The light comes from above and from the
 * picture's left, so each column has a lit side and a shaded one, the creases and the undersides
 * of the tiers are deep blue, and the wet ice throws the light back in highlights. Each wall draws
 * its own character from its seed, so no two are alike. Its lumps stand out past the face's edge,
 * so the wall's outline is uneven, and its ice fades out where the face goes back into the
 * glacier, on a ragged line.
 *
 * Pure: pixels by day, for the hour to tint, and apart from them what the ice throws back of the
 * sky's light at night; the layer makes its textures of them. Its sizes are the drawing's numbers.
 */
export class IceRelief {
  /** How fine it's drawn. */
  static readonly PIXELS_A_METRE = 48;
  /** How far past the face's edge, out over the drop, its lumps may stand. */
  static readonly PROUD = 0.1;
  /** The chance a wall is snowy, how snowy it is then, and how snowy at most otherwise, or on a
   * bare wall; how fluted and how pitted a wall is, from the least to the most. */
  private static readonly SNOWY = { chance: 0.3, min: 0.55, max: 0.95, otherwise: 0.3, bare: 0.12 };
  private static readonly FLUTING = { min: 0.45, max: 1 };
  private static readonly PITTED = { min: 0.15, max: 1 };

  readonly character: IceCharacter;
  /** How many pixels across and down it is. */
  readonly columns: number;
  readonly rows: number;
  /** Its ice by day, four bytes a pixel, red, green, blue and how solid, row by row from the top
   * left. */
  readonly ice: Uint8ClampedArray;
  /** What it throws back of the sky's light at night, white and as strong as each point does, as
   * `ice` is laid out: its lit sides and its highlights, and faintly the snow on it. */
  readonly gloss: Uint8ClampedArray;
  /** The points a lamp's beam makes shine, in the layer's metres: its strongest highlights. */
  readonly shines: readonly Point[];

  /** The relief of the face in `box`, `level` saying where the face is at each height, or null
   * above its top and below its foot, laid out by `random`; `bare`, a face too steep and too
   * much climbed for snow to lie on, all ice. */
  constructor(
    readonly box: ReliefBox,
    level: (y: number) => ReliefLevel | null,
    random: SeededRandom,
    bare = false,
  ) {
    const { SNOWY, FLUTING, PITTED, PIXELS_A_METRE: fine } = IceRelief;
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    const snow = random.chance(SNOWY.chance)
      ? between(SNOWY)
      : random.fraction() ** 2 * SNOWY.otherwise;
    this.character = {
      snow: bare ? Math.min(snow, SNOWY.bare) : snow,
      fluting: between(FLUTING),
      aqua: random.fraction(),
      pitted: between(PITTED),
    };
    this.columns = Math.max(1, Math.ceil(box.width * fine));
    this.rows = Math.max(1, Math.ceil(box.height * fine));
    const levels = Array.from({ length: this.rows }, (_, row) =>
      level(box.top - (row + 0.5) / fine),
    );
    const layout = new ReliefLayout(this.character, box, this.columns, levels, random);
    layout.raise();
    this.ice = new Uint8ClampedArray(this.columns * this.rows * 4);
    this.gloss = new Uint8ClampedArray(this.columns * this.rows * 4);
    this.shines = layout.light(this.ice, this.gloss);
  }
}

/** How an `IceRelief` is worked out: the face raised point by point, then lit. Kept apart from the
 * relief, which holds only what comes of it. It's worked out once for every wall of the route as
 * the slope is drawn, on a phone as on a desk, so what's the same down a row or across the face is
 * worked out once, not at each pixel. */
class ReliefLayout {
  /** The columns the ice hangs in: so many across a metre, so slowly changing down it, standing
   * so high, with finer ones on them, and wandering so far aside as they go down; and under each
   * drip line a curtain of its own, its columns somewhere else. */
  private static readonly FLUTES = {
    across: 3.1,
    down: 0.16,
    high: 0.13,
    fine: 0.04,
    wander: 0.22,
    tier: 7.31,
  };
  /** Where the ice hangs in columns, a curtain, and where it's massive and smooth: patches so big
   * across and down, more of them curtain as the wall is more fluted, the edge between them so
   * wide; and how much of the scallops a curtain keeps. */
  private static readonly CURTAINS = { across: 0.55, down: 0.4, more: 0.9, edge: 0.3, pitted: 0.4 };
  /** The lobes that swell the face, and the scallops melted into it, bowls with a sharp edge
   * between two: how big across and down, and how high. */
  private static readonly LOBES = { across: 0.9, down: 0.7, high: 0.3 };
  private static readonly PITS = { across: 5.5, down: 5.5, high: 0.07 };
  /** The tiers the ice hangs in: a drip line every so many metres down, ragged by so much; under
   * it a fringe of icicles, one every so far across, each so wide at its root and tapering to
   * its point, from the shortest to the longest, the longest where the fringe is thickest, which
   * changes so fast across; the ice standing out over the line so far, from so many metres above
   * it; the ice under it set back so far, coming forward again over so many metres; the shadow
   * under the line, so dark, fading over so many metres; how much darker the ice stays under
   * each line above it, set back in the tier's shade, up to so much; how far over a line the ice
   * starts to stand out, and how far under it it has come all the way forward and out of its
   * shadow. */
  private static readonly TIERS = {
    every: { min: 1.2, max: 2.3 },
    ragged: 0.4,
    icicles: {
      apart: { min: 0.05, max: 0.22 },
      wide: { min: 0.05, max: 0.13 },
      long: { least: 0.08, most: 1.5 },
      fringe: 1.1,
    },
    out: 0.16,
    outOver: 0.45,
    back: 0.3,
    forward: 0.9,
    shadow: 0.7,
    shadowDown: 0.55,
    recess: { each: 0.07, most: 0.2 },
    near: 2.6,
    far: 7,
  };
  /** A bulge that leans out under the lip: how much of its lean shows as relief, so its underside
   * is in shade; and how near a drip line of the wall's own may be to its nose, where its own
   * icicles hang. */
  private static readonly LEAN = 0.6;
  private static readonly NOSE_CLEAR = 0.8;
  /** How much of a lump's height at the face's edge stands out past it. */
  private static readonly OUT = 0.7;
  /** The snow: under the lip, a mantle down from the top, so deep on the snowiest wall; on a
   * wall as snowy as `from`, on each tier too, down from where the overhang above it stops
   * sheltering it, so far under its drip line at the least and further by this share of the
   * tier's height as the wall is barer, to so far above the tier's own drip line, where its
   * icicles hang bare; and how thick it lies, so its edges catch the light and cast a shade. */
  private static readonly MANTLE = 1.3;
  private static readonly PLASTER = { from: 0.5, sheltered: 0.3, barer: 0.8, lip: 0.35 };
  private static readonly SNOW_THICK = 0.035;
  /** The light: where it comes from, from the picture's left, from above, and from in front; how
   * much the sky lights what faces away from it; how tight the wet ice's highlights are, how
   * strong, and how nearly the ice has to face half way between the light and the eye to show one
   * at all; and the light through the thin ice at the face's edge, over so far. */
  private static readonly LIGHT = { right: -0.5, down: -0.62, out: 0.6 };
  private static readonly SKY = 0.3;
  private static readonly SHINE = { tight: 22, strong: 1, from: 0.75 };
  private static readonly RIM = { over: 0.07, light: 0.45 };
  /** How much light shows as the ice's darkest colour, and how much as its lightest: flat ice,
   * between them, shows its own blue, and only what faces the light is pale. */
  private static readonly TONE = { dark: 0.2, light: 0.95 };
  /** What the ice throws back of the night's sky: so much of how light it is by day, over so
   * much, on top of its highlights; and the snow on it, so much of its light. */
  private static readonly NIGHT = { over: 0.2, strong: 1.15, snow: 0.3 };
  /** How ragged the snow's edges are: so fine, by so much of its threshold. */
  private static readonly SNOW_EDGE = { across: 4.3, by: 0.22 };
  /** How much darker the creases between the columns are; and how much darker the ice gets down
   * a tall face, over so many metres. */
  private static readonly GROOVES = 0.45;
  private static readonly DOWN = { over: 12, darker: 0.28 };
  /** Where across the face its ice starts to fade into the glacier, and how ragged the line is. */
  private static readonly FADE = { from: 0.62, ragged: 0.2 };
  /** A lamp makes its strongest highlight shine in each patch of the face so big, if it's this
   * strong. */
  private static readonly SHINES = { patch: 0.3, least: 0.25 };
  /** How many steps of light a colour is worked out for: a byte's. */
  private static readonly STEPS = 256;

  private readonly noise: Noise;
  private readonly rows: number;
  /** The tiers: how far down the wall each one's drip line is, and how far down its ice hangs
   * to, icicles and all, at each pixel's width across the face from its edge. */
  private readonly tiers: readonly { readonly down: number; readonly drip: Float32Array }[];
  /** Each pixel's height, how far across and down the face it is, how solid, how deep in a crease
   * between two columns, how far in a tier's shade, and whether snow lies on it by where it is. */
  private readonly heights: Float32Array;
  private readonly across: Float32Array;
  private readonly down: Float32Array;
  private readonly solid: Float32Array;
  private readonly groove: Float32Array;
  private readonly shade: Float32Array;
  private readonly snowed: Uint8Array;

  constructor(
    private readonly character: IceCharacter,
    private readonly box: ReliefBox,
    private readonly columns: number,
    private readonly levels: readonly (ReliefLevel | null)[],
    random: SeededRandom,
  ) {
    const { PIXELS_A_METRE: fine } = IceRelief;
    const { TIERS, NOSE_CLEAR } = ReliefLayout;
    const noise = new Noise(random);
    this.noise = noise;
    this.rows = levels.length;
    // Where a bulge leans out the furthest, its nose: its icicles hang from there.
    let nose: ReliefLevel | null = null;
    for (const level of levels) {
      if (level !== null && level.lean > (nose?.lean ?? 0)) {
        nose = level;
      }
    }
    const under = nose?.down ?? -Infinity;
    const lines: { down: number; seed: number }[] = [];
    let down = 0.5 + random.fraction() * TIERS.every.max;
    while (down < box.height - 0.4) {
      if (Math.abs(down - under) > NOSE_CLEAR) {
        lines.push({ down, seed: random.fraction() * 50 });
      }
      down += TIERS.every.min + random.fraction() * (TIERS.every.max - TIERS.every.min);
    }
    if (nose !== null) {
      lines.push({ down: nose.down, seed: random.fraction() * 50 });
    }
    const { icicles } = TIERS;
    this.tiers = lines.map((line) => {
      const drip = Float32Array.from(
        { length: columns + 2 },
        (_, index) =>
          line.down + TIERS.ragged * (noise.at((index / fine) * 3.3 + line.seed, 0.5) - 0.5),
      );
      // Its icicles, one after another across the face: each hangs from the line to its point,
      // the longest where the fringe is thickest.
      let at = random.fraction() * icicles.apart.max;
      while (at < (columns + 1) / fine) {
        const half =
          (icicles.wide.min + random.fraction() * (icicles.wide.max - icicles.wide.min)) / 2;
        const thick = noise.at(at * icicles.fringe + line.seed * 1.7, 4.5);
        const long =
          icicles.long.least +
          (icicles.long.most - icicles.long.least) * thick * thick * random.fraction() ** 1.5;
        const first = Math.max(0, Math.ceil((at - half) * fine));
        const last = Math.min(columns + 1, Math.floor((at + half) * fine));
        const root = drip[Math.round(at * fine)] ?? line.down;
        for (let index = first; index <= last; index += 1) {
          const tapered = root + long * (1 - Math.abs(index / fine - at) / half);
          drip[index] = Math.max(drip[index] ?? tapered, tapered);
        }
        at += icicles.apart.min + random.fraction() * (icicles.apart.max - icicles.apart.min);
      }
      return { down: line.down, drip };
    });
    const count = columns * this.rows;
    this.heights = new Float32Array(count);
    this.across = new Float32Array(count);
    this.down = new Float32Array(count);
    this.solid = new Float32Array(count);
    this.groove = new Float32Array(count);
    this.shade = new Float32Array(count);
    this.snowed = new Uint8Array(count);
  }

  /** The face raised: each pixel's height off the wall, and what else the light needs of it. */
  raise(): void {
    const { PIXELS_A_METRE: fine, PROUD } = IceRelief;
    const { FADE, MANTLE, PLASTER, SNOW_EDGE, SNOW_THICK, LEAN, OUT, TIERS, FLUTES } = ReliefLayout;
    const { width } = this.box;
    const { box, columns, rows, noise } = this;
    const { snow, fluting } = this.character;
    const mantle = snow * MANTLE;
    const plastered = snow >= PLASTER.from;
    for (let row = 0; row < rows; row += 1) {
      const at = this.levels[row] ?? null;
      if (at === null || at.deep <= 0) {
        continue;
      }
      const { edge, into, deep, down, lean, up } = at;
      // The columns wander aside as they go down, the same all the way across.
      const wander = FLUTES.wander * (noise.at(down * 0.6, 3.3) - 0.5);
      // The drip lines that may hang over this row, and how many are far over all of it.
      const near = this.tiers.filter(
        (tier) => down - tier.down > -TIERS.near && down - tier.down < TIERS.far,
      );
      const over = this.tiers.filter((tier) => down - tier.down >= TIERS.far).length;
      // Its lumps stand out past the face's edge; its ice fades out on a ragged line inside.
      const brink = into === 1 ? edge - box.left : box.left + width - edge;
      const proud = Math.min(Math.max(this.massive(brink, down, 0) * OUT, 0), PROUD);
      const whole = deep * (FADE.from - FADE.ragged / 2);
      const gone = deep * (1 + FADE.ragged / 2);
      for (let column = 0; column < columns; column += 1) {
        const x = (column + 0.5) / fine;
        const across = (box.left + x - edge) * into;
        if (across < -proud || across > gone) {
          continue;
        }
        // Where it is on the wall's own pattern, which hangs plumb whatever the face's edge does:
        // across from the box's side the drop is on.
        const u = into === 1 ? x : width - x;
        let fade = 1;
        if (across > whole) {
          const share = across / deep + FADE.ragged * (noise.at(down * 2.3 + 91.7, u * 1.9) - 0.5);
          fade = 1 - Math.min(Math.max((share - FADE.from) / (1 - FADE.from), 0), 1);
          if (fade <= 0) {
            continue;
          }
        }
        // Over each drip line the ice stands out; under it it's set back, in its shadow, and
        // comes forward again further down.
        let hung = 0;
        let cast = 0;
        let above = over;
        // How far under the drip line above it is, or the wall's top, and how far over the next
        // one below, or the wall's foot.
        let past = down;
        let next = up;
        for (const { drip } of near) {
          const under = down - ReliefLayout.hung(drip, u * fine);
          if (under > 0) {
            hung -= TIERS.back * Math.exp(-under / TIERS.forward);
            cast += Math.exp(-under / TIERS.shadowDown);
            above += 1;
            past = Math.min(past, under);
          } else {
            hung += TIERS.out * Math.exp(under / TIERS.outOver);
            next = Math.min(next, -under);
          }
        }
        // Under each line hangs a curtain of its own.
        const tier = above * FLUTES.tier;
        const curtain = this.curtain(u, down, tier) * fluting;
        const pipe = this.pipe(u + wander, down, tier);
        const finer = this.pipe((u + wander) * 2.6 + 11.3, down * 2.2 + 5.9, tier);
        const height =
          curtain * (FLUTES.high * Math.sqrt(pipe) + FLUTES.fine * Math.sqrt(finer)) +
          this.massive(u, down, curtain) +
          LEAN * lean +
          hung;
        const crease = (1 - pipe) * (1 - pipe);
        const index = row * columns + column;
        this.across[index] = across;
        this.down[index] = down;
        this.solid[index] = fade * fade * (3 - 2 * fade);
        this.groove[index] = curtain * crease * crease;
        this.shade[index] = Math.min(
          1,
          cast + Math.min(above * TIERS.recess.each, TIERS.recess.most),
        );
        // The snow's edges are ragged: its mantle from the top, its bank against the foot, and
        // on a snowy wall what's plastered on each tier, clear of the overhang above it and of
        // its own icicles.
        const ragged =
          1 +
          SNOW_EDGE.by *
            (noise.at(u * SNOW_EDGE.across + 70.9, down * SNOW_EDGE.across + 80.3) - 0.5) *
            2;
        const top = mantle * (0.45 + 1.1 * noise.at(u * 1.2 + 40.1, 2.2)) * ragged;
        const reach = Math.min(1, Math.max(across, 0) / Math.max(deep, 0.01));
        const bank = at.bank * (1 - 0.55 * reach) * ragged;
        const sheltered = PLASTER.sheltered + (1 - snow) * PLASTER.barer * (past + next);
        const snowed =
          down < top ||
          up < bank ||
          (plastered && past > sheltered * ragged && next > PLASTER.lip * ragged);
        this.snowed[index] = snowed ? 1 : 0;
        this.heights[index] = height + (snowed ? SNOW_THICK : 0);
      }
    }
  }

  /** The face lit: its ice by day into `ice`, what it throws back of the night's sky into `gloss`,
   * and the points a lamp makes shine. */
  light(ice: Uint8ClampedArray, gloss: Uint8ClampedArray): Point[] {
    const { PIXELS_A_METRE: fine } = IceRelief;
    const { LIGHT, SKY, TONE, SHINE, NIGHT, RIM, GROOVES, DOWN, SHINES, TIERS, STEPS } =
      ReliefLayout;
    const { box, columns, rows, heights, solid } = this;
    const { aqua } = this.character;
    const lightLength = Math.hypot(LIGHT.right, LIGHT.down, LIGHT.out);
    const [lightRight, lightDown, lightOut] = [
      LIGHT.right / lightLength,
      LIGHT.down / lightLength,
      LIGHT.out / lightLength,
    ];
    // Half way between the light and the eye, which looks straight at the face.
    const halfLength = Math.hypot(lightRight, lightDown, lightOut + 1);
    const [halfRight, halfDown, halfOut] = [
      lightRight / halfLength,
      lightDown / halfLength,
      (lightOut + 1) / halfLength,
    ];
    const icy = ReliefLayout.shades((lit) => Palette.ice(aqua, lit));
    const snowy = ReliefLayout.shades((lit) => Palette.mix(Palette.SNOW_SHADE, 0xffffff, lit));
    const patch = Math.max(1, Math.round(SHINES.patch * fine));
    const strongest = new Map<number, { shine: number; point: Point }>();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const alpha = solid[index] ?? 0;
        if (alpha <= 0) {
          continue;
        }
        // How the ice slopes here, by the solid ice beside it, over and under it.
        const here = heights[index] ?? 0;
        const right =
          column + 1 < columns && (solid[index + 1] ?? 0) > 0 ? (heights[index + 1] ?? here) : here;
        const left =
          column > 0 && (solid[index - 1] ?? 0) > 0 ? (heights[index - 1] ?? here) : here;
        const under =
          row + 1 < rows && (solid[index + columns] ?? 0) > 0
            ? (heights[index + columns] ?? here)
            : here;
        const over =
          row > 0 && (solid[index - columns] ?? 0) > 0 ? (heights[index - columns] ?? here) : here;
        const slopeRight = ((right - left) * fine) / 2;
        const slopeDown = ((under - over) * fine) / 2;
        // Snow lies where it's plastered, and on the ledges, where the ice juts out going down.
        const white = this.snowed[index] === 1;
        const soft = white ? 0.3 : 1;
        const tiltRight = -slopeRight * soft;
        const tiltDown = -slopeDown * soft;
        const length = Math.sqrt(tiltRight * tiltRight + tiltDown * tiltDown + 1);
        const facing = Math.max(
          0,
          (tiltRight * lightRight + tiltDown * lightDown + lightOut) / length,
        );
        const down = this.down[index] ?? 0;
        const lit =
          (SKY + (1 - SKY) * facing) *
          (white ? 1 : 1 - GROOVES * (this.groove[index] ?? 0)) *
          (white ? 1 : 1 - TIERS.shadow * (this.shade[index] ?? 0)) *
          (1 - DOWN.darker * Math.min(1, down / DOWN.over));
        // How nearly it faces half way between the light and the eye: a highlight where it does.
        const turned = (tiltRight * halfRight + tiltDown * halfDown + halfOut) / length;
        const shine = white || turned < SHINE.from ? 0 : turned ** SHINE.tight * SHINE.strong;
        const rim = white
          ? 0
          : RIM.light * Math.max(0, 1 - Math.max(this.across[index] ?? 0, 0) / RIM.over);
        const bright = Math.min(1, shine + rim);
        const tone = white
          ? lit
          : Math.min(Math.max((lit - TONE.dark) / (TONE.light - TONE.dark), 0), 1);
        const shades = white ? snowy : icy;
        const step = Math.round(Math.min(Math.max(tone, 0), 1) * (STEPS - 1)) * 3;
        const red = shades[step] ?? 0;
        const green = shades[step + 1] ?? 0;
        const blue = shades[step + 2] ?? 0;
        const byte = index * 4;
        ice[byte] = red + (255 - red) * bright;
        ice[byte + 1] = green + (255 - green) * bright;
        ice[byte + 2] = blue + (255 - blue) * bright;
        ice[byte + 3] = alpha * 255;
        // Under the night's sky its ice shows by what it throws back: its lit sides and its
        // highlights; the snow on it only faintly.
        const thrown = white
          ? NIGHT.snow * lit
          : Math.min(1, bright + Math.max(0, tone - NIGHT.over) * NIGHT.strong);
        gloss[byte] = 255;
        gloss[byte + 1] = 255;
        gloss[byte + 2] = 255;
        gloss[byte + 3] = thrown * alpha * 255;
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

  /** How high the massive ice stands off the wall `across` metres over its pattern and `down`
   * from its top: its lobes, and its scallops, fewer where it hangs `curtain` much in columns. */
  private massive(across: number, down: number, curtain: number): number {
    const { LOBES, PITS, CURTAINS } = ReliefLayout;
    const { noise } = this;
    const lobes = noise.fractal(across * LOBES.across + 21.9, down * LOBES.down + 5.3, 3);
    const edges = noise.ridged(across * PITS.across + 31.1, down * PITS.down + 17.7);
    const scalloped = this.character.pitted * (1 - (1 - CURTAINS.pitted) * curtain);
    return LOBES.high * (lobes - 0.5) + PITS.high * scalloped * (edges - 0.5);
  }

  /** How much the ice hangs in columns there, 0 where it's massive to 1 in a curtain, under the
   * drip lines `tier` says. */
  private curtain(across: number, down: number, tier: number): number {
    const { CURTAINS } = ReliefLayout;
    const patch = this.noise.at(across * CURTAINS.across + 61.3 + tier, down * CURTAINS.down + 3.9);
    const share =
      (patch + (this.character.fluting - 0.7) * CURTAINS.more - 0.5) / CURTAINS.edge + 0.5;
    const within = Math.min(Math.max(share, 0), 1);
    return within * within * (3 - 2 * within);
  }

  /** How far from the crease between two columns the ice is there: 0 in the crease, 1 on the
   * crest of the column, in the curtain under the drip lines `tier` says. */
  private pipe(across: number, down: number, tier: number): number {
    const { FLUTES } = ReliefLayout;
    return 1 - this.noise.ridged(across * FLUTES.across, down * FLUTES.down + 7.1 + tier);
  }

  /** A drip line `at` so many pixels across the face, between the two it's worked out at. */
  private static hung(drip: Float32Array, at: number): number {
    const index = Math.floor(at);
    const before = drip[index] ?? 0;
    return before + ((drip[index + 1] ?? before) - before) * (at - index);
  }

  /** A colour at each step of light from none to full, three bytes a step: red, green, blue. */
  private static shades(colour: (lit: number) => number): Uint8Array {
    const { STEPS } = ReliefLayout;
    const shades = new Uint8Array(STEPS * 3);
    for (let step = 0; step < STEPS; step += 1) {
      const { red, green, blue } = Palette.channels(colour(step / (STEPS - 1)));
      shades.set([red, green, blue], step * 3);
    }
    return shades;
  }
}
