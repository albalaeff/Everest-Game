import type { SeededRandom } from "../simulation";

/**
 * A smooth wander across x, from -1 to 1: a random height every `every` metres, eased from one to
 * the next, as the edge of a layer of ice or the foot of a block wanders. Drawn once from the
 * picture's own seeded generator, it repeats after hundreds of metres, past any section's end.
 */
export class Wander {
  /** How many random heights it has before it repeats. */
  private static readonly KNOTS = 256;

  private readonly knots: readonly number[];

  constructor(
    random: SeededRandom,
    private readonly every: number,
  ) {
    this.knots = Array.from({ length: Wander.KNOTS }, () => random.fraction() * 2 - 1);
  }

  /** How far it wanders at `x`, from -1 to 1. */
  at(x: number): number {
    const place = x / this.every;
    const below = Math.floor(place);
    const share = place - below;
    const count = this.knots.length;
    const index = ((below % count) + count) % count;
    const from = this.knots[index] ?? 0;
    const to = this.knots[(index + 1) % count] ?? 0;
    return from + (to - from) * share * share * (3 - 2 * share);
  }
}
