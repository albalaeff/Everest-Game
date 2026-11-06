/**
 * How a ladder laid across a crevasse gives under the climbers on it (docs/guidelines/graphics.md
 * → Motion): as a beam resting on its two ends does, deepest under a climber in its middle, less
 * under one near an end, and not at all at its ends; under two, the two together. The rungs and the
 * climber on them go down with it. It keeps only the ladder's length: the picture asks it each
 * frame.
 */
export class LadderBow {
  /** How far a ladder gives under one climber in its middle. */
  static readonly BOW_METRES = 0.06;

  constructor(private readonly length: number) {}

  /** How far it gives `along` from its end, with a climber at each of `loads` along it. */
  sag(loads: readonly number[], along: number): number {
    let sag = 0;
    for (const load of loads) {
      sag += this.under(load, along);
    }
    return sag;
  }

  /** Under one climber `at` along it: a beam's bending under a weight there, BOW_METRES under one
   * in the middle. */
  private under(at: number, along: number): number {
    const { length } = this;
    if (length <= 0) {
      return 0;
    }
    const a = Math.min(Math.max(at, 0), length);
    const b = length - a;
    const s = Math.min(Math.max(along, 0), length);
    const square = length * length;
    // From the nearer end on the weight's side: s b (L² - b² - s²), and the same the other way.
    const bent =
      s <= a
        ? s * b * (square - b * b - s * s)
        : (length - s) * a * (square - a * a - (length - s) ** 2);
    return (LadderBow.BOW_METRES * bent) / ((square * square) / 8);
  }
}
