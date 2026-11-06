import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Foot, Ground, Joint, Pose, PoseState } from "./climber-pose";

/** A climber as the figure shows them: on ground rising `rise` a metre ahead, unless the state
 * gives the snow's own. */
const state = (over: Partial<PoseState> = {}): PoseState => {
  const rise = over.rise ?? 0;
  return {
    travelled: 10,
    moving: false,
    falling: false,
    dead: false,
    onRope: false,
    clipped: [null, null],
    onLadder: false,
    rise,
    ground: (x) => rise * x,
    tiredness: "fresh",
    pace: "steady",
    ...over,
  };
};

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

/** How far a leg reaches from its hip to its ankle, as a share of the leg's whole length. */
const stretch = (leg: Pose["legs"][number]): number =>
  length(leg.root, leg.end) / (ClimberPose.THIGH + ClimberPose.SHIN);

/** The point of a boot's sole `along` metres ahead of its ankle: its heel behind, its ball ahead. */
const sole = (foot: Foot, along = 0): Joint => ({
  x: foot.ankle.x + along * Math.cos(foot.angle) + ClimberPose.ANKLE * Math.sin(foot.angle),
  y: foot.ankle.y + along * Math.sin(foot.angle) - ClimberPose.ANKLE * Math.cos(foot.angle),
});

/** How far a boot's sole is above the snow, on its crampons, at its lowest from the heel to the
 * ball: none set down, or with the heel peeled up about the ball. */
const clearance = (foot: Foot, ground: Ground = () => 0): number =>
  Math.min(
    ...[-1, -0.5, 0, 0.5, 1].map((share) => {
      const along = share < 0 ? share * ClimberPose.HEEL : share * ClimberPose.BALL;
      const point = sole(foot, along);
      return point.y - ground(point.x) - ClimberPose.CRAMPONS;
    }),
  );

/** How far a boot's heel is up off the snow. */
const heelUp = (foot: Foot, ground: Ground = () => 0): number => {
  const heel = sole(foot, -ClimberPose.HEEL);
  return heel.y - ground(heel.x) - ClimberPose.CRAMPONS;
};

describe("ClimberPose", () => {
  it("keeps its bones' lengths in every pose, the boots on the shins' ends", () => {
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
      for (const [index, leg] of pose.legs.entries()) {
        expect(length(leg.root, leg.middle)).toBeCloseTo(ClimberPose.THIGH, 9);
        expect(length(leg.middle, leg.end)).toBeCloseTo(ClimberPose.SHIN, 9);
        expect(pose.feet[index]?.ankle).toEqual(leg.end);
      }
      for (const arm of pose.arms) {
        expect(length(arm.root, arm.middle)).toBeCloseTo(ClimberPose.UPPER_ARM, 9);
        expect(length(arm.middle, arm.end)).toBeCloseTo(ClimberPose.FOREARM, 9);
      }
    }
  });

  it("stands on both feet, the head over the pelvis, the knees forward and the elbows back", () => {
    const pose = new ClimberPose().advance(1, state());

    for (const foot of pose.feet) {
      expect(clearance(foot)).toBeCloseTo(0, 9);
      expect(foot.angle).toBeCloseTo(0, 9);
    }
    for (const leg of pose.legs) {
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
    const lifted = poses.filter(
      (pose) => Math.max(...pose.feet.map((foot) => clearance(foot))) > 0.05,
    );
    const climber = new ClimberPose();
    for (let travelled = 10; travelled <= 12; travelled += 0.02) {
      climber.advance(1 / 60, state({ moving: true, travelled }));
    }
    const before = climber.advance(1 / 60, state({ moving: true, travelled: 12 }));
    const after = climber.advance(1, state({ moving: true, travelled: 12 }));

    expect(lifted.length).toBeGreaterThan(poses.length / 4);
    for (const pose of poses) {
      expect(Math.min(...pose.feet.map((foot) => clearance(foot)))).toBeLessThan(0.02);
    }
    for (const [index, foot] of after.feet.entries()) {
      expect(foot.ankle.x).toBeCloseTo(before.feet[index]?.ankle.x ?? Number.NaN, 3);
      expect(foot.ankle.y).toBeCloseTo(before.feet[index]?.ankle.y ?? Number.NaN, 3);
      expect(foot.angle).toBeCloseTo(before.feet[index]?.angle ?? Number.NaN, 3);
    }
  });

  it("keeps a boot where it was set down as the climber walks on over it", () => {
    // Each frame the climber comes 2 cm, so a boot on the snow goes 2 cm back under them, its
    // ball where it was even as the heel peels up about it, once the walk has settled.
    const { poses } = walked(5);
    let planted = 0;

    for (const [index, pose] of poses.entries()) {
      const before = poses[index - 1];
      if (index < 30 || before === undefined) {
        continue;
      }
      for (const [leg, foot] of pose.feet.entries()) {
        const was = before.feet[leg === 0 ? 0 : 1];
        if (clearance(foot) < 1e-9 && clearance(was) < 1e-9) {
          planted += 1;
          expect(sole(foot, ClimberPose.BALL).x - sole(was, ClimberPose.BALL).x).toBeCloseTo(
            -0.02,
            9,
          );
          expect(sole(foot, ClimberPose.BALL).y).toBeCloseTo(sole(was, ClimberPose.BALL).y, 9);
        }
      }
    }
    expect(planted).toBeGreaterThan(poses.length - 30);
  });

  it("sets each boot down flat, peels its heel up as the leg pushes off, and swings it clear", () => {
    const { poses } = walked(4);
    let peeled = 0;
    let landed = 0;

    for (const [index, pose] of poses.entries()) {
      const before = poses[index - 1];
      if (index < 30 || before === undefined) {
        continue;
      }
      for (const [leg, foot] of pose.feet.entries()) {
        const was = before.feet[leg === 0 ? 0 : 1];
        expect(clearance(foot)).toBeGreaterThan(-1e-9);
        if (clearance(foot) < 1e-9 && heelUp(foot) > 0.05) {
          peeled += 1;
          expect(foot.ankle.x).toBeLessThan(0);
        }
        if (clearance(foot) < 1e-9 && clearance(was) > 1e-9) {
          landed += 1;
          expect(foot.angle).toBeCloseTo(0, 9);
          expect(foot.ankle.x).toBeGreaterThan(0.2);
        }
      }
    }
    expect(peeled).toBeGreaterThan(10);
    expect(landed).toBeGreaterThan(4);
  });

  it("sets its boots on the snow however it lies, and keeps them there as it walks over it", () => {
    // The snow rises and falls under a climber going level; the figure gives the pose the snow's
    // height ahead of them, above the snow under them.
    const snow = (x: number): number => 0.12 * Math.sin(2.3 * x) + 0.05 * Math.sin(5.1 * x + 1);
    const under = (x: number): Ground => (ahead) => snow(x + ahead) - snow(x);
    const climber = new ClimberPose();
    climber.advance(1, state({ ground: under(0) }));
    const frames: { x: number; pose: Pose }[] = [];
    for (let travelled = 10; travelled <= 16 + 1e-9; travelled += 0.02) {
      const x = travelled - 10;
      const pose = climber.advance(1 / 60, state({ moving: true, travelled, ground: under(x) }));
      frames.push({ x, pose });
    }
    let kept = 0;

    for (const [index, { x, pose }] of frames.entries()) {
      const before = frames[index - 1];
      if (index < 30 || before === undefined) {
        continue;
      }
      const clear = pose.feet.map((foot) => clearance(foot, under(x)));
      expect(Math.min(...clear)).toBeLessThan(0.005);
      for (const [leg, foot] of pose.feet.entries()) {
        const was = before.pose.feet[leg === 0 ? 0 : 1];
        expect(clear[leg]).toBeGreaterThan(-0.005);
        if ((clear[leg] ?? 1) < 0.005 && clearance(was, under(before.x)) < 0.005) {
          kept += 1;
          // Its ball stays where it was across, and on the snow: on a hump the boot rocks forward
          // onto it before it turns about it.
          const ball = sole(foot, ClimberPose.BALL);
          const wasBall = sole(was, ClimberPose.BALL);
          expect(x + ball.x).toBeCloseTo(before.x + wasBall.x, 6);
        }
      }
    }
    expect(kept).toBeGreaterThan(frames.length - 30);
  });

  it("stands its feet on the slope, the lifted one above it, and leans into it going up", () => {
    const rise = 0.5;
    const ground: Ground = (x) => rise * x;
    const { poses } = walked(2, { rise });
    const standing = new ClimberPose().advance(1, state({ rise }));

    for (const pose of poses.slice(30)) {
      const [lower, higher] = pose.feet
        .map((foot) => clearance(foot, ground))
        .sort((a, b) => a - b);
      expect(lower).toBeCloseTo(0, 6);
      expect(higher).toBeGreaterThanOrEqual(-1e-6);
    }
    for (const foot of standing.feet) {
      expect(clearance(foot, ground)).toBeCloseTo(0, 9);
      expect(foot.angle).toBeCloseTo(Math.atan(rise), 9);
    }
    expect(standing.lean).toBeGreaterThan(new ClimberPose().advance(1, state()).lean);
  });

  it("locks the downhill leg straight in each rest step, its boot flat, and keeps the knees bent at a steady pace", () => {
    const rise = 0.4;
    const ground: Ground = (x) => rise * x;
    const rest = walked(3, { rise, pace: "rest-step" }).poses.slice(40);
    const steady = walked(3, { rise }).poses.slice(40);
    let locked = 0;

    for (const pose of rest) {
      for (const [index, leg] of pose.legs.entries()) {
        const foot = pose.feet[index === 0 ? 0 : 1];
        if (stretch(leg) > 0.995 && leg.end.x < 0 && clearance(foot, ground) < 1e-9) {
          locked += 1;
          expect(foot.angle).toBeCloseTo(Math.atan(rise), 9);
        }
      }
    }
    // At least once in each stride of 0.42 m / 0.6 = 0.7 m: four or more in 3 m.
    expect(locked).toBeGreaterThan(4);
    for (const pose of steady) {
      for (const leg of pose.legs) {
        expect(stretch(leg)).toBeLessThan(0.99);
      }
    }
    expect(
      steady.some((pose) => pose.feet.some((foot) => foot.angle < Math.atan(rise) - 0.3)),
    ).toBe(true);
  });

  it("holds the jumar still on the rope as the climber steps up to it, then slides it on", () => {
    const { poses } = walked(3, { onRope: true, clipped: ["line", null] });
    let held = 0;
    let slid = 0;

    for (const [index, pose] of poses.entries()) {
      const before = poses[index - 1];
      if (index < 40 || before === undefined) {
        continue;
      }
      const moved = pose.arms[0].end.x - before.arms[0].end.x;
      if (Math.abs(moved + 0.02) < 0.004) {
        held += 1;
      } else if (moved > 0.01) {
        slid += 1;
      }
    }
    expect(held).toBeGreaterThan(slid);
    expect(slid).toBeGreaterThan(5);
  });

  it("holds the rope a little above the jumar with the far hand, where it comes up off the snow", () => {
    const rise = 0.4;
    const ground: Ground = (x) => rise * x;
    const { pose } = walked(3, { rise, onRope: true, clipped: ["line", null] });
    const jumar = pose.arms[0].end;
    const off = ClimberPose.ropeOff(jumar, ground);
    const along = length(jumar, off);
    const held: Joint = {
      x: jumar.x + ((off.x - jumar.x) / along) * ClimberPose.ROPE_HOLD,
      y: jumar.y + ((off.y - jumar.y) / along) * ClimberPose.ROPE_HOLD,
    };

    expect(off.x).toBeCloseTo(jumar.x + ClimberPose.ROPE_AHEAD, 9);
    expect(off.y).toBeCloseTo(ground(off.x), 9);
    expect(length(pose.arms[1].end, held)).toBeLessThan(0.01);
  });

  it("bends to the anchor to move the jumar past it, then stands to the rope again", () => {
    const climber = new ClimberPose();
    const onFirst = state({ onRope: true, clipped: ["first", "first"] });
    const holding = climber.advance(2, onFirst);
    climber.advance(1 / 60, state({ ...onFirst, clipped: ["first", "second"] }));
    const bent = climber.advance(0.5, state({ ...onFirst, clipped: ["second", "second"] }));
    const after = climber.advance(3, state({ ...onFirst, clipped: ["second", "second"] }));

    expect(bent.lean).toBeGreaterThan(holding.lean + 0.3);
    expect(bent.arms[0].end.y).toBeLessThan(holding.arms[0].end.y - 0.15);
    expect(bent.arms[1].end.y).toBeLessThan(holding.arms[1].end.y);
    expect(bent.gaze).toBeLessThan(holding.gaze - 0.2);
    expect(after.lean).toBeCloseTo(holding.lean, 3);
    expect(length(after.arms[0].end, holding.arms[0].end)).toBeLessThan(1e-3);
  });

  it("looks down at its feet, and now and then up the slope ahead as it walks", () => {
    const rise = 0.3;
    const down = Math.atan(rise) + ClimberPose.GAZE.down;
    const { poses } = walked(20, { rise });
    const climber = new ClimberPose();
    for (let travelled = 10; travelled <= 30; travelled += 0.02) {
      climber.advance(1 / 60, state({ rise, moving: true, travelled }));
    }
    const stopped = climber.advance(2, state({ rise, travelled: 30 }));
    const ahead = poses.filter((pose) => pose.gaze > down + 0.25);
    const atTheFeet = poses.filter((pose) => Math.abs(pose.gaze - down) < 1e-9);

    expect(new ClimberPose().advance(1, state({ rise })).gaze).toBeCloseTo(down, 9);
    expect(ahead.length).toBeGreaterThan(0);
    expect(atTheFeet.length).toBeGreaterThan(poses.length / 2);
    expect(stopped.gaze).toBeCloseTo(down, 9);
  });

  it("comes to a stand when it stops, the feet together", () => {
    const climber = new ClimberPose();
    for (let travelled = 10; travelled <= 10.4; travelled += 0.02) {
      climber.advance(1 / 60, state({ moving: true, travelled }));
    }
    const pose = climber.advance(2, state({ travelled: 10.4 }));

    for (const foot of pose.feet) {
      expect(Math.abs(clearance(foot))).toBeLessThan(0.002);
      expect(Math.abs(foot.ankle.x)).toBeLessThan(0.12);
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

    expect(clipped.arms[0].end.x).toBeGreaterThan(0.2);
    expect(clipped.arms[0].end.y).toBeLessThan(clipped.shoulder.y - 0.2);
    expect(clipped.lean).toBeGreaterThan(free.lean + 0.1);
    expect(length(clipped.arms[0].end, free.arms[0].end)).toBeGreaterThan(0.1);
    for (const arm of ladder.arms) {
      expect(arm.end.x).toBeGreaterThan(0.2);
      expect(arm.end.y).toBeGreaterThan(0.9);
    }
    expect(Math.max(...ladder.feet.map((foot) => clearance(foot)))).toBeLessThan(
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
