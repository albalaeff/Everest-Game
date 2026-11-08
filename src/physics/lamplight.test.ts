import { describe, expect, it } from "vitest";

import { MountainClock } from "../simulation";
import type { ClimberId, Whereabouts } from "../simulation";
import { Climber } from "./climber";
import type { Kit } from "./climber";
import { Lamplight } from "./lamplight";
import type { KittedLegs } from "./lamplight";

const HOUR = 60 * 60;

/** A climber standing still in `kit`, keeping the sure-footedness the lamps hand on. */
class Standing implements KittedLegs {
  handed = 1;

  constructor(private readonly kit: Kit) {}

  climber(): Whereabouts & { readonly kit: Kit } {
    return { altitude: 5400, moving: false, exertion: 0, kit: this.kit };
  }

  stride(): void {
    // Standing: nothing to stride.
  }

  sureness(_id: ClimberId, share: number): void {
    this.handed = share;
  }
}

/** The lamps on a climber in `kit`, a lamp lasting an hour, first light at 05:00 and the dark
 * halving the footing, on a clock from 03:00. */
function lampsOn(kit: Kit): {
  readonly lamps: Lamplight;
  readonly legs: Standing;
  readonly clock: MountainClock;
} {
  const clock = new MountainClock(36);
  clock.load(MountainClock.start({ date: "2026-04-20", time: "03:00" }));
  const legs = new Standing(kit);
  const lamps = new Lamplight(legs, clock, { lasts: HOUR, firstLight: 5 * HOUR, dark: 0.5 });
  return { lamps, legs, clock };
}

const UNCHECKED: Kit = { ...Climber.CHECKED, lamp: false };

/**
 * The lamps (#196): a headlamp the climber didn't check before setting off dies an hour out, and
 * they're in the dark until first light, less sure of their feet; a checked one lasts.
 */
describe("Lamplight: a headlamp not checked before setting off", () => {
  it("dies an hour out, and leaves its climber in the dark until first light", () => {
    const { lamps, clock } = lampsOn(UNCHECKED);
    clock.skip(0.5 * HOUR);
    const before = { lit: lamps.lit("anna"), dark: lamps.inTheDark("anna") };
    clock.skip(0.75 * HOUR);
    const dead = { lit: lamps.lit("anna"), dark: lamps.inTheDark("anna") };
    clock.skip(HOUR);
    const dawn = { lit: lamps.lit("anna"), dark: lamps.inTheDark("anna") };

    expect(before).toEqual({ lit: true, dark: false });
    expect(dead).toEqual({ lit: false, dark: true });
    expect(dawn).toEqual({ lit: false, dark: false });
  });

  it("halves the climber's footing in the dark, and leaves it as the body makes it by light", () => {
    const { lamps, legs, clock } = lampsOn(UNCHECKED);
    lamps.sureness("anna", 0.8);
    const lit = legs.handed;
    clock.skip(1.5 * HOUR);
    lamps.sureness("anna", 0.8);

    expect(lit).toBe(0.8);
    expect(legs.handed).toBe(0.4);
  });

  it("lasts the night if checked, and a camp's night puts fresh batteries in one that wasn't", () => {
    const checked = lampsOn(Climber.CHECKED);
    checked.clock.skip(1.5 * HOUR);
    const unchecked = lampsOn(UNCHECKED);
    unchecked.clock.skip(24 * HOUR);

    expect(checked.lamps.lit("anna")).toBe(true);
    expect(checked.lamps.inTheDark("anna")).toBe(false);
    expect(unchecked.lamps.lit("anna")).toBe(true);
    expect(unchecked.lamps.inTheDark("anna")).toBe(false);
  });
});
