import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint, LadderFooting, Pose, PoseState } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";

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
  terrain: flat,
  jumar: null,
  carabiner: null,
  sliding: false,
  ladder: null,
  footing: 1,
  hauling: false,
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

/** A point of a boot, `along` its sole from under the ankle and `up` off it: its ball, its toe,
 * the point under the ankle. */
function ofTheBoot(pose: Pose, leg: 0 | 1, along: number, up = 0): Joint {
  const ankle = pose.legs[leg].end;
  const sole = pose.soles[leg];
  const above = up - ClimberPose.ANKLE;
  return {
    x: ankle.x + along * Math.cos(sole) - above * Math.sin(sole),
    y: ankle.y + along * Math.sin(sole) + above * Math.cos(sole),
  };
}

/** How far a boot's ankle is bent: from the boot's upright to the shin, in radians, the shin
 * forward over the toe above 0. */
function flexOf(pose: Pose, leg: 0 | 1): number {
  const { middle: knee, end: ankle } = pose.legs[leg];
  const bent = pose.soles[leg] + Math.PI / 2 - Math.atan2(knee.y - ankle.y, knee.x - ankle.x);
  return bent - 2 * Math.PI * Math.round(bent / (2 * Math.PI));
}

/** How far over the ground `height` high a point of the picture is, in a frame of a climb. */
function overTheGround(frame: Frame, point: Joint, height: (x: number) => number): number {
  const at = inWorld(frame, point);
  return at.y - height(at.x);
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

/** A climber walking `frames` frames from a stand, `step` metres a frame. */
function walk(
  frames: number,
  over: Over = {},
  height: (x: number) => number = flat,
  step = 0.01,
): Frame[] {
  const moving = (x: number, into: number): Partial<PoseState> => ({
    ...of(over, x, into),
    moving: true,
  });
  return through([{ frames, over: moving }], height, step);
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

  it("keeps each boot where it came down until it lifts, rolling over its toe, up a steep slope too", () => {
    for (const grade of [0, 0.5]) {
      const height = (x: number): number => grade * x;
      const frames = walk(300, {}, height);
      const toe = (frame: Frame, leg: 0 | 1): Joint => ofTheBoot(frame.pose, leg, ClimberPose.TOE);
      const down = (frame: Frame, leg: 0 | 1): boolean =>
        Math.abs(overTheGround(frame, toe(frame, leg), height)) < 1e-9;

      for (const leg of LEGS) {
        let planted = 0;
        for (const [before, after] of pairs(frames)) {
          if (down(before, leg) && down(after, leg)) {
            planted += 1;
            const from = inWorld(before, toe(before, leg));
            expect(length(from, inWorld(after, toe(after, leg)))).toBeLessThan(1e-9);
          }
        }
        expect(planted).toBeGreaterThan(frames.length * 0.4);
      }
      const rolling = frames.filter((frame) =>
        LEGS.some((leg) => down(frame, leg) && frame.pose.soles[leg] < Math.atan(grade) - 0.2),
      );
      expect(rolling.length).toBeGreaterThan(10);
    }
  });

  it("bends each ankle no further than its stiff boot lets it, whatever the climber does", () => {
    const { forward, back } = ClimberPose.BOOT_FLEX;
    const climbs = [
      walk(300),
      walk(300, { pace: "faster" }),
      walk(300, { pace: "rest-step", tiredness: "tired" }),
      walk(300, { tiredness: "exhausted" }),
      walk(300, {}, (x) => 0.4 * x),
      walk(300, {}, (x) => 0.55 * x),
      walk(300, {}, (x) => -0.4 * x),
      walk(300, {}, (x) => 0.2 * Math.sin(2 * x)),
      walk(300, (x) => ({ ladder: across(x) })),
      climbAWall(300),
      through([
        { frames: 30, over: { tiredness: "exhausted" } },
        { frames: 60, over: { falling: true } },
        { frames: 90, over: {} },
        { frames: 60, over: { falling: true, ground: () => -5 } },
        { frames: 60, over: { falling: true, ground: () => -5, carabiner: { x: 0.3, y: 0.7 } } },
        { frames: 60, over: { dead: true } },
      ]),
    ];

    for (const frames of climbs) {
      for (const { pose } of frames) {
        for (const leg of LEGS) {
          expect(flexOf(pose, leg)).toBeLessThan(forward + 1e-6);
          expect(flexOf(pose, leg)).toBeGreaterThan(-back - 1e-6);
        }
      }
    }
  });

  it("never sinks a boot into the snow, however it rolls, on hummocks too", () => {
    const { boot } = new FigureShapes();
    const grounds = [
      flat,
      (x: number): number => 0.4 * x,
      (x: number): number => -0.4 * x,
      (x: number): number => 0.2 * Math.sin(2 * x),
    ];

    for (const height of grounds) {
      for (const frame of walk(300, {}, height)) {
        for (const leg of LEGS) {
          for (const { x, y } of boot) {
            const point = ofTheBoot(frame.pose, leg, x, y);
            expect(overTheGround(frame, point, height)).toBeGreaterThan(-0.02);
          }
        }
      }
    }
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

  it("sets its boots along a gentle slope it walks, the body leaning into it", () => {
    const grade = 0.2;
    const frames = walk(300, {}, (x) => grade * x);
    let flatOnIt = 0;

    for (const frame of frames) {
      for (const leg of LEGS) {
        if (Math.abs(frame.pose.soles[leg] - Math.atan(grade)) < 1e-9) {
          const under = inWorld(frame, ofTheBoot(frame.pose, leg, 0));
          expect(under.y).toBeCloseTo(grade * under.x, 9);
          flatOnIt += 1;
        }
      }
    }
    expect(flatOnIt).toBeGreaterThan(frames.length * 0.3);
    const uphill = frames.at(-1)?.pose.lean ?? 0;
    const level = walk(300).at(-1)?.pose.lean ?? 0;
    expect(uphill).toBeGreaterThan(level + 0.05);
  });

  it("stands still on the locked lower leg in the rest step's pause, then steps through", () => {
    const slope = (x: number): number => 0.3 * x;
    const resting = walk(400, { pace: "rest-step" }, slope);
    const drawn = (frame: Frame): Joint => ({ x: frame.x + frame.pose.offset.x, y: 0 });

    expect(longestStill(resting, drawn, 1e-6)).toBeGreaterThanOrEqual(5);
    expect(longestStill(walk(400, {}, slope), drawn, 1e-6)).toBe(0);
    let pauses = 0;
    let still = 0;
    // The first still frames are the stand the walk sets off from, not yet the rest step's pause.
    for (const [before, after] of pairs(resting.slice(10))) {
      const stays = Math.abs(drawn(after).x - drawn(before).x) < 1e-6;
      if (!stays && still >= 5) {
        const { legs } = before.pose;
        const back = legs[0].end.x < legs[1].end.x ? legs[0] : legs[1];
        // Locked, not hyperextended: a little short of the whole leg's reach (#222).
        const straight = ClimberPose.THIGH + ClimberPose.SHIN;
        expect(length(back.root, back.end)).toBeGreaterThan(0.9 * straight);
        pauses += 1;
      }
      still = stays ? still + 1 : 0;
    }
    expect(pauses).toBeGreaterThan(3);
    for (const { pose } of resting) {
      expect(-pose.offset.x).toBeLessThanOrEqual(
        ClimberPose.LONGEST_STRIDE["rest-step"] / 2 + 1e-9,
      );
    }
  });

  it("walks at the game's pace in strides that grow with the speed, so the steps can be counted (#222)", () => {
    // The game walks a fresh climber about 2.1 m/s on the flat at a steady pace: 0.035 m a frame.
    const steady = walk(420, {}, flat, 0.035).slice(120);
    const landings = steady.filter(({ pose }) => pose.landed.some(Boolean)).length;
    expect(landings / (steady.length * FRAME)).toBeLessThan(4);
    // Slowly, the stride is as it was.
    const slow = walk(420, {}, flat, 0.005).slice(120);
    const slowLandings = slow.filter(({ pose }) => pose.landed.some(Boolean)).length;
    const slowSteps = slowLandings / (slow.length * FRAME);
    expect(slowSteps).toBeGreaterThan((0.8 * (2 * 0.005)) / (FRAME * ClimberPose.STRIDE.steady));
  });

  it("steps carefully on the flat at the game's pace, the weight going on with no stop-and-go and no bob (#222)", () => {
    // The game walks a careful climber about 1.6 m/s on the flat: 0.026 m a frame.
    const careful = walk(420, { pace: "rest-step" }, flat, 0.026).slice(120);
    const landings = careful.filter(({ pose }) => pose.landed.some(Boolean)).length;
    expect(landings / (careful.length * FRAME)).toBeLessThan(3.4);
    const drawn = (frame: Frame): Joint => ({ x: frame.x + frame.pose.offset.x, y: 0 });
    expect(longestStill(careful, drawn, 1e-4)).toBeLessThanOrEqual(1);
    const heights = careful.map(({ pose }) => pose.pelvis.y + pose.offset.y);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.035);
    // Careful, the boots go lower than at a steady pace, and the arms swing less.
    const steady = walk(420, {}, flat, 0.026).slice(120);
    const highest = (frames: Frame[]): number =>
      Math.max(...frames.flatMap(({ pose }) => pose.legs.map((leg) => leg.end.y)));
    expect(highest(careful)).toBeLessThan(highest(steady) - 0.02);
    const swing = (frames: Frame[]): number => {
      const hands = frames.map(({ pose }) => pose.arms[0].end.x - pose.shoulder.x);
      return Math.max(...hands) - Math.min(...hands);
    };
    expect(swing(careful)).toBeLessThan(0.7 * swing(steady));
  });

  it("walks with no jolt at the game's pace: the hips and the boots move a little each frame, careful, steady or faster, on the flat and up a slope (#222)", () => {
    const walks = [
      walk(420, { pace: "rest-step" }, flat, 0.026),
      walk(420, { pace: "rest-step" }, (x) => 0.42 * x, 0.0078),
      walk(420, { pace: "rest-step" }, (x) => 0.55 * x, 0.004),
      walk(420, { pace: "rest-step" }, (x) => 0.3 * x),
      walk(420, {}, flat, 0.035),
      walk(420, { pace: "faster" }, flat, 0.0525),
    ];
    for (const frames of walks) {
      for (const [before, after] of pairs(frames.slice(120))) {
        const hips = (frame: Frame): number => frame.pose.pelvis.y + frame.pose.offset.y;
        expect(Math.abs(hips(after) - hips(before))).toBeLessThan(0.015);
        for (const leg of LEGS) {
          expect(Math.abs(after.pose.soles[leg] - before.pose.soles[leg])).toBeLessThan(0.3);
        }
      }
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
        const under = inWorld(frame, ofTheBoot(frame.pose, leg, 0));
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
          const under = inWorld(frame, ofTheBoot(frame.pose, leg, 0));
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

  it("at the top of a wall's ladder, keeps its boots on the rungs it has, never on one over its top, and its hands on the rails that stand over it (#243)", () => {
    const climber = new ClimberPose();
    climber.advance(5, state({ ladder: upAWall(4), travelled: 4, moving: true }));
    let pose = climber.advance(FRAME, state({ ladder: upAWall(4), travelled: 4, moving: true }));
    // The ladder is 6 m, its top rung 5.85 m up it: up its last 2 m, to its top.
    for (let y = 4; y <= 6; y += 0.46 * FRAME) {
      pose = climber.advance(FRAME, state({ ladder: upAWall(y), travelled: y, moving: true }));
      const frame = { x: 0, y, pose };
      for (const leg of pose.legs) {
        expect(inWorld(frame, leg.end).y - ClimberPose.ANKLE).toBeLessThan(5.85 + 1e-6);
      }
      for (const arm of pose.arms) {
        expect(inWorld(frame, arm.end).y).toBeLessThan(6 + ClimberPose.LADDER_OVER);
      }
    }
    // At its top, a hand holds a rail over the lip, to step off by.
    const hands = pose.arms.map((arm) => inWorld({ x: 0, y: 6, pose }, arm.end).y);
    expect(Math.max(...hands)).toBeGreaterThan(6.25);
  });

  it("front-points up a face of ice: the toes at the ice, short steps, standing taller and further off it than on a ladder, the axe in the near hand", () => {
    const face: LadderFooting = { way: { x: 0, y: 1 }, rung: 0.08, spacing: 0.16, ends: [-6, 6] };
    const onIce = state({
      ladder: face,
      onIce: true,
      picks: [{ swing: 1, at: { x: 0, y: 1.9 }, into: { x: 1, y: 0 } }],
    });
    const climber = new ClimberPose();
    let pose = climber.advance(FRAME, onIce);
    for (let frame = 0; frame < 180; frame += 1) {
      pose = climber.advance(FRAME, onIce);
    }
    const onALadder = new ClimberPose().advance(5, state({ ladder: upAWall(0) }));

    for (const leg of [0, 1] as const) {
      const ankle = pose.legs[leg].end;
      const sole = pose.soles[leg];
      const toe = ankle.x + 0.2 * Math.cos(sole) + ClimberPose.ANKLE * Math.sin(sole);
      expect(toe).toBeGreaterThan(-0.02);
      expect(toe).toBeLessThan(0.06);
    }
    const [near, far] = pose.legs.map((leg) => leg.end.y);
    expect(Math.abs((near ?? 0) - (far ?? 0))).toBeLessThan(0.2);
    expect(pose.pelvis.x).toBeLessThan(-0.3);
    expect(pose.pelvis.y).toBeGreaterThan(onALadder.pelvis.y + 0.08);
    const [axe] = pose.tools;
    expect(axe?.hand).toBe(0);
    expect(
      Math.hypot(pose.arms[0].end.x - (axe?.grip.x ?? 9), pose.arms[0].end.y - (axe?.grip.y ?? 9)),
    ).toBeLessThan(1e-6);
  });

  it("wobbles as the footing goes, its arms out for balance and its body swaying, and stands steady with it (#190)", () => {
    const leans = (footing: number): number[] => {
      const climber = new ClimberPose();
      return Array.from({ length: 60 }, () => climber.advance(FRAME, state({ footing })).lean);
    };
    const swing = (footing: number): number => {
      const all = leans(footing).slice(20);
      return Math.max(...all) - Math.min(...all);
    };
    const reach = (footing: number): number => {
      const climber = new ClimberPose();
      const pose = climber.advance(5, state({ footing }));
      return Math.abs(pose.arms[0].end.x - pose.arms[1].end.x);
    };

    expect(swing(1)).toBeLessThan(0.01);
    expect(swing(0.2)).toBeGreaterThan(0.15);
    expect(swing(0.5)).toBeLessThan(swing(0.2));
    expect(reach(0.1)).toBeGreaterThan(reach(1) + 0.3);
  });

  it("looks up the wall while it's above the head, and down onto its top once the head comes over it", () => {
    const climbAt = (y: number): Pose => {
      const climber = new ClimberPose();
      climber.advance(5, state({ ladder: upAWall(y), travelled: y, moving: true }));
      return climber.advance(FRAME, state({ ladder: upAWall(y), travelled: y, moving: true }));
    };
    // The wall is 6 m: low on it, its top is far over the head; near its top, the head is over it.
    const low = climbAt(1);
    const cresting = climbAt(5.4);
    const head = (pose: Pose): number => pose.head.y;

    expect(low.nod).toBeLessThan(-0.2);
    expect(5.4 + head(cresting)).toBeGreaterThan(6.4);
    expect(cresting.nod).toBeGreaterThan(0.15);
    expect(cresting.lean).toBeGreaterThan(low.lean + 0.1);
    // Going down, the climber looks down the wall, as before.
    const down: LadderFooting = { ...upAWall(3), way: { x: 0, y: -1 } };
    const descending = new ClimberPose();
    descending.advance(5, state({ ladder: down, travelled: 0, moving: true }));
    expect(descending.advance(FRAME, state({ ladder: down, moving: true })).nod).toBeGreaterThan(
      0.3,
    );
  });

  it("looks up a wall till its top nears the eyes, across it as they come level, and down onto it once over, on rungs and on the ice (#222)", () => {
    const climbAt = (y: number, onIce: boolean): Pose => {
      const climber = new ClimberPose();
      const at = (): PoseState => state({ ladder: upAWall(y), travelled: y, moving: true, onIce });
      climber.advance(5, at());
      return climber.advance(FRAME, at());
    };
    for (const onIce of [false, true]) {
      // The wall is 6 m: how far over its top the head is, from well under it to well over it.
      const seen = Array.from({ length: 70 }, (_, index) => {
        const y = 3 + index * 0.05;
        const pose = climbAt(y, onIce);
        return { above: y + pose.head.y - 6, nod: pose.nod, gaze: pose.gaze ?? Number.NaN };
      });
      for (const { above, nod, gaze } of seen) {
        if (above < -0.8) {
          expect(nod).toBeLessThan(-0.25);
          expect(gaze).toBeGreaterThan(1.4);
        }
        if (Math.abs(above) < 0.06) {
          expect(Math.abs(nod)).toBeLessThan(0.08);
          expect(Math.abs(gaze)).toBeLessThan(0.15);
        }
        if (above > 0.5) {
          expect(nod).toBeGreaterThan(0.3);
          expect(gaze).toBeLessThan(-0.25);
        }
      }
      expect(seen.some(({ above }) => Math.abs(above) < 0.06)).toBe(true);
    }
    // On the ground the lamp goes by the boots' slope, as before: the pose sets no gaze.
    expect(new ClimberPose().advance(5, state()).gaze).toBeNull();
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
    // A long slack rope, and a taut one tied off 20 cm behind the jumar (#256).
    const slack = {
      anchors: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
      length: 21,
    };
    const taut = {
      anchors: [
        { x: 0.4, y: 0 },
        { x: 10, y: 0 },
      ],
      length: 9.6,
    };
    const climber = new ClimberPose();
    climber.advance(5, state({ jumar: onTheSnow, rope: slack }));
    const lifted = climber.advance(FRAME, state({ jumar: onTheSnow, rope: slack }));
    climber.advance(5, state({ jumar: onTheSnow, rope: taut }));
    const left = climber.advance(FRAME, state({ jumar: onTheSnow, rope: taut }));
    const standing = new ClimberPose().advance(5, state());

    expect(lifted.jumar?.y).toBeGreaterThan(0.6);
    expect(length(left.jumar ?? { x: 0, y: 0 }, onTheSnow)).toBeLessThan(1e-6);
    expect(length(left.arms[0].end, standing.arms[0].end)).toBeLessThan(1e-6);
    expect(left.lean).toBeCloseTo(standing.lean, 6);
  });

  it("lets the jumar go past the rope's last anchor: the rope comes no further than its slack pulls it (#256)", () => {
    // A step past where the rope is tied off, its slack pulled out to the jumar behind them.
    const behind = { x: -0.7, y: 0 };
    const past = {
      anchors: [
        { x: -9, y: 0 },
        { x: -1, y: 0 },
      ],
      length: 8.6,
    };
    const climber = new ClimberPose();
    // The first frame finds the hand on it; the next ones, how far the rope comes to it.
    climber.advance(FRAME, state({ jumar: behind, rope: past }));
    climber.advance(5, state({ jumar: behind, rope: past }));
    const left = climber.advance(FRAME, state({ jumar: behind, rope: past }));

    expect(length(left.jumar ?? { x: 0, y: 0 }, behind)).toBeLessThan(1e-6);
  });

  it("pushes the jumar up the rope in strokes while its key is held, gripping between", () => {
    const jumar = (frame: Frame): Joint => inWorld(frame, frame.pose.jumar ?? frame.pose.pelvis);
    const stroked = walk(300, { jumar: { x: 0.45, y: 1 }, sliding: true }).slice(60);
    const slid = walk(300, { jumar: { x: 0.45, y: 1 } }).slice(60);

    expect(longestStill(stroked, jumar, 1e-3)).toBeGreaterThanOrEqual(4);
    expect(longestStill(slid, jumar, 1e-3)).toBe(0);
  });

  it("pulls on the jumar between its strokes up steep ground, harder the steeper, and not on the flat or at a halt (#232)", () => {
    const rope = { jumar: { x: 0.45, y: 1 }, sliding: true };
    const pulls = (frames: readonly Frame[]): number[] => frames.map((frame) => frame.pose.pull);
    const steep = pulls(walk(300, rope, (x) => 0.8 * x).slice(60));
    const gentle = pulls(walk(300, rope, (x) => 0.35 * x).slice(60));
    const level = pulls(walk(300, rope).slice(60));
    const down = pulls(walk(300, rope, (x) => -0.8 * x).slice(60));
    const gripped = pulls(walk(300, { jumar: { x: 0.45, y: 1 } }, (x) => 0.8 * x).slice(60));
    const halted = new ClimberPose().advance(5, state({ ...rope, ground: (x) => 0.8 * x }));

    // A pull each stroke, and the rope let go slack between them.
    expect(Math.max(...steep)).toBeGreaterThan(0.6);
    expect(Math.min(...steep)).toBe(0);
    expect(Math.max(...gentle)).toBeGreaterThan(0.05);
    expect(Math.max(...gentle)).toBeLessThan(Math.max(...steep) / 2);
    expect(Math.max(...level)).toBe(0);
    expect(Math.max(...down)).toBe(0);
    expect(Math.max(...gripped)).toBe(0);
    expect(halted.pull).toBe(0);
    for (const pull of steep) {
      expect(pull).toBeGreaterThanOrEqual(0);
      expect(pull).toBeLessThanOrEqual(1);
    }
  });

  it("doesn't pull on the jumar on a ladder, up a wall or across a crevasse: the weight is on the rungs, and the rope only backs them up", () => {
    const rope = { jumar: { x: 0, y: 0 }, sliding: true };
    const up = new ClimberPose();
    const upOn = (y: number): PoseState =>
      state({ ...rope, ladder: upAWall(y), travelled: y, moving: true });
    up.advance(5, upOn(0));
    const upAWallPulls = Array.from(
      { length: 600 },
      (_, frame) => up.advance(FRAME, upOn((frame + 1) * 0.006)).pull,
    );
    // A crevasse crossed at an angle, its far lip higher: as steep as ground the arm pulls on.
    const rising = (x: number): LadderFooting => ({ ...across(x), way: { x: 0.8, y: 0.6 } });
    const acrossPulls = walk(
      300,
      (x) => ({ ...rope, ladder: rising(x) }),
      (x) => 0.75 * x,
    )
      .slice(60)
      .map((frame) => frame.pose.pull);

    expect(Math.max(...upAWallPulls)).toBe(0);
    expect(Math.max(...acrossPulls)).toBe(0);
  });

  it("pulls while the jumar grips the rope, never while the hand slides it on (#232)", () => {
    const jumar = (frame: Frame): Joint => inWorld(frame, frame.pose.jumar ?? frame.pose.pelvis);
    const frames = walk(300, { jumar: { x: 0.45, y: 1 }, sliding: true }, (x) => 0.8 * x).slice(60);
    for (const [before, after] of pairs(frames)) {
      if (after.pose.pull > 0.3) {
        // The climber goes 10 mm a frame: the hand on the rope, less than half of that.
        expect(Math.abs(jumar(after).x - jumar(before).x)).toBeLessThan(4e-3);
      }
    }
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
    const carabiner = { x: 0.2, y: 0.7 };
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

  it("hangs upright on the rope, never tumbling, with the carabiner level with them or below: hauled up toward a lip (#239)", () => {
    for (const carabiner of [
      { x: 0.6, y: 0.02 },
      { x: -0.5, y: -0.2 },
    ]) {
      const climber = new ClimberPose();
      climber.advance(5, state());
      const hauled = state({ falling: true, hanging: true, ground: () => -3, carabiner });
      const tilts: number[] = [];
      for (let frame = 0; frame < 120; frame += 1) {
        tilts.push(climber.advance(FRAME, hauled).tilt);
      }
      const pose = climber.advance(FRAME, hauled);

      // Leaning toward the carabiner, a quarter turn at the very most, and still: no spin.
      expect(Math.abs(pose.tilt)).toBeLessThanOrEqual(0.9);
      expect(Math.sign(pose.tilt)).toBe(Math.sign(carabiner.x));
      expect(Math.abs(pose.tilt - (tilts.at(-1) ?? 0))).toBeLessThan(1e-6);
      for (const leg of pose.legs) {
        expect(leg.end.y).toBeLessThan(-0.5);
      }
    }
  });

  it("caught by a rope from well to the side, leans its way no further than a harness lets them, with no jump as it comes up over them (#243)", () => {
    const climber = new ClimberPose();
    climber.advance(5, state({ ladder: across(3) }));
    // Off a ladder: the carabiner 2 m along the rope, level with them, then over them as they
    // drop 3 m under it in under a second.
    let drop = 0;
    let last: number | null = null;
    for (let frame = 0; frame < 120; frame += 1) {
      drop = Math.min(3, drop + 4 * FRAME);
      const caught = state({
        falling: true,
        hanging: true,
        ground: () => -5,
        carabiner: { x: 2, y: drop - 0.2 },
      });
      const { tilt } = climber.advance(FRAME, caught);

      expect(Math.abs(tilt)).toBeLessThanOrEqual(0.35 + 1e-9);
      if (last !== null) {
        expect(Math.abs(tilt - last)).toBeLessThan(0.02);
      }
      last = tilt;
    }
    expect(last).toBeGreaterThan(0.2);
  });

  it("hanging beside a wall's face, braces their boots on it: out from it, leaning back off it, the soles flat on it (#243)", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const carabiner = { x: 0.2, y: 0.9 };
    // The face 0.1 m ahead of where the rope holds them, 3 m of air under them.
    const braced = state({ falling: true, hanging: true, ground: () => -3, carabiner, face: 0.1 });
    let pose = climber.advance(FRAME, braced);
    for (let frame = 1; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, braced);
    }
    const frame = { x: 0, y: 0, pose };

    for (const leg of LEGS) {
      // Under the ankle, the sole is on the face, below the harness, its toe up it.
      const sole = inWorld(frame, ofTheBoot(pose, leg, 0));
      expect(sole.x).toBeCloseTo(0.1, 2);
      expect(sole.y).toBeLessThan(0.05);
      expect(Math.abs(pose.soles[leg] - pose.tilt - Math.PI / 2)).toBeLessThan(0.25);
      // The knee is bent, up and out from the wall: the legs push the body off it.
      const knee = inWorld(frame, pose.legs[leg].middle);
      expect(knee.x).toBeLessThan(sole.x - 0.2);
    }
    // The harness hangs a leg's length out from the face, the body leaning back off it, and the
    // near hand still up on the cowstail.
    expect(inWorld(frame, pose.pelvis).x).toBeLessThan(0.1 - 0.45);
    expect(pose.tilt).toBeLessThan(-0.2);
    expect(inWorld(frame, pose.shoulder).x).toBeLessThan(inWorld(frame, pose.pelvis).x);
    expect(inWorld(frame, pose.arms[0].end).y).toBeGreaterThan(0.4);
  });

  it("walks their boots up the face as the rope takes them up it: a boot stays where it's set, then steps up (#243)", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const carabiner = { x: 0.2, y: 0.9 };
    let height = 3;
    const hauled = (): PoseState =>
      state({ falling: true, hanging: true, ground: () => -height, carabiner, face: 0.1 });
    for (let frame = 0; frame < 120; frame += 1) {
      climber.advance(FRAME, hauled());
    }
    const steps: [number, number] = [0, 0];
    const last: [number | null, number | null] = [null, null];
    for (let frame = 0; frame < 600; frame += 1) {
      // Hauled up at 0.15 m/s.
      height += 0.15 * FRAME;
      const pose = climber.advance(FRAME, hauled());
      const frameNow = { x: 0, y: height, pose };
      for (const leg of LEGS) {
        const sole = inWorld(frameNow, ofTheBoot(pose, leg, 0));
        const was = last[leg];
        // On the face, or a hand's breadth off it between two places.
        expect(sole.x).toBeGreaterThan(0.1 - 0.12);
        expect(sole.x).toBeLessThan(0.1 + 0.01);
        if (was !== null && sole.y - was > 0.005) {
          steps[leg] += 1;
        } else if (was !== null && sole.x > 0.1 - 0.005) {
          // Set on the wall, it stays there while the body goes up.
          expect(Math.abs(sole.y - was)).toBeLessThan(0.005);
        }
        last[leg] = sole.y;
      }
    }
    // 1.5 m up the face: each boot stepped up several times, in turn.
    expect(steps[0]).toBeGreaterThan(8);
    expect(steps[1]).toBeGreaterThan(8);
  });

  it("dangles in the open air as before, with no wall within reach", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const carabiner = { x: 0.2, y: 0.9 };
    const free = state({ falling: true, hanging: true, ground: () => -3, carabiner, face: null });
    let pose = climber.advance(FRAME, free);
    for (let frame = 1; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, free);
    }

    expect(pose.offset).toEqual({ x: 0, y: 0 });
    expect(pose.tilt).toBeCloseTo(Math.atan2(carabiner.x, carabiner.y), 6);
    for (const leg of pose.legs) {
      expect(leg.end.y).toBeLessThan(-0.6);
    }
  });

  it("still tumbles in the air off the rope, the physics not holding them", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const free = state({ falling: true, hanging: false, ground: () => -5 });
    for (let frame = 0; frame < 60; frame += 1) {
      climber.advance(FRAME, free);
    }
    const before = climber.advance(FRAME, free).tilt;
    const after = climber.advance(FRAME, free).tilt;

    expect(after).not.toBeCloseTo(before, 4);
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
          const ball = ofTheBoot(frame.pose, leg, ClimberPose.BALL);
          expect(Math.abs(inWorld(frame, ball).y)).toBeLessThan(1e-9);
        }
      }
    }
    const standing = through([{ frames: 60, over: {} }]);
    expect(standing.some(({ pose }) => pose.landed.some(Boolean))).toBe(false);
  });

  it("hauls a partner up braced: leaning back, sunk in the knees, both hands ahead pulling in turn (#209)", () => {
    const standing = new ClimberPose();
    const hauling = new ClimberPose();
    let still: Pose = standing.advance(FRAME, state());
    let pulled: Pose = hauling.advance(FRAME, state({ hauling: true }));
    const nearHands: number[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      still = standing.advance(FRAME, state());
      pulled = hauling.advance(FRAME, state({ hauling: true }));
      nearHands.push(pulled.arms[0].end.x);
    }

    expect(pulled.lean).toBeLessThan(still.lean - 0.2);
    expect(pulled.pelvis.y).toBeLessThan(still.pelvis.y - 0.05);
    for (const arm of pulled.arms) {
      expect(arm.end.x).toBeGreaterThan(pulled.pelvis.x + 0.15);
    }
    expect(Math.max(...nearHands) - Math.min(...nearHands)).toBeGreaterThan(0.1);
  });

  it("braces to hold a rope tight with nobody to haul: leaning back less, both hands on it, still", () => {
    const standing = new ClimberPose();
    const hauling = new ClimberPose();
    const holding = new ClimberPose();
    let still: Pose = standing.advance(FRAME, state());
    let pulled: Pose = hauling.advance(FRAME, state({ hauling: true }));
    let held: Pose = holding.advance(FRAME, state({ bracing: true }));
    const nearHands: number[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      still = standing.advance(FRAME, state());
      pulled = hauling.advance(FRAME, state({ hauling: true }));
      held = holding.advance(FRAME, state({ bracing: true }));
      if (frame >= 60) {
        nearHands.push(held.arms[0].end.x);
      }
    }

    expect(held.lean).toBeLessThan(still.lean - 0.1);
    expect(held.lean).toBeGreaterThan(pulled.lean);
    expect(held.pelvis.y).toBeLessThan(still.pelvis.y);
    for (const arm of held.arms) {
      expect(arm.end.x).toBeGreaterThan(held.pelvis.x + 0.15);
    }
    expect(Math.max(...nearHands) - Math.min(...nearHands)).toBeLessThan(0.01);
  });
});

/** The pose after `seconds` of the same state, a frame a sixtieth of a second, from standing. */
function settled(over: Partial<PoseState>, seconds = 3): { pose: Pose; frames: Pose[] } {
  const climber = new ClimberPose();
  climber.advance(5, state());
  const frames: Pose[] = [];
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    frames.push(climber.advance(FRAME, state(over)));
  }
  const pose = frames.at(-1);
  if (pose === undefined) {
    throw new Error("No frame was drawn");
  }
  return { pose, frames };
}

describe("ClimberPose: a casualty and their rescuer (#241)", () => {
  it("sits on the snow with a broken leg: the leg out straight ahead, its toes up, a hand on the thigh, the other propped behind", () => {
    const { pose } = settled({ hurt: "leg" });
    const [broken, sound] = pose.legs;
    const [near, far] = pose.arms;

    expect(pose.pelvis.y).toBeCloseTo(ClimberPose.SEAT, 2);
    // The broken leg, nearly straight: its ankle a leg's length ahead, low, its toes up.
    expect(broken.end.x - broken.root.x).toBeGreaterThan(0.75);
    expect(broken.end.y).toBeLessThan(0.15);
    expect(length(broken.root, broken.end)).toBeGreaterThan(0.78);
    expect(pose.soles[0]).toBeGreaterThan(1);
    // The other knee up, its boot on the snow.
    expect(sound.middle.y).toBeGreaterThan(pose.pelvis.y + 0.25);
    expect(sound.end.y).toBeCloseTo(ClimberPose.ANKLE, 1);
    // Leaning back on the far hand, on the snow behind them; the near one on the thigh.
    expect(pose.lean).toBeLessThan(-0.3);
    expect(far.end.x).toBeLessThan(pose.pelvis.x - 0.25);
    expect(far.end.y).toBeLessThan(0.08);
    expect(near.end.x).toBeGreaterThan(broken.root.x + 0.1);
    expect(near.end.x).toBeLessThan(broken.middle.x);
    expect(pose.tilt).toBe(0);
  });

  it("sits hunched over a broken arm, held across the body, the other hand under it, both knees up", () => {
    const { pose } = settled({ hurt: "arm" });
    const [near, far] = pose.arms;

    expect(pose.pelvis.y).toBeCloseTo(ClimberPose.SEAT, 2);
    expect(pose.lean).toBeGreaterThan(0.2);
    for (const leg of pose.legs) {
      expect(leg.middle.y).toBeGreaterThan(pose.pelvis.y + 0.25);
      expect(leg.end.y).toBeCloseTo(ClimberPose.ANKLE, 1);
    }
    // The forearm across the belly, over the hips; the other hand just under it.
    expect(near.end.y).toBeGreaterThan(pose.pelvis.y + 0.25);
    expect(near.end.y).toBeLessThan(pose.shoulder.y);
    expect(length(near.end, far.end)).toBeLessThan(0.12);
    expect(far.end.y).toBeLessThan(near.end.y);
  });

  it("rocks a little with the pain, and no joint jumps as they go down from their feet", () => {
    const { frames } = settled({ hurt: "leg" }, 8);
    const leans = frames.slice(120).map(({ lean }) => lean);

    expect(Math.max(...leans) - Math.min(...leans)).toBeGreaterThan(0.03);
    expect(Math.max(...leans) - Math.min(...leans)).toBeLessThan(0.08);
    frames.slice(1).forEach((frame, index) => {
      const before = frames[index];
      if (before === undefined) {
        return;
      }
      const moved = joints(frame).map((joint, at) => length(joint, joints(before)[at] ?? joint));
      expect(Math.max(...moved)).toBeLessThan(0.12);
    });
  });

  it("sits cramped in a crevasse's narrow foot: the broken leg as far out as the ice ahead lets it, the knee up, the back to the ice behind", () => {
    // A slot 0.5 m wide: a wall 0.3 m ahead of them and 0.2 m behind.
    const slot = (x: number): number => (x > 0.3 || x < -0.2 ? 4 : 0);
    const { pose } = settled({ hurt: "leg", terrain: slot });
    const open = settled({ hurt: "leg" }).pose;
    const [broken] = pose.legs;

    expect(broken.end.x).toBeLessThan(0.32);
    expect(broken.middle.y).toBeGreaterThan(open.legs[0].middle.y + 0.2);
    expect(pose.lean).toBeGreaterThan(open.lean + 0.25);
    expect(pose.arms[1].end.x).toBeGreaterThan(-0.25);
  });

  it("hauled up a rescue line, hangs in the harness clear of the ice, no boot on the wall beside them", () => {
    const hold = { x: 0, y: 0.7 };
    const held = { falling: true, hanging: true, ground: () => -3, jumar: hold, face: 0.05 };
    const { pose } = settled({ ...held, hurt: "leg" });
    const whole = settled(held).pose;
    const frame = { x: 0, y: 0, pose };

    // The body off the face, upright, the legs hanging below the harness.
    expect(inWorld(frame, pose.pelvis).x).toBeLessThan(0.05 - 0.25);
    expect(Math.abs(pose.tilt)).toBeLessThan(0.4);
    for (const leg of LEGS) {
      expect(inWorld(frame, pose.legs[leg].end).y).toBeLessThan(-0.6);
      expect(inWorld(frame, ofTheBoot(pose, leg, 0)).x).toBeLessThan(0);
    }
    // The cowstail runs to the line, and the near hand is up on it.
    expect(pose.jumar).not.toBeNull();
    expect(inWorld(frame, pose.jumar ?? { x: Number.NaN, y: Number.NaN }).x).toBeCloseTo(hold.x, 1);
    expect(inWorld(frame, pose.arms[0].end).y).toBeGreaterThan(0.3);
    // Unhurt, hanging there, they'd have their boots on the wall.
    expect(inWorld({ x: 0, y: 0, pose: whole }, ofTheBoot(whole, 0, 0)).x).toBeCloseTo(0.05, 1);
  });

  it("kneels over a casualty, bent to the hurt limb, the hands working at it where it is", () => {
    const wound = { x: 0.55, y: 0.2 };
    const { pose, frames } = settled({ tending: { what: "aid", at: wound } });
    const standing = settled({}).pose;
    const hands = frames.slice(60).map(({ arms }) => arms[0].end);

    expect(pose.pelvis.y).toBeLessThan(standing.pelvis.y - 0.25);
    expect(pose.lean).toBeGreaterThan(0.7);
    expect(pose.lean).toBeLessThanOrEqual(1.2);
    // A boot ahead, the other knee down behind.
    expect(pose.legs[0].end.x).toBeGreaterThan(pose.pelvis.x + 0.2);
    expect(pose.legs[1].middle.y).toBeLessThan(0.2);
    for (const hand of hands) {
      expect(length(hand, wound)).toBeLessThan(0.08);
    }
    expect(
      Math.max(...hands.map(({ x }) => x)) - Math.min(...hands.map(({ x }) => x)),
    ).toBeGreaterThan(0.04);
    expect(length(pose.arms[1].end, wound)).toBeLessThan(0.15);
  });

  it("bends less over a limb held high, an arm at the chest, and reaches as far as the arms go to one out of reach", () => {
    const high = settled({ tending: { what: "aid", at: { x: 0.6, y: 0.55 } } }).pose;
    const low = settled({ tending: { what: "aid", at: { x: 0.6, y: 0.2 } } }).pose;
    const far = settled({ tending: { what: "aid", at: { x: 1.6, y: 0.2 } } }).pose;
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM;

    expect(high.lean).toBeLessThan(low.lean - 0.2);
    expect(far.arms[0].end.x).toBeGreaterThan(low.arms[0].end.x);
    expect(length(far.arms[0].root, far.arms[0].end)).toBeLessThanOrEqual(reach);
    expect(far.arms[0].end.x).toBeLessThan(1.2);
  });

  it("kneels at an anchor, the near hand turning a screw into the ice, the far one steadying it", () => {
    const { frames } = settled({ tending: { what: "anchor", at: null } });
    const turning = frames.slice(60).map(({ arms }) => arms[0].end);
    const steady = frames.slice(60).map(({ arms }) => arms[1].end);
    const span = (values: number[]): number => Math.max(...values) - Math.min(...values);

    // Down at the ice ahead of the knee, round and round.
    expect(Math.max(...turning.map(({ y }) => y))).toBeLessThan(0.25);
    expect(Math.min(...turning.map(({ x }) => x))).toBeGreaterThan(0.35);
    expect(span(turning.map(({ x }) => x))).toBeGreaterThan(0.07);
    expect(span(turning.map(({ y }) => y))).toBeGreaterThan(0.07);
    expect(span(steady.map(({ x }) => x))).toBeLessThan(0.01);
  });

  it("carries a casualty bent forward under them, sunk in the knees, the hands back at the hips, and walks so", () => {
    const frames = through([
      { frames: 60, over: {} },
      { frames: 240, over: { carrying: true, moving: true } },
    ]);
    const sound = through([
      { frames: 60, over: {} },
      { frames: 240, over: { moving: true } },
    ]);
    const carrying = frames.slice(-120).map(({ pose }) => pose);
    const walking = sound.slice(-120).map(({ pose }) => pose);
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    for (const pose of carrying) {
      expect(pose.lean).toBeGreaterThanOrEqual(0.44 - 1e-9);
      for (const arm of pose.arms) {
        expect(length(arm.end, pose.pelvis)).toBeLessThan(0.2);
      }
    }
    expect(mean(carrying.map(({ pelvis }) => pelvis.y))).toBeLessThan(
      mean(walking.map(({ pelvis }) => pelvis.y)) - 0.03,
    );
    // The legs stride on under the load.
    const ankles = carrying.map(({ legs }) => legs[0].end.x);
    expect(Math.max(...ankles) - Math.min(...ankles)).toBeGreaterThan(0.25);
  });

  it("rides on a rescuer's back: behind their hips, leaning on them, the arms over their shoulders, the boots ahead of their hips", () => {
    const hips = { x: -0.05, y: 0.8 };
    const { pose } = settled({ hurt: "leg", riding: { hips, lean: 0.45 } });
    const rescuer = {
      x: hips.x + ClimberPose.SPINE * Math.sin(0.45),
      y: hips.y + ClimberPose.SPINE * Math.cos(0.45),
    };

    expect(pose.pelvis.x).toBeLessThan(hips.x - 0.2);
    expect(pose.pelvis.y).toBeGreaterThan(hips.y);
    expect(pose.lean).toBeGreaterThan(0.45);
    // Their shoulders behind the rescuer's and over them; their hands past them, on the chest.
    expect(pose.shoulder.x).toBeLessThan(rescuer.x - 0.1);
    for (const arm of pose.arms) {
      expect(arm.end.x).toBeGreaterThan(rescuer.x);
      expect(arm.end.y).toBeLessThan(rescuer.y);
    }
    // The thighs round the rescuer's waist: the knees by their hips, the boots hanging ahead.
    for (const leg of pose.legs) {
      expect(length(leg.middle, hips)).toBeLessThan(0.3);
      expect(leg.end.x).toBeGreaterThan(hips.x + 0.2);
      expect(leg.end.y).toBeLessThan(hips.y - 0.15);
    }
  });

  it("goes with the rescuer's hips as they stride, and takes a moment to get onto their back", () => {
    const climber = new ClimberPose();
    climber.advance(5, state({ hurt: "leg" }));
    const first = climber.advance(
      FRAME,
      state({ hurt: "leg", riding: { hips: { x: 0, y: 0.8 }, lean: 0.45 } }),
    );
    let pose = first;
    for (let frame = 0; frame < 90; frame += 1) {
      pose = climber.advance(
        FRAME,
        state({ hurt: "leg", riding: { hips: { x: 0, y: 0.8 }, lean: 0.45 } }),
      );
    }
    const lower = climber.advance(
      FRAME,
      state({ hurt: "leg", riding: { hips: { x: 0, y: 0.74 }, lean: 0.45 } }),
    );

    expect(first.pelvis.y).toBeLessThan(0.3);
    expect(pose.pelvis.y).toBeGreaterThan(0.85);
    expect(lower.pelvis.y).toBeCloseTo(pose.pelvis.y - 0.06, 6);
  });

  it("limps on a sprained leg: the hips drop onto it and the body lurches over it as it takes the weight", () => {
    const walk = (limp: number): Pose[] =>
      through([
        { frames: 60, over: {} },
        { frames: 360, over: { moving: true, limp } },
      ])
        .slice(-240)
        .map(({ pose }) => pose);
    const sound = walk(0);
    const sore = walk(1);
    const wrapped = walk(0.45);
    const lowest = (poses: Pose[]): number => Math.min(...poses.map(({ pelvis }) => pelvis.y));
    const most = (poses: Pose[]): number => Math.max(...poses.map(({ lean }) => lean));

    expect(lowest(sore)).toBeLessThan(lowest(sound) - 0.02);
    expect(most(sore)).toBeGreaterThan(most(sound) + 0.06);
    expect(lowest(wrapped)).toBeGreaterThan(lowest(sore));
    expect(lowest(wrapped)).toBeLessThan(lowest(sound));
    // Standing still, a sprain doesn't show.
    expect(settled({ limp: 1 }).pose.pelvis.y).toBeCloseTo(settled({}).pose.pelvis.y, 6);
  });

  it("puts the axe away at once at a rescue's work, and a casualty's: the hands are needed", () => {
    // Off a face of ice, the axe in the near hand: a second on.
    const pick = { swing: 1, at: { x: 0, y: 1.9 }, into: { x: 1, y: 0 } };
    const onTheIce = { ladder: upAWall(1), onIce: true, picks: [pick] };
    const after = (over: Partial<PoseState>): Pose | undefined =>
      through([
        { frames: 120, over: onTheIce },
        { frames: 60, over },
      ]).at(-1)?.pose;

    expect(after({})?.tools[0]?.hand).toBe(0);
    expect(after({ tending: { what: "aid", at: null } })?.tools[0]?.hand).toBeNull();
    expect(after({ carrying: true })?.tools[0]?.hand).toBeNull();
    expect(after({ hurt: "leg" })?.tools[0]?.hand).toBeNull();
  });
});

describe("ClimberPose: a casualty hauled out of a crevasse (#279)", () => {
  const HOLD = { x: 0, y: 0.7 };
  /** A casualty with a broken leg hauled up a rescue line, its lip `lip` from their harness. */
  const hauledAt = (lip: Joint, ground: (ahead: number) => number = flat): Partial<PoseState> => ({
    falling: true,
    hanging: true,
    hurt: "leg",
    jumar: HOLD,
    face: 0,
    ground,
    terrain: ground,
    hauled: { lip },
  });
  const at = (pose: Pose, joint: Joint): Joint => inWorld({ x: 0, y: 0, pose }, joint);
  const head = (pose: Pose): Joint => at(pose, pose.head);
  const ankles = (pose: Pose): Joint[] => pose.legs.map((leg) => at(pose, leg.end));

  it("hangs in the harness below the lip, off the rope's way up, whatever ground the drawing finds by them: never lying as one who fell", () => {
    // A wall's face right at their point, as on a ledge of its steps, or nothing near them.
    const face = (ahead: number): number => (ahead > -0.1 ? 0 : -3);
    for (const ground of [face, (): number => -3]) {
      const { pose } = settled(hauledAt({ x: 0.1, y: 3 }, ground));

      expect(Math.abs(pose.tilt)).toBeLessThan(0.4);
      expect(at(pose, pose.pelvis).x).toBeLessThan(-0.25);
      expect(head(pose).y).toBeGreaterThan(at(pose, pose.pelvis).y + 0.6);
      for (const ankle of ankles(pose)) {
        expect(ankle.y).toBeLessThan(-0.6);
      }
    }
  });

  it("is pulled over the lip chest first: pressed to its edge, the chest over the snow beyond it, the legs down the face", () => {
    const { pose } = settled(hauledAt({ x: 0.02, y: 0 }));
    const shoulder = at(pose, pose.shoulder);

    expect(at(pose, pose.pelvis).x).toBeGreaterThan(-0.25);
    expect(at(pose, pose.pelvis).x).toBeLessThan(-0.1);
    expect(shoulder.x).toBeGreaterThan(0.05);
    expect(shoulder.y).toBeGreaterThan(0.15);
    expect(head(pose).x).toBeGreaterThan(shoulder.x);
    for (const ankle of ankles(pose)) {
      expect(ankle.y).toBeLessThan(-0.6);
      expect(ankle.x).toBeLessThan(-0.1);
    }
    // Nothing of them in the ice under the snow, beyond the face.
    for (const joint of joints(pose).map((joint) => at(pose, joint))) {
      expect(joint.x > 0.02 && joint.y < -0.02).toBe(false);
    }
  });

  it("is dragged down flat onto the snow past the lip, the legs over its edge till the hips are well onto it", () => {
    const coming = settled(hauledAt({ x: -0.25, y: 0 })).pose;
    const onto = settled(hauledAt({ x: -1.2, y: 0 })).pose;

    // Half onto it: the body going over, the legs down over the edge, 25 cm behind.
    expect(coming.tilt).toBeGreaterThan(0.7);
    for (const ankle of ankles(coming)) {
      expect(ankle.x).toBeLessThan(-0.25);
      expect(ankle.y).toBeLessThan(-0.15);
    }
    // Well onto it: face down along the snow, the head toward the anchor, all of them on it.
    expect(onto.tilt).toBeGreaterThan(1.45);
    expect(head(onto).x).toBeGreaterThan(0.5);
    for (const joint of joints(onto).map((joint) => at(onto, joint))) {
      expect(joint.y).toBeGreaterThan(-0.05);
      expect(joint.y).toBeLessThan(0.4);
    }
  });

  it("is dragged sitting, feet first, along a crevasse's floor while the rope runs low to the lip, and lifted off it as it steepens", () => {
    const dragged = settled(hauledAt({ x: 5, y: 2 })).pose;
    const sitting = settled({ hurt: "leg" }).pose;
    const lifting = settled(hauledAt({ x: 1.6, y: 2 })).pose;
    const lifted = settled(hauledAt({ x: 0.4, y: 2 })).pose;

    // As they sat: the broken leg out ahead toward the wall, the hips on the floor.
    expect(at(dragged, dragged.pelvis).y).toBeCloseTo(at(sitting, sitting.pelvis).y, 2);
    expect(ankles(dragged)[0]?.x).toBeGreaterThan(0.6);
    // Lifted: the hips up off the floor, the legs coming down under them, till they stand on
    // it, held up by the rope, the boots on the floor and none in it.
    expect(at(lifting, lifting.pelvis).y).toBeGreaterThan(at(dragged, dragged.pelvis).y);
    expect(ankles(lifting)[0]?.x).toBeLessThan(ankles(dragged)[0]?.x ?? 0);
    expect(Math.abs(lifted.tilt)).toBeLessThan(0.4);
    expect(at(lifted, lifted.pelvis).y).toBeGreaterThan(0.7);
    for (const ankle of [...ankles(lifting), ...ankles(lifted)]) {
      expect(ankle.y).toBeGreaterThan(ClimberPose.ANKLE - 0.01);
    }
  });

  it("comes up a whole haul with no jump: off the floor, up the face, over the lip and onto the snow, lying there once it's done", () => {
    const climber = new ClimberPose();
    climber.advance(5, state({ hurt: "leg" }));
    // Hauled at 0.5 m a second: along a floor 2 m under the lip toward its wall, up the wall, and
    // over the top. The lip is where it is; the casualty comes to it.
    const lips: Joint[] = [];
    for (let x = 5; x > 0; x -= 0.5 / 60) {
      lips.push({ x, y: 2 });
    }
    for (let y = 2; y > 0; y -= 0.5 / 60) {
      lips.push({ x: 0, y });
    }
    for (let x = 0; x > -0.6; x -= 0.5 / 60) {
      lips.push({ x, y: 0 });
    }
    const frames: Frame[] = [];
    for (let frame = 0; frame < 60; frame += 1) {
      frames.push({ x: -5, y: -2, pose: climber.advance(FRAME, state({ hurt: "leg" })) });
    }
    for (const lip of lips) {
      const pose = climber.advance(FRAME, state(hauledAt(lip)));
      frames.push({ x: -lip.x, y: -lip.y, pose });
    }
    for (let frame = 0; frame < 90; frame += 1) {
      frames.push({ x: 0.6, y: 0, pose: climber.advance(FRAME, state({ hurt: "leg" })) });
    }

    // Steadily as they're hauled; a little faster as they go from sitting on the floor into the
    // haul at its start, as one going down from their feet does.
    const hauling = { from: 60 + 54, to: 60 + lips.length };
    pairs(frames).forEach(([before, after], index) => {
      const moved = joints(after.pose).map((joint, at) =>
        length(inWorld(after, joint), inWorld(before, joints(before.pose)[at] ?? joint)),
      );
      const steady = index >= hauling.from && index < hauling.to;
      expect(Math.max(...moved)).toBeLessThan(steady ? 0.05 : 0.12);
    });
  });
});

describe("ClimberPose: a device in the hand (#271)", () => {
  const held = (kind: "radio" | "gps" | "wind" | "tracker", out = 1): Partial<PoseState> => ({
    device: { kind, out, talking: false },
  });
  /** Standing with the device out, settled. */
  const holding = (kind: "radio" | "gps" | "wind" | "tracker"): Pose => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    let pose = climber.advance(FRAME, state(held(kind)));
    for (let frame = 0; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, state(held(kind)));
    }
    return pose;
  };
  const empty = new ClimberPose().advance(5, state());

  it("holds the radio at the mouth in the near hand, the far arm at the side", () => {
    const pose = holding("radio");
    const [near, far] = pose.arms;

    expect(pose.device).toMatchObject({ kind: "radio" });
    expect(length(near.end, pose.head)).toBeLessThan(0.22);
    expect(near.end.x).toBeGreaterThan(pose.head.x);
    expect(length(pose.device?.at ?? pose.pelvis, near.end)).toBeLessThan(1e-9);
    expect(far.end.y).toBeLessThan(pose.pelvis.y + 0.1);
  });

  it("turns the wrist up for the watch, across the chest, the head down to it", () => {
    const pose = holding("gps");
    const hand = pose.arms[0].end;

    expect(pose.device).toMatchObject({ kind: "gps" });
    expect(hand.x).toBeGreaterThan(pose.shoulder.x + 0.1);
    expect(hand.y).toBeLessThan(pose.shoulder.y);
    expect(hand.y).toBeGreaterThan(pose.pelvis.y + 0.2);
    expect(pose.nod).toBeGreaterThan(empty.nod + 0.25);
  });

  it("holds the weather meter up into the wind, over the head, and looks up at it", () => {
    const pose = holding("wind");
    const hand = pose.arms[0].end;

    expect(pose.device).toMatchObject({ kind: "wind" });
    expect(hand.y).toBeGreaterThan(pose.head.y);
    expect(hand.x).toBeGreaterThan(pose.shoulder.x + 0.15);
    expect(pose.nod).toBeLessThan(empty.nod);
  });

  it("holds the tracker in front of the chest, the head down to its screen", () => {
    const pose = holding("tracker");
    const hand = pose.arms[0].end;

    expect(pose.device).toMatchObject({ kind: "tracker" });
    expect(hand.x).toBeGreaterThan(pose.shoulder.x + 0.15);
    expect(hand.y).toBeLessThan(pose.shoulder.y + 0.05);
    expect(hand.y).toBeGreaterThan(pose.pelvis.y + 0.25);
    expect(pose.nod).toBeGreaterThan(empty.nod + 0.2);
  });

  it("goes on walking with it: the legs stride and the far arm swings, the hand that holds it steady by the body", () => {
    const frames = through([
      { frames: 60, over: held("radio") },
      { frames: 240, over: { ...held("radio"), moving: true } },
    ]).slice(120);
    const fromShoulder = (pose: Pose, arm: 0 | 1): Joint => ({
      x: pose.arms[arm].end.x - pose.shoulder.x,
      y: pose.arms[arm].end.y - pose.shoulder.y,
    });
    const spread = (arm: 0 | 1): number => {
      const xs = frames.map(({ pose }) => fromShoulder(pose, arm).x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const strides = frames.map(({ pose }) => pose.legs[0].end.x - pose.legs[1].end.x);

    expect(Math.max(...strides) - Math.min(...strides)).toBeGreaterThan(0.4);
    expect(spread(1)).toBeGreaterThan(0.15);
    expect(spread(0)).toBeLessThan(0.05);
    for (const { pose } of frames) {
      expect(pose.device).toMatchObject({ kind: "radio" });
    }
  });

  it("comes out by way of where it's carried, and goes back, with no joint jumping, standing and walking", () => {
    // Out over 0.7 s from the 30th frame, held, and back over 0.6 s from the 120th.
    const out = (frame: number): number | null =>
      frame < 30
        ? null
        : frame < 120
          ? Math.min(1, (frame - 30) / 42)
          : frame < 156
            ? 1 - (frame - 120) / 36
            : null;
    for (const kind of ["radio", "gps", "wind", "tracker"] as const) {
      for (const moving of [false, true]) {
        const climber = new ClimberPose();
        climber.advance(5, state());
        const frames: Frame[] = [];
        let x = 0;
        for (let frame = 0; frame < 180; frame += 1) {
          x += moving ? 0.01 : 0;
          const share = out(frame);
          const device = share === null ? null : { kind, out: share, talking: false };
          const pose = climber.advance(FRAME, state({ moving, travelled: x, device }));
          frames.push({ x, y: 0, pose });
        }

        for (const [before, after] of pairs(frames)) {
          const from = joints(before.pose);
          joints(after.pose).forEach((joint, index) => {
            const was = from[index] ?? joint;
            // The fastest is the elbow as the arm unfolds from the chest to over the head.
            expect(length(inWorld(before, was), inWorld(after, joint))).toBeLessThan(0.07);
          });
        }
        expect(frames[100]?.pose.device).toMatchObject({ kind });
        expect(frames.at(-1)?.pose.device).toBeNull();
      }
    }
  });

  it("is in the hand only once it's out of where it's carried: the watch is on the wrist all along", () => {
    const climber = new ClimberPose();
    climber.advance(5, state());
    const early = climber.advance(FRAME, state(held("tracker", 0.2)));

    expect(early.device).toBeNull();
    expect(holding("gps").device).not.toBeNull();
  });

  it("is put away where the hands are needed: on a ladder, up a wall, hauling, in a fall", () => {
    const busy: readonly Partial<PoseState>[] = [
      { ladder: across(0) },
      { ladder: upAWall(0.6) },
      { hauling: true },
      { falling: true },
    ];
    for (const over of busy) {
      const climber = new ClimberPose();
      climber.advance(5, state());
      let pose = climber.advance(FRAME, state({ ...over, ...held("radio") }));
      for (let frame = 0; frame < 90; frame += 1) {
        pose = climber.advance(FRAME, state({ ...over, ...held("radio") }));
      }

      expect(pose.device).toBeNull();
    }
  });

  it("gives the jumar to the far hand while a device is out, and takes it back after", () => {
    const climber = new ClimberPose();
    const onTheRope: Partial<PoseState> = { jumar: { x: 0.35, y: 0.75 }, moving: true };
    climber.advance(5, state(onTheRope));
    let pose = climber.advance(FRAME, state(onTheRope));
    const near = (): number => length(pose.arms[0].end, pose.jumar ?? pose.pelvis);
    const far = (): number => length(pose.arms[1].end, pose.jumar ?? pose.pelvis);
    expect(near()).toBeLessThan(0.02);

    for (let frame = 0; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, state({ ...onTheRope, ...held("radio") }));
    }
    expect(far()).toBeLessThan(0.02);
    expect(pose.device).toMatchObject({ kind: "radio" });
    expect(length(pose.arms[0].end, pose.head)).toBeLessThan(0.22);

    for (let frame = 0; frame < 120; frame += 1) {
      pose = climber.advance(FRAME, state(onTheRope));
    }
    expect(near()).toBeLessThan(0.02);
    expect(pose.device).toBeNull();
  });

  it("keeps its bones' lengths with a device out", () => {
    for (const kind of ["radio", "gps", "wind", "tracker"] as const) {
      const pose = holding(kind);
      for (const arm of pose.arms) {
        expect(length(arm.root, arm.middle)).toBeCloseTo(ClimberPose.UPPER_ARM, 9);
        expect(length(arm.middle, arm.end)).toBeCloseTo(ClimberPose.FOREARM, 9);
      }
      expect(length(pose.shoulder, pose.head)).toBeCloseTo(ClimberPose.NECK, 9);
    }
  });
});
