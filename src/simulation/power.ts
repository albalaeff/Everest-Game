/**
 * A number raised to a fixed power from 0 up to 1 (#272), from square roots and products alone:
 * the power's binary digits pick which of the number's square root, fourth root, eighth root and
 * so on to multiply together. So it gives the same digits in every browser, in Node and on the
 * room server, where `**` may not (docs/conventions/simulation-core.md → The same result
 * everywhere). It keeps the power's first sixteen binary digits, so the power it raises to is off
 * by less than 2^-16: a few parts in a hundred thousand of the result, for the winds a climber
 * meets. The wind chill's 0.16 is the power it was made for.
 */
export class Power {
  private static readonly DIGITS = 16;
  /** Whether each of the power's binary digits after the point is a one, the first first. */
  private readonly digits: readonly boolean[];

  constructor(readonly power: number) {
    if (!(power >= 0 && power <= 1)) {
      throw new RangeError(`A power from 0 to 1 is raised to with roots, not ${power}`);
    }
    const digits: boolean[] = [];
    let left = power;
    for (let digit = 0; digit < Power.DIGITS; digit += 1) {
      // Doubling a number is exact, so its digits come out the same everywhere.
      left *= 2;
      const one = left >= 1;
      digits.push(one);
      if (one) {
        left -= 1;
      }
    }
    this.digits = digits;
  }

  /** `value` raised to the power: none of nought, and all of it at a power of 1. */
  of(value: number): number {
    if (!(value >= 0)) {
      throw new RangeError(`Only a number from nought up has a root, not ${value}`);
    }
    if (this.power === 1) {
      return value;
    }
    let root = value;
    let raised = 1;
    for (const one of this.digits) {
      root = Math.sqrt(root);
      if (one) {
        raised *= root;
      }
    }
    return raised;
  }
}
