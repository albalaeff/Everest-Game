import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint, LadderFooting, Pose, PoseState } from "./climber-pose";

const FRAME = 1 / 60;
const flat = (): number => 0;
const LEGS = [0, 1] as const;

const state = (over: Partial<PoseState> = {}): PoseState => ({
  travelled: 0,
  moving: false,
  falling: false,
  dead: false,
  tiredness: "fresh",
  pace: "steady",
  ground: flat,
  jumar: null,
  carabiner: null,
  sliding: false,
  slack: 10,
  ladder: null,
  ...over,
});

const length = (a: Joint, b: Joint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A ladder across a crevasse, its rungs every 0.3 m from 0.15, as a climber at `x` sees it. */
const across = (x: number): LadderFooting => ({
  way: { x: 1, y: 0 },
  rung: 0.15 - x,
  spacing: 0.3,
  ends: [-1 - x, 20 - x],
});

/** A ladder up a wall, its rungs every 0.3 m from 0.15, as a climber `y` up it sees it. */
const upAWall = (y: number): LadderFooting => ({
  way: { x: 0, y: 1 },
  rung: 0.15 - y,
  spacing: 0.3,
  ends: [-y, 6 - y],
});

/** A frame of a climb: where the climber's point was, and the pose. */
interface Frame {
  readonly x: number;
  readonly y: number;
  readonly pose: Pose;
}

/** Where a joint of a frame's pose is in the world: from where the figure stands, turned with
 * it. */
function inWorld(frame: Frame, joint: Joint): Joint {
  const { offset, tilt } = frame.pose;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  return {
    x: frame.x + offset.x + joint.x * cos + joint.y * sin,
    y: frame.y + offset.y - joint.x * sin + joint.y * cos,
  };
}

/** The ball of a boot, which it rolls on. */
function ball(pose: Pose, leg: 0 | 1): Joint {
  const ankle = pose.legs[leg].end;
  const sole = pose.soles[leg];
  return {
    x: ankle.x + ClimberPose.BALL * Math.cos(sole) + ClimberPose.ANKLE * Math.sin(sole),
    y: ankle.y + ClimberPose.BALL * Math.sin(sole) - ClimberPose.ANKLE * Math.cos(sole),
  };
}

/** The point of a boot's sole under its ankle. */
function underAnkle(pose: Pose, leg: 0 | 1): Joint {
  const ankle = pose.legs[leg].end;
  const sole = pose.soles[leg];
  return {
    x: ankle.x + ClimberPose.ANKLE * Math.sin(sole),
    y: ankle.y - ClimberPose.ANKLE * Math.cos(sole),
  };
}

function joints(pose: Pose): Joint[] {
  return [
    pose.pelvis,
    pose.shoulder,
    pose.head,
    ...pose.legs.flatMap((leg) => [leg.root, leg.middle, leg.end]),
    ...pose.arms.flatMap((arm) => [arm.root, arm.middle, arm.end]),
  ];
}

/** Each frame with the one before it. */
function pairs(frames: readonly Frame[]): [Frame, Frame][] {
  const paired: [Frame, Frame][] = [];
  frames.forEach((frame, index) => {
    const before = frames[index - 1];
    if (before !== undefined) {
      paired.push([before, frame]);
    }
  });
  return paired;
}

/** A part's state, or how it goes with where the climber is and how far they've come in it. */
type Over = Partial<PoseState> | ((x: number, into: number) => Partial<PoseState>);

const of = (over: Over, x: number, into: number): Partial<PoseState> =>
  typeof over === "function" ? over(x, into) : over;

/** A climber through `parts`, each a state for some frames, a frame a sixtieth of a second: their
 * point goes `step` metres a frame along ground `height` high while they're moving. They stand
 * a few seconds first, as in the first part. */
function through(
  parts: readonly { readonly frames: number; readonly over: Over }[],
  height: (x: number) => number = flat,
  step = 0.01,
): Frame[] {
  const climber = new ClimberPose();
  const at = (x: number, over: Partial<PoseState>): PoseState =>
    state({ ground: (ahead) => height(x + ahead) - height(x), ...over, travelled: x });
  const first = parts[0];
  climber.advance(5, at(0, first === undefined ? {} : { ...of(first.over, 0, 0), moving: false }));
  const frames: Frame[] = [];
  let x = 0;
  for (const { frames: count, over } of parts) {
    const from = x;
    for (let frame = 0; frame < count; frame += 1) {
      x += of(over, x, x - from).moving === true ? step : 0;
      const here = at(x, of(over, x, x - from));
      frames.push({ x, y: height(x), pose: climber.advance(FRAME, here) });
    }
  }
  return frames;
}

/** A climber walking `frames` frames from a stand. */
function walk(frames: number, over: Over = {}, height: (x: number) => number = flat): Frame[] {
  const moving = (x: number, into: number): Partial<PoseState> => ({
    ...of(over, x, into),
    moving: true,
  });
  return through([{ frames, over: moving }], height);
}

/** A climber going up a ladder on a wall, 6 mm a frame. */
function climbAWall(frames: number): Frame[] {
  const climber = new ClimberPose();
  climber.advance(5, state({ ladder: upAWall(0) }));
  const climbed: Frame[] = [];
  for (let frame = 1; frame <= frames; frame += 1) {
    const y = frame * 0.006;
    const pose = climber.advance(FRAME, state({ ladder: upAWall(y), travelled: y, moving: true }));
    climbed.push({ x: 0, y, pose });
  }
  return climbed;
}

/** The longest run of frames in which a point of the picture stood still in the world. */
function longestStill(frames: readonly Frame[], point: (frame: Frame) => Joint, within: number) {
  let longest = 0;
  let run = 0;
  for (const [before, after] of pairs(frames)) {
    run = Math.abs(point(after).x - point(before).x) < within ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

/** How far the nearest rung is from `along`, the rungs every `spacing` from `first`. */
const offTheRungs = (along: number, first = 0.15, spacing = 0.3): number => {
  const past = (((along - first) % spacing) + spacing) % spacing;
  return Math.min(past, spacing - past);
};

describe("ClimberPose", () => {
  it("keeps its bones' lengths in every pose, and through every blend", () => {
    const frames = through([
      { frames: 30, over: {} },
      { frames: 60, over: { moving: true } },
      { frames: 60, over: { moving: true, pace: "rest-step", tiredness: "tired" } },
      { frames: 40, over: (x) => ({ moving: true, ladder: across(x) }) },
      { frames: 40, over: { moving: true, jumar: { x: 0.5, y: 0.6 }, sliding: true } },
      { frames: 30, over: { carabiner: { x: 0.6, y: 0.4 }, tiredness: "exhausted" } },
      { frames: 60, over: { falling: true } },
      { frames: 90, over: {} },
      { frames: 60, over: { falling: true, ground: () => -5 } },
      { frames: 60, over: { falling: true, ground: () => -5, jumar: { x: 0.2, y: 0.7 } } },
      { frames: 60, over: (_x, into) => ({ ladder: upAWall(into), moving: true }) },
      { frames: 60, over: { dead: true } },
    ]);

    for (const { pose } of frames) {
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

  it("stands on both boots flat on the ground, the head over the pelvis, the knees forward and the elbows back", () => {
    const pose = new ClimberPose().advance(5, state());

    for (const leg of LEGS) {
      expect(pose.legs[leg].end.y).toBeCloseTo(ClimberPose.ANKLE, 9);
      expect(pose.soles[leg]).toBeCloseTo(0, 9);
      expect(pose.legs[leg].middle.x).toBeGreaterThan(pose.legs[leg].root.x - 1e-9);
      expect(pose.arms[leg].middle.x).toBeLessThan(pose.arms[leg].root.x + 0.05);
    }
    expect(pose.head.y).toBeGreaterThan(pose.shoulder.y);
    expect(pose.shoulder.y).toBeGreaterThan(pose.pelvis.y);
    expect(pose.pelvis.y).toBeCloseTo(ClimberPose.STANDING, 6);
    expect(pose.lean).toBeLessThan(0.1);
    expect(pose.tilt).toBe(0);
    expect(Math.hypot(pose.offset.x, pose.offset.y)).toBeLessThan(1e-9);
  });

  it("keeps each boot where it came down until it lifts, rolling over its ball", () => {
    const frames = walk(300);

    for (const leg of LEGS) {
      let planted = 0;
      for (const [before, after] of pairs(frames)) {
        const from = inWorld(before, ball(before.pose, leg));
        const to = inWorld(after, ball(after.pose, leg));
        if (Math.abs(from.y) < 1e-9 && Math.abs(to.y) < 1e-9) {
          planted += 1;
          expect(length(from, to)).toBeLessThan(1e-9);
        }
      }
      expect(planted).toBeGreaterThan(frames.length * 0.4);
    }
    const rolling = frames.filter(({ pose }) =>
      LEGS.some((leg) => Math.abs(ball(pose, leg).y) < 1e-9 && pose.soles[leg] < -0.2),
    );
    expect(rolling.length).toBeGreaterThan(10);
  });

  it("walks as the physics moves it, not as time passes", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    for (let travelled = 0; travelled <= 2; travelled += 0.02) {
      climber.advance(FRAME, state({ moving: true, travelled }));
    }
    const there = state({ moving: true, travelled: 2 });
    const later = joints(climber.advance(5, there));
    const again = joints(climber.advance(5, there));

    again.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(later[index]?.x ?? Number.NaN, 6);
      expect(joint.y).toBeCloseTo(later[index]?.y ?? Number.NaN, 6);
    });
  });

  it("sets its boots along the slope it walks, the body leaning into it", () => {
    const grade = 0.4;
    const frames = walk(300, {}, (x) => grade * x);
    let flatOnIt = 0;

    for (const frame of frames) {
      for (const leg of LEGS) {
        if (Math.abs(frame.pose.soles[leg] - Math.atan(grade)) < 1e-9) {
          const under = inWorld(frame, underAnkle(frame.pose, leg));
          expect(under.y).toBeCloseTo(grade * under.x, 9);
          flatOnIt += 1;
        }
      }
    }
    expect(flatOnIt).toBeGreaterThan(frames.length * 0.3);
    const uphill = frames.at(-1)?.pose.lean ?? 0;
    const level = walk(300).at(-1)?.pose.lean ?? 0;
    expect(uphill).toBeGreaterThan(level + 0.1);
  });

  it("stands still on the locked lower leg in the rest step's pause, then steps through", () => {
    const slope = (x: number): number => 0.3 * x;
    const resting = walk(400, { pace: "rest-step" }, slope);
    const drawn = (frame: Frame): Joint => ({ x: frame.x + frame.pose.offset.x, y: 0 });

    expect(longestStill(resting, drawn, 1e-6)).toBeGreaterThanOrEqual(5);
    expect(longestStill(walk(400, {}, slope), drawn, 1e-6)).toBe(0);
    let pauses = 0;
    let still = 0;
    for (const [before, after] of pairs(resting)) {
      const stays = Math.abs(drawn(after).x - drawn(before).x) < 1e-6;
      if (!stays && still >= 5) {
        const { legs } = before.pose;
        const back = legs[0].end.x < legs[1].end.x ? legs[0] : legs[1];
        const straight = ClimberPose.THIGH + ClimberPose.SHIN;
        expect(length(back.root, back.end)).toBeGreaterThan(0.96 * straight);
        pauses += 1;
      }
      still = stays ? still + 1 : 0;
    }
    expect(pauses).toBeGreaterThan(3);
    for (const { pose } of resting) {
      expect(-pose.offset.x).toBeLessThanOrEqual(ClimberPose.STRIDE["rest-step"] / 2 + 1e-9);
    }
  });

  it("takes shorter and lower steps tired, the arms stiller and the head down", () => {
    const fresh = walk(300).slice(60);
    const exhausted = walk(300, { tiredness: "exhausted" }).slice(60);
    const lift = (frames: Frame[]): number =>
      Math.max(...frames.flatMap(({ pose }) => pose.legs.map((leg) => leg.end.y)));
    const spread = (frames: Frame[]): number =>
      Math.max(...frames.map(({ pose }) => Math.abs(pose.legs[0].end.x - pose.legs[1].end.x)));
    const swing = (frames: Frame[]): number => {
      const ahead = frames.map(({ pose }) => pose.arms[0].end.x - pose.shoulder.x);
      return Math.max(...ahead) - Math.min(...ahead);
    };

    expect(lift(exhausted)).toBeLessThan(lift(fresh) - 0.03);
    expect(spread(exhausted)).toBeLessThan(spread(fresh) - 0.05);
    expect(swing(exhausted)).toBeLessThan(swing(fresh) * 0.6);
    expect(exhausted.at(-1)?.pose.nod).toBeGreaterThan((fresh.at(-1)?.pose.nod ?? 0) + 0.3);
    expect(exhausted.at(-1)?.pose.lean).toBeLessThan(0.7);
  });

  it("bends double at a halt exhausted, the hands on the knees", () => {
    const pose = new ClimberPose().advance(5, state({ tiredness: "exhausted" }));

    expect(pose.lean).toBeGreaterThan(0.8);
    for (const side of LEGS) {
      expect(length(pose.arms[side].end, pose.legs[side].middle)).toBeLessThan(0.1);
    }
  });

  it("crosses a ladder on its rungs, the hands on its lines, the steps higher", () => {
    const frames = walk(300, (x) => ({ ladder: across(x) }));
    let onRungs = 0;

    for (const frame of frames) {
      for (const leg of LEGS) {
        const under = inWorld(frame, underAnkle(frame.pose, leg));
        if (Math.abs(under.y) < 1e-9) {
          onRungs += 1;
          expect(offTheRungs(under.x)).toBeLessThan(1e-9);
        }
      }
    }
    expect(onRungs).toBeGreaterThan(frames.length * 0.4);
    for (const { pose } of frames.slice(30)) {
      for (const arm of pose.arms) {
        expect(arm.end.y).toBeCloseTo(ClimberPose.LINES, 6);
      }
    }
    const lift = (walked: Frame[]): number =>
      Math.max(...walked.flatMap(({ pose }) => pose.legs.map((leg) => leg.end.y)));
    expect(lift(frames)).toBeGreaterThan(lift(walk(300)) + 0.03);
    expect(frames.some(({ pose }) => pose.landed.some(Boolean))).toBe(false);
  });

  it("comes onto a ladder's rungs where its boots would come down, whatever the rungs", () => {
    const ladders = [
      { first: 0, spacing: 0.3 },
      { first: 0.02, spacing: 0.1 },
    ];
    for (const { first, spacing } of ladders) {
      const ladder = (x: number): LadderFooting => ({ ...across(x), rung: first - x, spacing });
      const frames = walk(300, (x) => ({ ladder: ladder(x) })).slice(90);
      let down = 0;
      for (const frame of frames) {
        for (const leg of LEGS) {
          const under = inWorld(frame, underAnkle(frame.pose, leg));
          if (Math.abs(under.y) < 1e-9) {
            down += 1;
            expect(offTheRungs(under.x, first, spacing)).toBeLessThan(1e-9);
            const halfStance = (ClimberPose.STANCE * 2 * ClimberPose.RUNG_STEP) / 2;
            expect(Math.abs(under.x - frame.x)).toBeLessThan(halfStance + 1e-6);
          }
        }
      }
      expect(down).toBeGreaterThan(frames.length * 0.4);
    }
  });

  it("climbs a ladder up a wall rung over rung, hands over the feet, the body off the wall", () => {
    const frames = climbAWall(300).slice(60);

    for (const frame of frames) {
      const { pose } = frame;
      const feet = pose.legs.map((leg) => inWorld(frame, leg.end).y - ClimberPose.ANKLE);
      const hands = pose.arms.map((arm) => inWorld(frame, arm.end).y);
      expect(Math.min(...feet.map((y) => offTheRungs(y)))).toBeLessThan(1e-9);
      expect(Math.min(...hands.map((y) => offTheRungs(y)))).toBeLessThan(1e-9);
      for (const arm of pose.arms) {
        expect(arm.end.y).toBeGreaterThan(pose.pelvis.y + 0.3);
      }
      expect(pose.pelvis.x).toBeLessThan(-0.2);
    }
  });

  it("holds the jumar in the near hand: on the rope within reach, the rope lifted to it beyond", () => {
    const within = { x: 0.45, y: 1 };
    const held = new ClimberPose().advance(5, state({ jumar: within }));
    const lifted = new ClimberPose().advance(5, state({ jumar: { x: 0.6, y: 0 } }));

    expect(length(held.arms[0].end, within)).toBeLessThan(1e-6);
    expect(length(held.jumar ?? { x: 0, y: 0 }, within)).toBeLessThan(1e-6);
    expect(length(lifted.jumar ?? { x: 0, y: 0 }, lifted.arms[0].end)).toBeLessThan(1e-6);
    expect(lifted.arms[0].end.y).toBeGreaterThan(0.6);
    expect(held.lean).toBeGreaterThan(new ClimberPose().advance(5, state()).lean + 0.1);
  });

  it("lets the jumar go near an anchor, where the rope can't come up to the hand", () => {
    const onTheSnow = { x: 0.6, y: 0 };
    const climber = new ClimberPose();
    climber.advance(5, state({ jumar: onTheSnow, slack: 3 }));
    const lifted = climber.advance(FRAME, state({ jumar: onTheSnow, slack: 3 }));
    climber.advance(5, state({ jumar: onTheSnow, slack: 0.2 }));
    const left = climber.advance(FRAME, state({ jumar: onTheSnow, slack: 0.2 }));
    const standing = new ClimberPose().advance(5, state());

    expect(lifted.jumar?.y).toBeGreaterThan(0.6);
    expect(length(left.jumar ?? { x: 0, y: 0 }, onTheSnow)).toBeLessThan(1e-6);
    expect(length(left.arms[0].end, standing.arms[0].end)).toBeLessThan(1e-6);
    expect(left.lean).toBeCloseTo(standing.lean, 6);
  });

  it("pushes the jumar up the rope in strokes while its key is held, gripping between", () => {
    const jumar = (frame: Frame): Joint => inWorld(frame, frame.pose.jumar ?? frame.pose.pelvis);
    const stroked = walk(300, { jumar: { x: 0.45, y: 1 }, sliding: true }).slice(60);
    const slid = walk(300, { jumar: { x: 0.45, y: 1 } }).slice(60);

    expect(longestStill(stroked, jumar, 1e-3)).toBeGreaterThanOrEqual(4);
    expect(longestStill(slid, jumar, 1e-3)).toBe(0);
  });

  it("bends to the second carabiner as it's clipped, the far hand on it, and stands again", () => {
    const climber = new ClimberPose();
    const before = climber.advance(5, state());
    const carabiner = { x: 0.5, y: 0.8 };
    let pose = before;
    for (let frame = 0; frame < 18; frame += 1) {
      pose = climber.advance(FRAME, state({ carabiner }));
    }

    const reached = length(pose.arms[1].end, carabiner);
    expect(reached).toBeLessThan(length(before.arms[1].end, carabiner) - 0.15);
    expect(pose.carabiner).toEqual(carabiner);
    expect(pose.lean).toBeGreaterThan(before.lean + 0.2);
    expect(pose.pelvis.y).toBeLessThan(before.pelvis.y - 0.1);
    for (let frame = 18; frame < 90; frame += 1) {
      pose = climber.advance(FRAME, state({ carabiner }));
    }
    expect(length(pose.arms[1].end, before.arms[1].end)).toBeLessThan(0.02);
    expect(pose.pelvis.y).toBeCloseTo(before.pelvis.y, 6);
    expect(pose.lean).toBeCloseTo(before.lean, 6);
  });

  it("goes over face down in a fall and lies along the ground, the head the way it faced", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const falling = state({ falling: true });
    let pose = climber.advance(FRAME, falling);
    for (let frame = 1; frame < 6; frame += 1) {
      pose = climber.advance(FRAME, falling);
    }

    expect(pose.tilt).toBeGreaterThan(0);
    expect(pose.tilt).toBeLessThan(ClimberPose.FALLEN_RADIANS);
    for (let frame = 6; frame < 60; frame += 1) {
      pose = climber.advance(FRAME, falling);
    }
    expect(pose.tilt).toBeCloseTo(ClimberPose.FALLEN_RADIANS, 9);
    const lying: Frame = { x: 0, y: 0, pose };
    for (const joint of joints(pose)) {
      expect(inWorld(lying, joint).y).toBeGreaterThan(-0.08);
    }
    expect(inWorld(lying, pose.pelvis).y).toBeGreaterThan(0.05);
    expect(inWorld(lying, pose.pelvis).y).toBeLessThan(0.3);
    expect(inWorld(lying, pose.head).x).toBeGreaterThan(1.2);
  });

  it("lies along a slope it slides down", () => {
    const climber = new ClimberPose();
    const slope = state({ falling: true, ground: (ahead) => 0.5 * ahead });
    climber.advance(5, state({ ground: slope.ground }));
    let pose = climber.advance(FRAME, slope);
    for (let frame = 1; frame < 60; frame += 1) {
      pose = climber.advance(FRAME, slope);
    }

    expect(pose.tilt).toBeCloseTo(ClimberPose.FALLEN_RADIANS - Math.atan(0.5), 9);
  });

  it("tumbles in the air, round its middle", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const inTheAir = state({ falling: true, ground: () => -5 });
    let pose = climber.advance(FRAME, inTheAir);
    for (let frame = 1; frame < 60; frame += 1) {
      pose = climber.advance(FRAME, inTheAir);
    }
    const before = pose.tilt;
    pose = climber.advance(FRAME, inTheAir);
    const turn = Math.PI * 2;
    const turned = ((((pose.tilt - before) % turn) + turn * 1.5) % turn) - turn / 2;

    expect(turned).toBeCloseTo(5 / 60, 3);
    expect(Math.hypot(pose.pelvis.x, pose.pelvis.y)).toBeLessThan(0.03);
  });

  it("hangs below the rope from its cowstail, a hand up on it, the legs down", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const carabiner = { x: 0.3, y: 0.7 };
    const hanging = state({ falling: true, ground: () => -5, carabiner });
    let pose = climber.advance(FRAME, hanging);
    for (let frame = 1; frame < 90; frame += 1) {
      pose = climber.advance(FRAME, hanging);
    }
    const above = { x: 0, y: Math.hypot(carabiner.x, carabiner.y) };

    expect(pose.tilt).toBeCloseTo(Math.atan2(carabiner.x, carabiner.y), 9);
    expect(length(pose.arms[0].end, above)).toBeLessThan(1e-6);
    expect(length(pose.carabiner ?? { x: 0, y: 0 }, above)).toBeLessThan(1e-9);
    for (const leg of pose.legs) {
      expect(leg.end.y).toBeLessThan(-0.6);
    }
  });

  it("gets up after a fall through a kneel", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    for (let frame = 0; frame < 60; frame += 1) {
      climber.advance(FRAME, state({ falling: true }));
    }
    let pose = climber.advance(FRAME, state());
    for (let frame = 1; frame < 33; frame += 1) {
      pose = climber.advance(FRAME, state());
    }

    expect(pose.tilt).toBeCloseTo(0, 2);
    expect(pose.pelvis.y).toBeLessThan(0.6);
    expect(Math.min(pose.legs[0].middle.y, pose.legs[1].middle.y)).toBeLessThan(0.1);
    for (let frame = 33; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, state());
    }
    expect(pose.pelvis.y).toBeCloseTo(ClimberPose.STANDING, 6);
    expect(pose.tilt).toBe(0);
  });

  it("lies still once dead, the same whatever the frames", () => {
    const dead = (): Pose => {
      const climber = new ClimberPose();
      let pose = climber.advance(5, state());
      for (let frame = 0; frame < 120; frame += 1) {
        pose = climber.advance(FRAME, state({ dead: true }));
      }
      return pose;
    };
    const pose = dead();

    expect(pose.tilt).toBeCloseTo(ClimberPose.FALLEN_RADIANS, 9);
    expect(Math.abs(pose.legs[0].end.x - pose.legs[1].end.x)).toBeLessThan(0.2);
    expect(dead()).toEqual(pose);
  });

  it("blends from each thing it does to the next, no joint jumping", () => {
    const frames = through([
      { frames: 20, over: {} },
      { frames: 40, over: { moving: true } },
      { frames: 40, over: (x) => ({ moving: true, ladder: across(x) }) },
      { frames: 40, over: { moving: true } },
      { frames: 40, over: { moving: true, jumar: { x: 0.6, y: 0 } } },
      { frames: 30, over: { moving: true } },
      { frames: 20, over: {} },
      { frames: 60, over: { falling: true } },
      { frames: 90, over: {} },
      { frames: 40, over: (_x, into) => ({ ladder: upAWall(into), moving: true }) },
      { frames: 40, over: { moving: true } },
      { frames: 60, over: { dead: true } },
    ]);

    for (const [before, after] of pairs(frames)) {
      const from = joints(before.pose);
      joints(after.pose).forEach((joint, index) => {
        const was = from[index] ?? joint;
        expect(length(inWorld(before, was), inWorld(after, joint))).toBeLessThan(0.2);
      });
    }
  });

  it("kicks up snow where a boot comes down on it, and nowhere else", () => {
    const frames = walk(300);
    const kicked = frames.filter(({ pose }) => pose.landed.some(Boolean));

    expect(kicked.length).toBeGreaterThan(5);
    for (const frame of kicked) {
      for (const leg of LEGS) {
        if (frame.pose.landed[leg]) {
          expect(Math.abs(inWorld(frame, ball(frame.pose, leg)).y)).toBeLessThan(1e-9);
        }
      }
    }
    const standing = through([{ frames: 60, over: {} }]);
    expect(standing.some(({ pose }) => pose.landed.some(Boolean))).toBe(false);
  });
});
