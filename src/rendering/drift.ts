import type { SeededRandom } from "../simulation";

/** A mote of blown snow: where it is, in metres, how high it rides over the ground, how fast it
 * goes at full gust, its size, and its own wobble. */
export interface Mote {
  x: number;
  y: number;
  readonly height: number;
  readonly speed: number;
  readonly size: number;
  readonly wobble: number;
  readonly phase: number;
}

export interface DriftOptions {
  readonly count: number;
  /** Where the motes run, in metres: past `to`, one comes back in at `from`. */
  readonly from: number;
  readonly to: number;
  /** How high over the ground they ride, from the lowest to the highest. */
  readonly height: { readonly min: number; readonly max: number };
  readonly size: { readonly min: number; readonly max: number };
  /** Metres a second at full gust, from the slowest mote to the fastest. */
  readonly speed: { readonly min: number; readonly max: number };
}

/**
 * Snow on the wind, in a layer's metres: spindrift along the slope, or the plume off a summit.
 * So many motes, each at its own height and speed, blown along by the gust and wobbling a
 * little, and back in at the start once past the end. Drawn by a seeded generator of its own, the
 * picture's, never the simulation's. The drawing is the layer's; this is where the motes are.
 */
export class Drift {
  private static readonly WOBBLE_METRES = 0.08;
  private static readonly WOBBLE_A_SECOND = 2.2;

  readonly motes: readonly Mote[];

  constructor(
    private readonly options: DriftOptions,
    random: SeededRandom,
  ) {
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    const { from, to, height, size, speed } = options;
    this.motes = Array.from({ length: options.count }, () => {
      // Most motes ride low: the square keeps them near the ground.
      const low = random.fraction() ** 2;
      return {
        x: between(from, to),
        y: 0,
        height: height.min + low * (height.max - height.min),
        speed: between(speed.min, speed.max),
        size: between(size.min, size.max),
        wobble: between(0.2, 1) * Drift.WOBBLE_METRES,
        phase: between(0, 2 * Math.PI),
      };
    });
  }

  /** `seconds` more of wind at `gust`, 0 to 1, over `ground`, at `elapsed` seconds of picture. */
  blow(seconds: number, gust: number, ground: (x: number) => number, elapsed: number): void {
    const { from, to } = this.options;
    const span = to - from;
    for (const mote of this.motes) {
      const x = mote.x + mote.speed * Math.max(gust, 0) * seconds;
      mote.x = from + ((((x - from) % span) + span) % span);
      mote.y =
        ground(mote.x) +
        mote.height +
        mote.wobble * Math.sin(elapsed * Drift.WOBBLE_A_SECOND + mote.phase);
    }
  }
}
