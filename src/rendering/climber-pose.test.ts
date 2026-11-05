import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint, Pose, PoseState } from "./climber-pose";

const state = (over: Partial<PoseState> = {}): PoseState => ({
  travelled: 10,
  moving: false,
  falling: false,
  dead: false,
  onRope: false,
  onLadder: false,
  tiredness: "fresh",
  pace: "steady",
  ...over,
});

const length = (a: Joint, b: Joint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A climber walked `metres` at `pace`, a few centimetres a frame, from a stand. */
function walked(metres: number, over: Partial<PoseState> = {}): { pose: Pose; poses: Pose[] } {
  const climber = new ClimberPose();
  let pose = climber.advance(1, state(over));
  const poses: Pose[] = [pose];
  for (let travelled = 10; travelled <= 10 + metres + 1e-9; travelled += 0.02) {
    pose = climber.advance(1 / 60, state({ ...over, moving: true, travelled }));
    poses.push(pose);
  }
  return { pose, poses };
}

describe("ClimberPose", () => {
  it("keeps its bones' lengths in every pose", () => {
    const poses = [
      new ClimberPose().advance(1, state()),
      walked(1).pose,
      walked(0.3, { onRope: true }).pose,
      walked(0.5, { onLadder: true }).pose,
      new ClimberPose().advance(2, state({ tiredness: "exhausted" })),
      new ClimberPose().advance(1, state({ falling: true })),
      new ClimberPose().advance(1, state({ dead: true })),
    ];

    for (const pose of poses) {
      expect(length(pose.pelvis, pose.shoulder)).toBeCloseTo(ClimberPose.SPINE, 9);
      expect(length(pose.shoulder, pose.head)).toBeCloseTo(ClimberPose.NECK, 9);
      for (const leg of pose.legs) {
        expect(length(leg.root, leg.middle)).toBeCloseTo(ClimberPose.THIGH, 9);
        expect(length(leg.middle, leg.end)).toBeCloseTo(ClimberPose.SHIN, 9);
      }
      for (const arm of pose.arms) {
        expect(length(arm.root, arm.middle)).toBeCloseTo(ClimberPose.UPPER_ARM, 9);
        expect(length(arm.middle, arm.end)).toBeCloseTo(ClimberPose.FOREARM, 9);
      }
    }
  });

  it("stands on both feet, the head over the pelvis, the knees forward and the elbows back", () => {
    const pose = new ClimberPose().advance(1, state());

    for (const leg of pose.legs) {
      expect(Math.abs(leg.end.y)).toBeLessThan(1e-6);
      expect(leg.middle.x).toBeGreaterThan(leg.root.x - 1e-9);
    }
    for (const arm of pose.arms) {
      expect(arm.middle.x).toBeLessThan(arm.root.x + 0.05);
    }
    expect(pose.head.y).toBeGreaterThan(pose.shoulder.y);
    expect(pose.shoulder.y).toBeGreaterThan(pose.pelvis.y);
    expect(pose.pelvis.y).toBeCloseTo(ClimberPose.STANDING, 6);
    expect(pose.lean).toBeLessThan(0.1);
    expect(pose.tilt).toBe(0);
  });

  it("walks as the physics moves it, a foot lifted and one on the ground, not as time passes", () => {
    const { poses } = walked(1);
    const lifted = poses.filter((pose) => Math.max(...pose.legs.map((leg) => leg.end.y)) > 0.05);
    const climber = new ClimberPose();
    for (let travelled = 10; travelled <= 12; travelled += 0.02) {
      climber.advance(1 / 60, state({ moving: true, travelled }));
    }
    const before = climber.advance(1 / 60, state({ moving: true, travelled: 12 }));
    const after = climber.advance(1, state({ moving: true, travelled: 12 }));

    expect(lifted.length).toBeGreaterThan(poses.length / 4);
    for (const pose of poses) {
      expect(Math.min(...pose.legs.map((leg) => leg.end.y))).toBeLessThan(0.02);
    }
    for (const [index, leg] of after.legs.entries()) {
      expect(leg.end.x).toBeCloseTo(before.legs[index]?.end.x ?? Number.NaN, 3);
      expect(leg.end.y).toBeCloseTo(before.legs[index]?.end.y ?? Number.NaN, 3);
    }
  });

  it("comes to a stand when it stops, the feet together", () => {
    const climber = new ClimberPose();
    for (let travelled = 10; travelled <= 10.4; travelled += 0.02) {
      climber.advance(1 / 60, state({ moving: true, travelled }));
    }
    const pose = climber.advance(2, state({ travelled: 10.4 }));

    for (const leg of pose.legs) {
      expect(Math.abs(leg.end.y)).toBeLessThan(0.002);
      expect(Math.abs(leg.end.x)).toBeLessThan(0.12);
    }
  });

  it("steps shorter in the rest step and longer at a faster pace", () => {
    expect(ClimberPose.STRIDE["rest-step"]).toBeLessThan(ClimberPose.STRIDE.steady);
    expect(ClimberPose.STRIDE.steady).toBeLessThan(ClimberPose.STRIDE.faster);
    expect(ClimberPose.RUNG_STRIDE).toBeLessThan(ClimberPose.STRIDE["rest-step"]);
  });

  it("leans further the more tired, and bends double over its knees exhausted at a halt", () => {
    const fresh = new ClimberPose().advance(1, state());
    const tired = new ClimberPose().advance(1, state({ tiredness: "tired" }));
    const exhausted = new ClimberPose().advance(2, state({ tiredness: "exhausted" }));
    const walkingExhausted = walked(1, { tiredness: "exhausted" }).pose;

    expect(tired.lean).toBeGreaterThan(fresh.lean);
    expect(exhausted.lean).toBeGreaterThan(0.8);
    expect(walkingExhausted.lean).toBeLessThan(0.7);
    expect(walkingExhausted.lean).toBeGreaterThan(walked(1).pose.lean);
    for (const [index, arm] of exhausted.arms.entries()) {
      expect(length(arm.end, exhausted.legs[index]?.middle ?? arm.end)).toBeLessThan(0.1);
    }
  });

  it("holds the jumar on the rope ahead when clipped, bent to it, and a ladder's lines with both hands", () => {
    const clipped = walked(0.3, { onRope: true }).pose;
    const ladder = walked(0.5, { onLadder: true }).pose;
    const free = walked(0.3).pose;

    expect(clipped.arms[0].end.x).toBeGreaterThan(0.35);
    expect(clipped.arms[0].end.y).toBeLessThan(0.8);
    expect(clipped.lean).toBeGreaterThan(free.lean + 0.1);
    expect(length(clipped.arms[0].end, free.arms[0].end)).toBeGreaterThan(0.1);
    for (const arm of ladder.arms) {
      expect(arm.end.x).toBeGreaterThan(0.2);
      expect(arm.end.y).toBeGreaterThan(0.9);
    }
    expect(Math.max(...ladder.legs.map((leg) => leg.end.y))).toBeLessThan(
      ClimberPose.RUNG_LIFT + 1e-9,
    );
  });

  it("goes over in a fall, the limbs flung out, and lies flat and still once dead", () => {
    const climber = new ClimberPose();
    const begun = climber.advance(0.1, state({ falling: true }));
    const over = climber.advance(1, state({ falling: true }));
    const dead = new ClimberPose().advance(1, state({ dead: true }));

    expect(begun.tilt).toBeGreaterThan(0);
    expect(begun.tilt).toBeLessThan(ClimberPose.FALLEN_RADIANS);
    expect(over.tilt).toBeCloseTo(ClimberPose.FALLEN_RADIANS, 9);
    expect(length(over.legs[0].end, over.legs[1].end)).toBeGreaterThan(0.5);
    expect(dead.tilt).toBeCloseTo(ClimberPose.DEAD_RADIANS, 9);
    expect(length(dead.legs[0].end, dead.legs[1].end)).toBeLessThan(0.2);
    expect(dead).toEqual(new ClimberPose().advance(5, state({ dead: true })));
  });
});
