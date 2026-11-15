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
  slack: 10,
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
});
