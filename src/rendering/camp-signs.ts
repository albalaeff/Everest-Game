import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";

/** A tent of a camp as the route pitches it: where its door is, along the ground, and the way its
 * body lies from the door, 1 up the route and -1 down it. */
export interface PitchedTent {
  readonly door: number;
  readonly lies: number;
}

/** A camp as the picture needs it: the stretch of the ground it stands on, and its tents. */
export interface CampStretch {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly tents?: readonly PitchedTent[];
}

/** The tents' sizes, in metres: a camp's dome along its floor and up to its peak inside, its
 * front vestibule and the smaller one behind, and Base Camp's big dome across and up. The
 * knowledge base's (`TentFacts`). */
export interface TentSizes {
  readonly length: number;
  readonly height: number;
  readonly vestibule: number;
  readonly tail: number;
  readonly dome: { readonly width: number; readonly height: number };
}

/** A line across a tent's fly: a pole's sleeve, or a panel's seam. */
export type Seam = readonly Point[];

/** A guy line: from the fly to its peg in the ground. */
export interface Guy {
  readonly from: Point;
  readonly peg: Point;
}

/** What lies by a tent: a barrel and a duffel at Base Camp, oxygen bottles or a marker wand
 * higher up, an ice axe stuck in by the door. */
export interface CampProp {
  readonly kind: "barrel" | "duffel" | "bottles" | "wand" | "axe";
  readonly at: Point;
  /** The way it faces along the ground. */
  readonly way: 1 | -1;
}

/** What the wind sways: the ground's height under it, and how high it stands over that. */
export interface Swayed {
  readonly base: number;
  readonly tall: number;
}

/**
 * An expedition dome as the picture draws it, side on, in slope metres: the fly's outline from
 * the ground at its door's end over the top to the ground behind; the poles' sleeves across it;
 * the grey vestibule in front, whole and with its door's opening left out, the room behind it and
 * the tail; the door's zip and the opening behind its flap; the valance along the ground, the
 * vent on top, the band of light along its crown and of shade along its foot; its guy lines;
 * where its lamp hangs inside; and what lies beside it.
 */
export interface TentShape extends Swayed {
  readonly camp: string;
  /** Which of its camp's tents, in the route's order. */
  readonly index: number;
  /** The ground at its door, and the way its body lies from there. */
  readonly door: Point;
  readonly lies: 1 | -1;
  readonly outline: readonly Point[];
  readonly poles: readonly Seam[];
  readonly vestibule: readonly Point[];
  /** The vestibule round its door: all of it but the opening, which whoever goes in shows in. */
  readonly around: readonly Point[];
  /** The fly from the first hoop back to the ground behind: the room and the tail. */
  readonly room: readonly Point[];
  /** The room alone, between its first hoop and its last: where the light inside shows through
   * the fly. */
  readonly lit: readonly Point[];
  readonly tail: readonly Point[];
  readonly zip: readonly Point[];
  readonly opening: readonly Point[];
  readonly valance: readonly Point[];
  readonly vent: readonly Point[];
  readonly sheen: readonly Point[];
  readonly shade: readonly Point[];
  readonly guys: readonly Guy[];
  readonly lamp: Point;
  readonly props: readonly CampProp[];
  /** Whether it stands on rubble, its guys tied to rocks, or on snow, staked. */
  readonly rubble: boolean;
}

/** Base Camp's big dome: its outline, the seams of its panels, its door and windows, its
 * chimney, its guys and where its lamp hangs. */
export interface DomeShape extends Swayed {
  readonly outline: readonly Point[];
  readonly seams: readonly Seam[];
  readonly door: readonly Point[];
  readonly zip: readonly Point[];
  readonly windows: readonly { readonly at: Point; readonly radius: number }[];
  readonly chimney: readonly Point[];
  readonly valance: readonly Point[];
  readonly guys: readonly Guy[];
  readonly lamp: Point;
}

/** A tent of another expedition, behind the camp's own: smaller with the distance, in one of the
 * tents' colours, lit from inside at night or dark. */
export interface FarTent {
  readonly outline: readonly Point[];
  readonly vestibule: readonly Point[];
  readonly pole: Seam;
  readonly tone: number;
  readonly lit: boolean;
  readonly lamp: Point;
}

/** A point of a tent in its own frame: metres from its door's end along its length, and up. */
type Local = readonly [along: number, up: number];

/**
 * The camps as the picture shows them, in slope metres, with no words (#258): each camp's tents
 * where the route pitches them, three-person expedition domes at the knowledge base's size, lower
 * than a climber and twice as long; Base Camp's big dome beside them, which a climber stands up
 * in; and rows of other expeditions' tents behind. The shapes are the drawing's own, seeded, so
 * the same camp is drawn on every device; `TentDrawing` paints them.
 */
export class CampSigns {
  /** The camp the big dome and the barrels stand in. */
  static readonly DOME_AT = "base-camp";
  /** How much higher than the room inside the fly stands, over its poles. */
  private static readonly FLY_METRES = 0.06;
  /** How many points smooth each stretch of an outline between two of its corners. */
  private static readonly SMOOTH = 5;
  /** The door in the vestibule's near side: where it begins and ends along the tent, as shares of
   * the vestibule, and how high it goes, as a share of the tent. */
  private static readonly DOOR = { from: 0.16, to: 0.98, high: 0.62 };
  /** How near a tent's tail another's door may be, behind it and on past it, in metres, for
   * anything to lie there. */
  private static readonly BEHIND_TAIL = { back: 0.5, on: 2.4 };
  /** How far before Base Camp's tents the big dome's middle is, in metres: on the level rubble
   * before the section's foot. */
  private static readonly DOME_BEFORE = 3.1;
  /** The rows behind: how far from a camp they reach, at Base Camp and higher, on the side away
   * from the route, where no climber walks in front of them; how far apart their tents stand,
   * the least and the most; how small they're drawn, the far ones and the near; and how many
   * colours they come in. */
  private static readonly FAR = {
    reach: { base: 34, higher: 11 },
    apart: [2.6, 5.2] as const,
    scale: [0.42, 0.68] as const,
    tones: 5,
  };

  constructor(
    private readonly terrain: Terrain,
    private readonly sizes: TentSizes,
    /** How far along the ground the rubble ends and the snow begins: 0, on snow all the way. */
    private readonly rubbleTo = 0,
    private readonly seed = 0,
  ) {}

  /** How long a tent is on the ground, from its door's end to its tail's. */
  get span(): number {
    const { length, vestibule, tail } = this.sizes;
    return vestibule + length + tail;
  }

  /** How high a tent's fly stands. */
  private get tall(): number {
    return this.sizes.height + CampSigns.FLY_METRES;
  }

  /** A camp's tents, as the route pitches them. What was carried there lies behind a tent's
   * tail only where no other tent's door is: nothing lies in a doorway. */
  tents(camp: CampStretch): readonly TentShape[] {
    const tents = (camp.tents ?? []).map((tent, index) => this.tent(camp, tent, index));
    const clear = CampSigns.BEHIND_TAIL;
    return tents.map((tent) => {
      const tail = tent.door.x + tent.lies * this.span;
      const crowded = tents.some((other) => {
        const past = (other.door.x - tail) * tent.lies;
        return other !== tent && past > -clear.back && past < clear.on;
      });
      return crowded ? { ...tent, props: tent.props.filter(({ kind }) => kind === "axe") } : tent;
    });
  }

  /** The tent whose door is nearest `x`, of these: the one a climber there goes into. */
  static nearest(tents: readonly TentShape[], x: number): TentShape | null {
    let nearest: TentShape | null = null;
    for (const tent of tents) {
      if (nearest === null || Math.abs(tent.door.x - x) < Math.abs(nearest.door.x - x)) {
        nearest = tent;
      }
    }
    return nearest;
  }

  /** A point of a tent or a dome as the wind sways it: `push` metres across at its top, less the
   * lower it is, and not at all on the ground. */
  static swayed(point: Point, shape: Swayed, push: number): Point {
    const up = Math.min(1, Math.max(0, (point.y - shape.base) / shape.tall));
    return { x: point.x + push * up * Math.sqrt(up), y: point.y };
  }

  /** Base Camp's big dome, on the level ground before its tents; none at any other camp. */
  dome(camp: CampStretch): DomeShape | null {
    if (camp.id !== CampSigns.DOME_AT) {
      return null;
    }
    const { width, height } = this.sizes.dome;
    const radius = width / 2;
    const tall = height + CampSigns.FLY_METRES;
    const first = Math.min(...this.tents(camp).flatMap(({ outline }) => outline.map(({ x }) => x)));
    const foot = this.terrain.point(camp.from);
    const middle = (Number.isFinite(first) ? first : foot.x) - CampSigns.DOME_BEFORE;
    const base = foot.y;
    const at = (across: number, up: number): Point => ({ x: middle + across, y: base + up });
    const steps = 28;
    const outline = Array.from({ length: steps + 1 }, (_, step) => {
      const angle = (Math.PI * step) / steps;
      return at(-radius * Math.cos(angle), tall * Math.sin(angle) ** 0.86);
    });
    // The panels' seams: lines of longitude that meet at the top, and two rings round it.
    const seams: Seam[] = [-0.72, -0.36, 0, 0.36, 0.72].map((share) =>
      Array.from({ length: 9 }, (_, index) => {
        const up = index / 8;
        return at(radius * share * Math.sqrt(1 - up * up), tall * up ** 0.92);
      }),
    );
    for (const up of [0.42, 0.74]) {
      const reach = radius * Math.sqrt(1 - up ** 2.3);
      seams.push(
        Array.from({ length: 9 }, (_, index) => {
          const across = -1 + index / 4;
          return at(reach * across, tall * up - 0.05 * (1 - across * across));
        }),
      );
    }
    const doorAt = radius * 0.34;
    const arch = (half: number, high: number): readonly Point[] =>
      CampSigns.arch(doorAt, half, high, 10).map(([across, up]) => at(across, up));
    return {
      base,
      tall,
      outline,
      seams,
      door: arch(0.46, 1.52),
      zip: arch(0.36, 1.38),
      windows: [
        { at: at(-radius * 0.5, tall * 0.52), radius: 0.17 },
        { at: at(-radius * 0.1, tall * 0.6), radius: 0.17 },
      ],
      chimney: [
        at(-0.1, tall - 0.01),
        at(-0.1, tall + 0.16),
        at(0.1, tall + 0.16),
        at(0.1, tall - 0.01),
      ],
      valance: [at(-radius, 0), at(radius, 0), at(radius - 0.03, 0.09), at(-radius + 0.03, 0.09)],
      guys: ([-1, 1] as const).flatMap((side) => [
        { from: at(side * radius * 0.86, tall * 0.56), peg: at(side * (radius + 0.75), 0) },
        { from: at(side * radius * 0.6, tall * 0.84), peg: at(side * (radius + 1.25), 0) },
      ]),
      lamp: at(0, tall * 0.62),
    };
  }

  /** The other expeditions' tents behind a camp, from the far ones to the near: smaller, in other
   * colours, some lit at night. Seeded, so the same rows stand there every time. */
  far(camp: CampStretch): readonly FarTent[] {
    const { reach, apart, scale, tones } = CampSigns.FAR;
    // A chance of the picture's own, apart from the expedition's: the same rows on every device.
    const chance = SeededRandom.fromSeed(this.seed + camp.id.length * 7919 + Math.round(camp.from));
    const random = (): number => chance.fraction();
    const span = camp.id === CampSigns.DOME_AT ? reach.base : reach.higher;
    const tents: FarTent[] = [];
    const { length, vestibule, height } = this.sizes;
    // A camp at the section's foot has the route ahead of it, one at its top behind it.
    const atTheFoot = camp.from < this.terrain.length / 2;
    const first = this.terrain.point(camp.from).x;
    const last = this.terrain.point(camp.to).x;
    const to = atTheFoot ? last : last + span;
    let x = (atTheFoot ? first - span : first) + random() * apart[0];
    while (x < to) {
      const small = scale[0] + random() * (scale[1] - scale[0]);
      const lies = random() < 0.5 ? 1 : -1;
      const tone = Math.floor(random() * tones);
      const lit = random() < 0.55;
      const base = this.terrain.height(x);
      const level = Math.abs(this.terrain.height(x + lies * this.span * small) - base) < 0.05;
      if (level) {
        const from = x;
        const place = ([along, up]: Local): Point => ({
          x: from + lies * along * small,
          y: base + up * small,
        });
        tents.push({
          outline: this.fly().map(place),
          vestibule: this.front().map(place),
          pole: this.hoop(0.5, 0.5, 0.5).map(place),
          tone,
          lit,
          lamp: place([vestibule + length * 0.45, height * 0.5]),
        });
      }
      x += apart[0] + random() * (apart[1] - apart[0]);
    }
    return tents.sort((first, second) => CampSigns.width(first) - CampSigns.width(second));
  }

  private tent(camp: CampStretch, pitched: PitchedTent, index: number): TentShape {
    const lies = pitched.lies < 0 ? -1 : 1;
    const door = this.terrain.point(pitched.door);
    const place = ([along, up]: Local): Point => ({ x: door.x + lies * along, y: door.y + up });
    const { length, vestibule } = this.sizes;
    const { tall, span } = this;
    const outline = this.fly();
    const rubble = pitched.door < this.rubbleTo;
    const { from, to, high } = CampSigns.DOOR;
    const middle = (vestibule * (from + to)) / 2;
    const half = (vestibule * (to - from)) / 2;
    const doorway = CampSigns.arch(middle, half, tall * high, 10);
    const crownFrom = vestibule + 0.18 * length;
    const crown = outline.filter(
      ([along]) => along >= crownFrom && along <= vestibule + 0.84 * length,
    );
    const under = crown.map(([along, up]): Local => {
      const across = (along - crownFrom) / (0.66 * length);
      return [along, up - 0.05 - 0.07 * Math.sin(Math.PI * across)];
    });
    // An ice axe stuck in by the wall, clear of the door.
    const props: CampProp[] = [{ kind: "axe", at: place([vestibule + 0.3, 0]), way: lies }];
    if (rubble) {
      props.push({ kind: "barrel", at: place([span + 0.55, 0]), way: lies });
      if (index % 2 === 1) {
        props.push({ kind: "duffel", at: place([span + 1.25, 0]), way: lies });
      }
    } else {
      const kind = index % 2 === 0 ? "bottles" : "wand";
      props.push({ kind, at: place([span + 0.5, 0]), way: lies });
    }
    return {
      camp: camp.id,
      index,
      door,
      lies,
      base: door.y,
      tall,
      outline: outline.map(place),
      poles: [
        this.hoop(0.02, 0.1, 0.3),
        this.hoop(0.98, 0.9, 0.7),
        this.hoop(0.2, 0.46, 0.88),
        this.hoop(0.8, 0.54, 0.12),
      ].map((pole) => pole.map(place)),
      vestibule: this.front().map(place),
      around: [...this.front(), ...[...doorway].reverse()].map(place),
      room: this.back().map(place),
      lit: this.between().map(place),
      tail: this.behind().map(place),
      zip: doorway.map(place),
      opening: CampSigns.arch(middle, half - 0.05, tall * high - 0.06, 10).map(place),
      valance: [
        place([0.04, 0]),
        place([span - 0.04, 0]),
        place([span - 0.1, 0.075]),
        place([0.12, 0.075]),
      ],
      vent: [
        place([vestibule + 0.42 * length, tall * 0.985]),
        place([vestibule + 0.47 * length, tall * 1.045]),
        place([vestibule + 0.6 * length, tall * 1.03]),
        place([vestibule + 0.62 * length, tall * 0.975]),
      ],
      sheen: [...crown, ...under.reverse()].map(place),
      shade: [
        place([vestibule + 0.02 * length, 0.075]),
        place([vestibule + 0.98 * length, 0.075]),
        place([vestibule + 0.985 * length, tall * 0.3]),
        place([vestibule + 0.5 * length, tall * 0.36]),
        place([vestibule + 0.015 * length, tall * 0.3]),
      ],
      guys: [
        { from: place([0.2, tall * 0.5]), peg: place([-0.7, 0]) },
        { from: place([vestibule + 0.3 * length, tall * 0.97]), peg: place([-1.15, 0]) },
        { from: place([vestibule + 0.72 * length, tall * 0.96]), peg: place([span + 1.0, 0]) },
        { from: place([span - 0.12, tall * 0.42]), peg: place([span + 0.55, 0]) },
      ],
      lamp: place([vestibule + 0.45 * length, tall * 0.56]),
      props,
      rubble,
    };
  }

  /** A tent's fly cut through from end to end, in its own frame: metres from its door's end
   * along its length, and up. The picture of its inside is drawn on it (`TentPicture`). */
  static profile(sizes: TentSizes): readonly (readonly [along: number, up: number])[] {
    const { length, vestibule, tail, height } = sizes;
    const tall = height + CampSigns.FLY_METRES;
    const end = vestibule + length;
    const corners: readonly Local[] = [
      [0, 0],
      [0.06, 0.3 * tall],
      [0.27, 0.6 * tall],
      [0.72 * vestibule, 0.79 * tall],
      [vestibule + 0.1 * length, 0.91 * tall],
      [vestibule + 0.3 * length, 0.985 * tall],
      [vestibule + 0.5 * length, tall],
      [vestibule + 0.7 * length, 0.975 * tall],
      [vestibule + 0.9 * length, 0.865 * tall],
      [end + 0.28 * tail, 0.62 * tall],
      [end + 0.72 * tail, 0.28 * tall],
      [end + tail, 0],
    ];
    return CampSigns.smooth(corners, CampSigns.SMOOTH);
  }

  /** The fly's outline in the tent's own frame, smoothed: from the ground at the door's end over
   * the vestibule's hoop and the room's top to the ground behind. */
  private fly(): readonly Local[] {
    return CampSigns.profile(this.sizes);
  }

  /** The vestibule in front, in the tent's own frame: the fly from the ground at the door's end
   * up to the first hoop, and down the hoop to the ground. */
  private front(): readonly Local[] {
    const hoop = this.hoop(0.02, 0.1, 0.3);
    const top = hoop.at(-1)?.[0] ?? this.sizes.vestibule;
    return [...this.fly().filter(([along]) => along <= top), ...[...hoop].reverse()];
  }

  /** The fly from the first hoop back, in the tent's own frame: up the hoop, over the top and
   * down to the ground behind. */
  private back(): readonly Local[] {
    const hoop = this.hoop(0.02, 0.1, 0.3);
    const top = hoop.at(-1)?.[0] ?? 0;
    return [...hoop, ...this.fly().filter(([along]) => along > top)];
  }

  /** The room alone, in the tent's own frame: up its first hoop, over the top to its last, and
   * down that to the ground. */
  private between(): readonly Local[] {
    const first = this.hoop(0.02, 0.1, 0.3);
    const last = this.hoop(0.98, 0.9, 0.7);
    const from = first.at(-1)?.[0] ?? 0;
    const to = last.at(-1)?.[0] ?? 0;
    const top = this.fly().filter(([along]) => along > from && along < to);
    return [...first, ...top, ...[...last].reverse()];
  }

  /** The tail behind, in the tent's own frame: up the last hoop, and down the fly to the ground
   * behind. */
  private behind(): readonly Local[] {
    const hoop = this.hoop(0.98, 0.9, 0.7);
    const top = hoop.at(-1)?.[0] ?? 0;
    return [...hoop, ...this.fly().filter(([along]) => along >= top)];
  }

  /** A pole's sleeve across the fly, in the tent's own frame: from the ground at `foot` of the
   * room's length, bowing through `belly`, to the outline over `top`. */
  private hoop(foot: number, belly: number, top: number): readonly Local[] {
    const { length, vestibule } = this.sizes;
    const { tall } = this;
    const over = vestibule + top * length;
    const crest = this.fly().reduce<Local>(
      (nearest, point) =>
        Math.abs(point[0] - over) < Math.abs(nearest[0] - over) ? point : nearest,
      [over, tall],
    );
    const from: Local = [vestibule + foot * length, 0];
    const bow: Local = [vestibule + belly * length, 0.66 * tall];
    const steps = 10;
    return Array.from({ length: steps + 1 }, (_, index): Local => {
      const t = index / steps;
      const s = 1 - t;
      return [
        s * s * from[0] + 2 * s * t * bow[0] + t * t * crest[0],
        s * s * from[1] + 2 * s * t * bow[1] + t * t * crest[1],
      ];
    });
  }

  /** An arch on the ground: round `middle`, `half` wide each side and `high` at its top, in so
   * many steps. */
  private static arch(middle: number, half: number, high: number, steps: number): readonly Local[] {
    return Array.from({ length: steps + 1 }, (_, index): Local => {
      const angle = (Math.PI * index) / steps;
      return [middle - half * Math.cos(angle), high * Math.sin(angle) ** 0.7];
    });
  }

  /** A curve through `corners`, with `between` points from each to the next (Catmull-Rom), never
   * under the ground. */
  private static smooth(corners: readonly Local[], between: number): readonly Local[] {
    const points: Local[] = [];
    const corner = (index: number): Local =>
      corners[Math.min(Math.max(index, 0), corners.length - 1)] ?? [0, 0];
    const blend = (a: number, b: number, c: number, d: number, t: number): number =>
      0.5 *
      (2 * b +
        (c - a) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (3 * b - a - 3 * c + d) * t * t * t);
    for (let index = 0; index < corners.length - 1; index += 1) {
      const before = corner(index - 1);
      const from = corner(index);
      const to = corner(index + 1);
      const after = corner(index + 2);
      for (let step = 0; step < between; step += 1) {
        const t = step / between;
        points.push([
          blend(before[0], from[0], to[0], after[0], t),
          Math.max(0, blend(before[1], from[1], to[1], after[1], t)),
        ]);
      }
    }
    points.push(corner(corners.length - 1));
    return points;
  }

  private static width(tent: FarTent): number {
    const xs = tent.outline.map(({ x }) => x);
    return Math.max(...xs) - Math.min(...xs);
  }
}
