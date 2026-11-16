import { describe, expect, it } from "vitest";

import { RopeGive } from "./rope-give";

/** A static rope's give under a climber's weight, as a share of its loaded length. */
const STRETCH = 0.035;

/** The give after `seconds` of `load` on `span` metres of rope, in frames of `frame` seconds; and
 * the most it was on the way. */
function after(
  give: RopeGive,
  seconds: number,
  load: number,
  span: number,
  frame = 1 / 60,
): { readonly metres: number; readonly most: number } {
  let most = give.metres;
  for (let time = 0; time < seconds - 1e-9; time += frame) {
    give.advance(frame, load, span);
    most = Math.max(most, give.metres);
  }
  return { metres: give.metres, most };
}

describe("RopeGive", () => {
  it("gives nothing with no weight on the rope", () => {
    const give = new RopeGive(STRETCH);

    expect(after(give, 2, 0, 6).metres).toBe(0);
    expect(give.quiver).toBe(0);
  });

  it("sinks by the stretch's share of the loaded rope, and settles there", () => {
    const give = new RopeGive(STRETCH);

    expect(after(give, 6, 1, 6).metres).toBeCloseTo(STRETCH * 6, 3);
  });

  it("bobs as the weight comes onto it at once: past where it settles, and back", () => {
    const give = new RopeGive(STRETCH);
    const { most } = after(give, 1.5, 1, 6);
    const rest = STRETCH * 6;

    expect(most).toBeGreaterThan(rest * 1.15);
    expect(most).toBeLessThan(rest * 1.8);
    // Once over the top it comes back under where it settles, before it's still.
    let least = Infinity;
    for (let frame = 0; frame < 30; frame += 1) {
      give.advance(1 / 60, 1, 6);
      least = Math.min(least, give.metres);
    }
    expect(least).toBeLessThan(rest);
  });

  it("gives more on a longer rope, and bobs slower on it", () => {
    const firstPeak = (span: number): number => {
      const give = new RopeGive(STRETCH);
      let before = 0;
      for (let frame = 1; frame < 600; frame += 1) {
        give.advance(1 / 120, 1, span);
        if (give.metres < before) {
          return frame / 120;
        }
        before = give.metres;
      }
      return Infinity;
    };
    const short = new RopeGive(STRETCH);
    const long = new RopeGive(STRETCH);

    expect(after(long, 8, 1, 8).metres).toBeGreaterThan(after(short, 8, 1, 2).metres * 3);
    expect(firstPeak(8)).toBeGreaterThan(firstPeak(2) * 1.5);
  });

  it("never draws a climber further below their rope than its most", () => {
    const give = new RopeGive(STRETCH);

    expect(after(give, 6, 1, 40).most).toBeLessThanOrEqual(RopeGive.MOST_METRES);
  });

  it("comes back up as the weight comes off", () => {
    const give = new RopeGive(STRETCH);
    after(give, 4, 1, 6);

    expect(after(give, 4, 0, 6).metres).toBeCloseTo(0, 3);
  });

  it("gives half as much under half the weight", () => {
    const give = new RopeGive(STRETCH);

    expect(after(give, 6, 0.5, 6).metres).toBeCloseTo((STRETCH * 6) / 2, 3);
  });

  it("ends where it would on a phone's frames as on a PC's", () => {
    const pc = new RopeGive(STRETCH);
    const phone = new RopeGive(STRETCH);

    expect(after(phone, 0.5, 1, 6, 1 / 30).metres).toBeCloseTo(
      after(pc, 0.5, 1, 6, 1 / 60).metres,
      6,
    );
  });

  it("quivers as the rope comes taut, and is still again within a second", () => {
    const give = new RopeGive(STRETCH);
    let most = 0;
    for (let frame = 0; frame < 20; frame += 1) {
      give.advance(1 / 60, 1, 6);
      most = Math.max(most, Math.abs(give.quiver));
    }

    expect(most).toBeGreaterThan(0.01);
    expect(most).toBeLessThanOrEqual(RopeGive.QUIVER_METRES);
    after(give, 1, 1, 6);
    expect(Math.abs(give.quiver)).toBeLessThan(0.002);
  });

  it("doesn't quiver again while the weight stays on", () => {
    const give = new RopeGive(STRETCH);
    after(give, 3, 1, 6);
    let most = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      give.advance(1 / 60, 1, 6);
      most = Math.max(most, Math.abs(give.quiver));
    }

    expect(most).toBeLessThan(1e-3);
  });
});
