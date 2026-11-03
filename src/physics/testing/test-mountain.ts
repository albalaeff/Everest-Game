import { SimulationClock } from "../../simulation";
import type { Scenario } from "../../simulation";
import { SlopePhysics } from "../slope-physics";
import type { ClimberLayout, RopeLayout, SlopeLayout, SlopeSettings } from "../slope-physics";
import { Terrain } from "../terrain";
import type { Pair } from "../terrain";

/**
 * Ground and numbers for the slope physics' tests: each mountain is a piece of ground to lay a
 * section out on. They're made up, and aren't game data: the game's numbers come from the
 * knowledge base (docs/conventions/slope-physics.md). Only tests import it.
 */
export class TestMountain {
  /** Friction 0.4 holds a slide on ground up to about 22°, and slips start past 25°. */
  static readonly SETTINGS: SlopeSettings = {
    gravity: 9.8,
    friction: 0.4,
    cowstail: 0.8,
    walkingSpeed: [
      [-60, 0.4],
      [0, 1],
      [60, 0.25],
    ],
    slipChance: [
      [-45, 2],
      [-25, 0],
      [25, 0],
      [45, 2],
    ],
  };
  /** Nobody ever slips. */
  static readonly CALM: SlopeSettings = { ...TestMountain.SETTINGS, slipChance: [[0, 0]] };
  /** Every step taken on any ground is a slip. */
  static readonly HARSH: SlopeSettings = {
    ...TestMountain.SETTINGS,
    slipChance: [[0, SimulationClock.STEPS_PER_SECOND]],
  };

  /** A hundred metres of flat ground. */
  static readonly FLAT = new TestMountain([
    [0, 0],
    [100, 0],
  ]);
  /** A run-out of 40 m, a 40° slope 65.3 m long, and a ledge above it. */
  static readonly SLOPE = new TestMountain([
    [0, 0],
    [40, 0],
    [90, 42],
    [120, 42],
  ]);
  /** A 15° slope, where friction holds a slide. */
  static readonly GENTLE = new TestMountain([
    [0, 0],
    [100, 26.8],
  ]);
  /** Flat ground with a crevasse 3 m wide and 30 m deep, from x = 20 to 23. */
  static readonly CREVASSE = new TestMountain([
    [0, 0],
    [20, 0],
    [20, -30],
    [23, -30],
    [23, 0],
    [50, 0],
  ]);

  private constructor(readonly ground: readonly Pair[]) {}

  /** Where `metres` up the 40° slope of `SLOPE` is, along its ground. */
  static upTheSlope(metres: number): number {
    return 40 + metres;
  }

  /** A scenario: the seed, and who climbs, in the layout's order. */
  static scenario(seed: number, layout: SlopeLayout): Scenario {
    const climbers = layout.climbers.map((climber) => climber.id);
    return { seed, climbers, start: { [SlopePhysics.NAME]: SlopePhysics.start(layout) } };
  }

  get terrain(): Terrain {
    return new Terrain(this.ground);
  }

  /** A section on this ground, with these climbers and ropes. */
  layout(climbers: readonly ClimberLayout[], ropes: readonly RopeLayout[] = []): SlopeLayout {
    return { terrain: this.ground, ropes, climbers };
  }
}
