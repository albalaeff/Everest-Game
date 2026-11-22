import { describe, expect, it } from "vitest";
import { DwellerLegs } from "./dweller-legs";
import { LegBones } from "./leg-bones";

const legs = new DwellerLegs();
const thigh = LegBones.MAN.thigh * LegBones.SCALE;

describe("DwellerLegs: the tent person's legs in three dimensions (#285)", () => {
  it("sits cross-legged: the knees up and out, each ankle under the other thigh, one shin in front", () => {
    const [left, right] = legs.legs(0);
    expect(left.knee.x).toBeLessThan(-60);
    expect(right.knee.x).toBeGreaterThan(60);
    // The knees above the hips, as a man in a down suit sits within his joints' ranges.
    expect(left.knee.y).toBeLessThan(-20);
    expect(right.knee.y).toBeLessThan(-20);
    // Crossed: each ankle past the middle, toward the other knee; the right leg's in front.
    expect(left.ankle.x).toBeGreaterThan(0);
    expect(right.ankle.x).toBeLessThan(0);
    expect(right.ankle.z).toBeGreaterThan(left.ankle.z + 20);
  });

  it("kneels: the thighs upright, the knees on the mat under the hips, the shins back along it", () => {
    for (const leg of legs.legs(1)) {
      expect(leg.knee.y - leg.hip.y).toBeCloseTo(thigh, 0);
      expect(Math.abs(leg.ankle.y - leg.knee.y)).toBeLessThan(10);
      // Back, away from the door the body leans toward.
      expect(leg.ankle.x).toBeGreaterThan(leg.knee.x + 60);
    }
  });

  it("bends no joint past its range, and moves no joint more than a little a frame, all the way", () => {
    let last = legs.legs(0);
    for (let frame = 0; frame <= 60; frame += 1) {
      const under = frame / 60;
      expect(legs.beyond(under), `at ${under}`).toBeNull();
      const now = legs.legs(under);
      for (const side of [0, 1] as const) {
        for (const joint of ["knee", "ankle", "toe"] as const) {
          const moved = now[side][joint].minus(last[side][joint]).size;
          expect(moved, `${joint} ${side} at ${under}`).toBeLessThan(12);
        }
      }
      last = now;
    }
  });
});
