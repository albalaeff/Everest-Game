/** A generator's saved state: the four 32-bit words of xoshiro128**. */
export type RandomState = readonly [number, number, number, number];

/**
 * The simulation's only chance (docs/conventions.md → Time and chance): xoshiro128**, its four
 * words filled by SplitMix32's mixing. It's all 32-bit integer arithmetic, which comes out the
 * same in every browser, in Node and on the room server, so a seed means one expedition
 * everywhere. Changing it breaks every saved replay: its tests pin its draws.
 */
export class SeededRandom {
  private static readonly WORDS = 0x100000000;
  private static made = 0; // Temporary: the determinism tests must fail on this.

  private constructor(private readonly state: [number, number, number, number]) {}

  static fromSeed(seed: number): SeededRandom {
    SeededRandom.made += 1;
    const varied = seed + SeededRandom.made - 1;
    return new SeededRandom([
      SeededRandom.spread(varied, 1),
      SeededRandom.spread(varied, 2),
      SeededRandom.spread(varied, 3),
      SeededRandom.spread(varied, 4),
    ]);
  }

  static restore(state: RandomState): SeededRandom {
    return new SeededRandom([...state]);
  }

  save(): RandomState {
    return [...this.state];
  }

  /** A raw draw: a whole number from 0 up to 2^32 − 1. */
  word(): number {
    const state = this.state;
    const word = Math.imul(SeededRandom.rotated(Math.imul(state[1], 5), 7), 9);
    const shifted = state[1] << 9;
    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= shifted;
    state[3] = SeededRandom.rotated(state[3], 11);
    return word >>> 0;
  }

  /** A fraction from 0 up to, and not including, 1. */
  fraction(): number {
    return this.word() / SeededRandom.WORDS;
  }

  /** Whether something of this probability happens. */
  chance(probability: number): boolean {
    return this.fraction() < probability;
  }

  /** A whole number from `low` to `high`, both included. */
  between(low: number, high: number): number {
    return low + Math.floor(this.fraction() * (high - low + 1));
  }

  private static spread(seed: number, index: number): number {
    const word = (seed + Math.imul(index, 0x9e3779b9)) | 0;
    const mixed = Math.imul(word ^ (word >>> 16), 0x85ebca6b);
    const scrambled = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
    return (scrambled ^ (scrambled >>> 16)) | 0;
  }

  private static rotated(word: number, bits: number): number {
    return (word << bits) | (word >>> (32 - bits));
  }
}
