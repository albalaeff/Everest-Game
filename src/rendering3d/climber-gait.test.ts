import { describe, expect, it } from "vitest";

import { ClimberGait } from "./climber-gait";
import type { GaitMode, Stance } from "./climber-gait";

const FLAT = (): number => 0;
const FRAME = 1 / 60;

/** Walks a gait `metres` forward in frames of `step` metres each, and gives every stance with
 * how far the body had gone by then. */
function walk(
  gait: ClimberGait,
  metres: number,
  step: number,
  mode: GaitMode = "ground",
  ground: (ahead: number) => number = FLAT,
): { readonly gone: number; readonly stance: Stance }[] {
  const frames: { gone: number; stance: Stance }[] = [];
  for (let gone = step; gone <= metres + 1e-9; gone += step) {
    frames.push({ gone, stance: gait.step({ metres: step, seconds: FRAME, mode, ground }) });
  }
  return frames;
}

describe("a climber's steps, made from how far they've gone", () => {
  it("stands with the feet under the hips, the ankles at an ankle's height", () => {
    const gait = new ClimberGait();
    const stance = gait.step({ metres: 0, seconds: FRAME, mode: "ground", ground: FLAT });
    for (const ankle of stance.ankles) {
      expect(ankle.z).toBeCloseTo(0, 9);
      expect(ankle.y).toBeCloseTo(ClimberGait.ANKLE, 9);
    }
    expect(stance.ankles[0].x).toBeLessThan(0);
    expect(stance.ankles[1].x).toBeGreaterThan(0);
    expect(stance.hips.y).toBeCloseTo(ClimberGait.HIPS, 2);
  });

  it("keeps a planted foot where it was put while the body goes on over it", () => {
    const gait = new ClimberGait();
    // Into full stride first: a walk starts over a few steps.
    walk(gait, 3, 0.01);
    const frames = walk(gait, 2, 0.01);
    for (const foot of [0, 1] as const) {
      let planted: number | null = null;
      let checked = 0;
      for (const { gone, stance } of frames) {
        const onTheGround = stance.ankles[foot].y <= ClimberGait.ANKLE + 1e-6;
        // The foot's place on the ground: the body's, and the foot ahead of it (−z is forward).
        const place = gone - stance.ankles[foot].z;
        if (!onTheGround) {
          planted = null;
        } else if (planted === null) {
          planted = place;
        } else {
          expect(place).toBeCloseTo(planted, 2);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(50);
    }
  });

  it("puts one foot down as it lifts the other, a step of half a metre apart", () => {
    const gait = new ClimberGait();
    walk(gait, 3, 0.01);
    const frames = walk(gait, 4, 0.01);
    let lifted = 0;
    for (const { stance } of frames) {
      const up = stance.ankles.filter(({ y }) => y > ClimberGait.ANKLE + 1e-6).length;
      expect(up).toBeLessThanOrEqual(1);
      lifted += up;
    }
    expect(lifted).toBeGreaterThan(frames.length * 0.8);
    const reach = Math.max(...frames.map(({ stance }) => Math.abs(stance.ankles[0].z)));
    expect(reach).toBeCloseTo(0.25, 1);
  });

  it("stops with the walk: the feet come back under the hips", () => {
    const gait = new ClimberGait();
    walk(gait, 2.13, 0.01);
    let stance = gait.step({ metres: 0, seconds: FRAME, mode: "ground", ground: FLAT });
    for (let frame = 0; frame < 120; frame += 1) {
      stance = gait.step({ metres: 0, seconds: FRAME, mode: "ground", ground: FLAT });
    }
    expect(stance.pace).toBeLessThan(0.01);
    for (const ankle of stance.ankles) {
      expect(Math.abs(ankle.z)).toBeLessThan(0.01);
    }
  });

  it("puts each foot on the ground it comes down on, up a slope", () => {
    const gait = new ClimberGait();
    const slope = (ahead: number): number => 0.3 * ahead;
    walk(gait, 3, 0.01, "ground", slope);
    for (const { stance } of walk(gait, 2, 0.01, "ground", slope)) {
      for (const ankle of stance.ankles) {
        // On the slope's line, or lifted over it.
        expect(ankle.y).toBeGreaterThanOrEqual(ClimberGait.ANKLE + 0.3 * -ankle.z - 1e-6);
      }
      expect(stance.lean).toBeGreaterThan(0.1);
    }
  });

  it("crosses a ladder hunched, a hand out to each line", () => {
    const gait = new ClimberGait();
    const [last] = walk(gait, 3, 0.01, "across").slice(-1);
    const upright = new ClimberGait();
    const [walking] = walk(upright, 3, 0.01).slice(-1);
    expect(last?.stance.lean ?? 0).toBeGreaterThan((walking?.stance.lean ?? 0) + 0.05);
    expect(last?.stance.wrists[0].x ?? 0).toBeLessThan(-0.35);
    expect(last?.stance.wrists[1].x ?? 0).toBeGreaterThan(0.35);
  });

  it("climbs a ladder against a wall with the hands above the head and the feet a rung apart", () => {
    const gait = new ClimberGait();
    const frames = walk(gait, 3, 0.01, "upright");
    const apart = Math.max(
      ...frames.map(({ stance }) => Math.abs(stance.ankles[0].y - stance.ankles[1].y)),
    );
    expect(apart).toBeGreaterThan(0.2);
    expect(apart).toBeLessThan(0.3);
    for (const { stance } of frames) {
      for (const wrist of stance.wrists) {
        expect(wrist.y).toBeGreaterThan(1.3);
        expect(wrist.z).toBeLessThan(-0.3);
      }
    }
  });

  it("gives a hand to what it holds, and swings the other", () => {
    const gait = new ClimberGait();
    const hold = { x: 0.4, y: 1.1, z: -0.4 };
    const stance = gait.step({
      metres: 0.01,
      seconds: FRAME,
      mode: "ground",
      ground: FLAT,
      holds: [null, hold],
    });
    expect(stance.wrists[1]).toEqual(hold);
    expect(stance.wrists[0].x).toBeLessThan(0);
  });
});
