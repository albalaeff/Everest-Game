import { SeededRandom } from "../simulation";

/** What knocks the chips off: a pick striking in, one biting poorly, which shatters brittle ice
 * into plates, or the front points kicked in. */
export type ChipBurst = "pick" | "poor" | "kick";

/** A chip of ice: where it is and how fast it goes, which way it's turned and how fast it spins,
 * how big it is, how many times life size its figure is drawn, how long ago it was knocked off,
 * and how long it shows. */
interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  grown: number;
  age: number;
  life: number;
}

/** A burst's chips: how many, how fast they fly out, how big they are, how long they show, all
 * at life size and between their least and most; how widely they spread round the way out of the
 * ice, in radians, and how much of their speed goes up. */
interface Spray {
  readonly count: number;
  readonly speed: readonly [number, number];
  readonly size: readonly [number, number];
  readonly life: readonly [number, number];
  readonly spread: number;
  readonly lift: number;
}

/**
 * The chips of ice a pick knocks off as it strikes in, and the front points as they're kicked in
 * (docs/guidelines/graphics.md → The animation shows the body's state): a spray of shards flying
 * out from the face, spinning and falling, that fade in under a second; brittle ice, where a pick
 * bites poorly, shatters into more and bigger plates. A pool of so many, the oldest taken again
 * when all are in the air, so a frame allocates none; their chance is a seeded generator of the
 * picture's own. The drawing is the layer's; this is where the chips are.
 */
export class IceChips {
  static readonly COUNT = 64;
  /** How fast a chip falls, in metres a second each second at life size. */
  private static readonly GRAVITY = 9.8;
  /** How much of its speed a chip keeps each second, slowed by the air. */
  private static readonly DRAG = 0.35;
  /** How much of its life a chip takes to fade out at its end. */
  private static readonly FADE = 0.4;
  private static readonly SPRAYS: Readonly<Record<ChipBurst, Spray>> = {
    pick: {
      count: 10,
      speed: [0.9, 2.4],
      size: [0.016, 0.038],
      life: [0.45, 0.8],
      spread: 1.6,
      lift: 0.45,
    },
    poor: {
      count: 15,
      speed: [0.5, 1.7],
      size: [0.026, 0.07],
      life: [0.6, 1],
      spread: 2,
      lift: 0.3,
    },
    kick: {
      count: 4,
      speed: [0.4, 1.1],
      size: [0.01, 0.024],
      life: [0.3, 0.55],
      spread: 1.4,
      lift: 0.35,
    },
  };

  private readonly chips: readonly Chip[] = Array.from({ length: IceChips.COUNT }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    size: 0,
    grown: 1,
    age: Infinity,
    life: 0,
  }));
  private readonly random: SeededRandom;
  private next = 0;

  constructor(seed: number) {
    this.random = SeededRandom.fromSeed(seed);
  }

  /** How many are in the air. */
  get live(): number {
    let live = 0;
    for (const { age, life } of this.chips) {
      live += age < life ? 1 : 0;
    }
    return live;
  }

  /** A burst of `kind` knocked off the ice at `x`, `y`, flying out of it the way (`outX`,
   * `outY`), a length of 1, for a figure drawn `grown` times life size. */
  burst(x: number, y: number, outX: number, outY: number, grown: number, kind: ChipBurst): void {
    const spray = IceChips.SPRAYS[kind];
    const out = Math.atan2(outY, outX);
    for (let made = 0; made < spray.count; made += 1) {
      const chip = this.chips[this.next];
      this.next = (this.next + 1) % IceChips.COUNT;
      if (chip === undefined) {
        continue;
      }
      const way = out + (this.random.fraction() - 0.5) * spray.spread;
      const speed = this.within(spray.speed) * grown;
      chip.x = x;
      chip.y = y;
      chip.vx = Math.cos(way) * speed;
      chip.vy = Math.sin(way) * speed + spray.lift * speed;
      chip.angle = this.random.fraction() * 2 * Math.PI;
      chip.spin = (this.random.fraction() - 0.5) * 24;
      chip.size = this.within(spray.size) * grown;
      chip.grown = grown;
      chip.age = 0;
      chip.life = this.within(spray.life);
    }
  }

  /** `seconds` later: each chip in the air flown on, slowed by the air and falling. */
  advance(seconds: number): void {
    const frame = Math.max(seconds, 0);
    const kept = Math.pow(IceChips.DRAG, frame);
    for (const chip of this.chips) {
      if (chip.age >= chip.life) {
        continue;
      }
      chip.age += frame;
      // Gravity scales as the figure does, so a chip falls as far as it looks beside it.
      chip.vy -= IceChips.GRAVITY * chip.grown * frame;
      chip.vx *= kept;
      chip.vy *= kept;
      chip.x += chip.vx * frame;
      chip.y += chip.vy * frame;
      chip.angle += chip.spin * frame;
    }
  }

  /** Each chip in the air: where its middle is, how big it is, which way it's turned and how
   * strong it shows. */
  forEach(draw: (x: number, y: number, size: number, angle: number, alpha: number) => void): void {
    for (const { x, y, size, angle, age, life } of this.chips) {
      if (age < life) {
        const left = (life - age) / (life * IceChips.FADE);
        draw(x, y, size, angle, Math.min(1, left));
      }
    }
  }

  private within([least, most]: readonly [number, number]): number {
    return least + (most - least) * this.random.fraction();
  }
}
