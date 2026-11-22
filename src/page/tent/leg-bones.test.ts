import { describe, expect, it } from "vitest";
import { Vector3 } from "./hand-bones";
import { LegBones } from "./leg-bones";
import type { LegSet, PelvisTurn } from "./leg-bones";

const STRAIGHT: LegSet = { flex: 0, spread: 0, turn: 0, knee: 0, point: 0 };
const HIP = new Vector3(10, 3, 0);
const BONES = new LegBones();
const { thigh, shin, ankle, foot } = LegBones.MAN;
const px = (millimetres: number): number => millimetres * LegBones.SCALE;

describe("LegBones: a man's leg in three dimensions (#285)", () => {
  it("stands with the knee under the hip, the ankle under the knee, and the foot flat", () => {
    const leg = BONES.posed(1, HIP, STRAIGHT);

    expect(leg.knee.x).toBeCloseTo(HIP.x);
    expect(leg.knee.y).toBeCloseTo(HIP.y + px(thigh));
    expect(leg.ankle.y).toBeCloseTo(leg.knee.y + px(shin));
    // The heel and the ball on the floor, the ankle above them, the toes toward the viewer.
    expect(leg.heel.y).toBeCloseTo(leg.ankle.y + px(ankle));
    expect(leg.ball.y).toBeCloseTo(leg.heel.y);
    expect(leg.toe.z).toBeGreaterThan(leg.ankle.z);
    expect(leg.heel.z).toBeLessThan(leg.ankle.z);
    expect(leg.toe.minus(leg.heel).size).toBeCloseTo(px(foot));
  });

  it("keeps the thigh's and the shin's lengths however it's set", () => {
    const sets: LegSet[] = [
      { flex: 80, spread: 35, turn: 40, knee: 130, point: 20 },
      { flex: 120, spread: -10, turn: -30, knee: 138, point: 55 },
      { flex: -15, spread: 10, turn: 0, knee: 5, point: -13 },
    ];
    for (const set of sets) {
      for (const side of [-1, 1] as const) {
        const leg = BONES.posed(side, HIP, set);
        expect(leg.knee.minus(leg.hip).size).toBeCloseTo(px(thigh));
        expect(leg.ankle.minus(leg.knee).size).toBeCloseTo(px(shin));
        expect(leg.kneecap.size).toBeCloseTo(1);
        expect(leg.kneecap.dot(leg.knee.minus(leg.hip).unit())).toBeCloseTo(0);
      }
    }
  });

  it("bends the hip forward toward the viewer, and swings each thigh out to its own side", () => {
    const sitting = BONES.posed(1, HIP, { ...STRAIGHT, flex: 90 });
    expect(sitting.knee.z).toBeCloseTo(px(thigh));
    expect(sitting.knee.y).toBeCloseTo(HIP.y);

    const left = BONES.posed(-1, HIP, { ...STRAIGHT, flex: 90, spread: 30 });
    const right = BONES.posed(1, HIP, { ...STRAIGHT, flex: 90, spread: 30 });
    expect(left.knee.x).toBeLessThan(HIP.x);
    expect(right.knee.x).toBeGreaterThan(HIP.x);
    // Out in the floor's plane: a flexed hip opens sideways, as a man sitting cross-legged does.
    expect(left.knee.y).toBeCloseTo(HIP.y);
    expect(right.knee.x - HIP.x).toBeCloseTo(HIP.x - left.knee.x);
  });

  it("turns the kneecap out toward its own side, and bends the knee back from it", () => {
    const left = BONES.posed(-1, HIP, { ...STRAIGHT, turn: 30 });
    const right = BONES.posed(1, HIP, { ...STRAIGHT, turn: 30 });
    expect(left.kneecap.x).toBeLessThan(0);
    expect(right.kneecap.x).toBeGreaterThan(0);

    const bent = BONES.posed(1, HIP, { ...STRAIGHT, knee: 90 });
    expect(bent.ankle.z).toBeCloseTo(-px(shin));
    expect(bent.ankle.y).toBeCloseTo(bent.knee.y);
  });

  it("points the toes away from the shin, and flexes them up toward it", () => {
    const flat = BONES.posed(1, HIP, STRAIGHT);
    const pointed = BONES.posed(1, HIP, { ...STRAIGHT, point: 50 });
    const flexed = BONES.posed(1, HIP, { ...STRAIGHT, point: -12 });
    expect(pointed.toe.y).toBeGreaterThan(flat.toe.y);
    expect(flexed.toe.y).toBeLessThan(flat.toe.y);
  });

  it("kneels on all fours: the thighs down to the floor, the shins along it behind, the feet's tops on it", () => {
    // Crawling to the right: the hips' standing-down way is back, to the left; their front is
    // the belly's, toward the floor.
    const crawling: PelvisTurn = {
      right: new Vector3(0, 0, -1),
      down: new Vector3(-1, 0, 0),
      front: new Vector3(0, 1, 0),
    };
    const leg = BONES.posed(
      1,
      HIP,
      { flex: 90, spread: 0, turn: 0, knee: 90, point: 50 },
      crawling,
    );
    expect(leg.knee.y).toBeCloseTo(HIP.y + px(thigh));
    expect(leg.knee.x).toBeCloseTo(HIP.x);
    expect(leg.ankle.y).toBeCloseTo(leg.knee.y);
    expect(leg.ankle.x).toBeLessThan(leg.knee.x);
    expect(leg.toe.x).toBeLessThan(leg.ankle.x);
  });

  it("says which joint a set bends past its range: none for a man sitting cross-legged", () => {
    expect(BONES.beyond({ flex: 80, spread: 35, turn: 40, knee: 130, point: 15 })).toBeNull();
    expect(BONES.beyond({ ...STRAIGHT, knee: 150 })).toBe("knee");
    expect(BONES.beyond({ ...STRAIGHT, flex: 140 })).toBe("flex");
    expect(BONES.beyond({ ...STRAIGHT, point: -30 })).toBe("point");
  });
});
