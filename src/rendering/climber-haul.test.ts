import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { ClimberView, Point } from "../physics";
import type { BodyView } from "../simulation";
import { ClimberPose } from "./climber-pose";
import type { Joint, Pose } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import type { ReadSlope } from "./climber-reading";
import { LineHold } from "./line-hold";

/** A crevasse's wall as the slope draws one: its top at 8 m, its lip at 35.4 m, down to its floor
 * in steps of uneven height, each a little further out; the floor at 0, and the far wall. */
const STEPS: readonly (readonly [number, number])[] = [
  [30, 8],
  [35.4, 8],
  [35.4, 6.2],
  [35.75, 6.2],
  [35.75, 4.9],
  [36.2, 4.9],
  [36.2, 3],
  [36.55, 3],
  [36.55, 1.4],
  [36.9, 1.4],
  [36.9, 0],
  [40, 0],
  [40, 8],
  [45, 8],
];
const terrain = new Terrain(STEPS.map(([x, y]) => [x, y]));
/** The rescue line down it, anchored 0.5 m back from the lip, its foot where the casualty lay,
 * 0.4 m out from the wall's foot. */
const SHAPE: readonly Point[] = [
  { x: 34.9, y: 8 },
  ...STEPS.slice(1, 11).map(([x, y]) => ({ x, y })),
  { x: 37.3, y: 0 },
];
const LIP = { x: 35.4, y: 8 };
const slope: ReadSlope = {
  terrain,
  ladder: () => [],
  rope: () => [],
  lines: [{ id: "line", top: 0, foot: 0, shape: SHAPE, built: 1 }],
};
const BODY: BodyView = { tiredness: "fresh", symptoms: [], oximeter: 90, pace: "steady" };
const BROKEN_LEG = {
  part: "leg",
  kind: "fracture",
  step: 0,
  tourniquet: false,
  splinted: true,
  aid: 0,
} as const;
const casualty = (hauled: boolean, at: Point): ClimberView => ({
  x: at.x,
  y: at.y,
  altitude: 5400,
  falling: false,
  dead: false,
  walking: "stop",
  moving: false,
  exertion: 0,
  first: null,
  second: null,
  firstAt: null,
  secondAt: null,
  jumarHeld: false,
  ladder: null,
  falls: [],
  slipChance: 0,
  hanging: false,
  kit: { crampons: true, lamp: true, water: true },
  cramponLoose: false,
  refitting: false,
  hauling: false,
  haulHeld: false,
  onIce: false,
  picks: [],
  pickPoor: false,
  lowering: false,
  gear: { jumar: true, tools: 1 },
  clipping: null,
  stillChance: 0,
  heldBack: null,
  facing: 1,
  towardViewer: false,
  injuries: [BROKEN_LEG],
  down: true,
  carriedBy: null,
  carrying: null,
  onLine: hauled ? "line" : null,
  hauled,
  helping: null,
  sheltered: false,
});

/** A frame of the haul: where the casualty is drawn, which way they face, and their pose. */
interface Frame {
  readonly at: Point;
  readonly facing: 1 | -1;
  readonly pose: Pose;
  readonly hauled: boolean;
}

/** A joint of a frame's pose where it is on the slope. */
function onTheSlope({ at, facing, pose }: Frame, joint: Joint): Point {
  const { offset, tilt } = pose;
  const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)];
  return {
    x: at.x + facing * (offset.x + joint.x * cos + joint.y * sin),
    y: at.y + offset.y - joint.x * sin + joint.y * cos,
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

/** Whether a point is in the ice, well inside it, beside a wall's face as well as under it. */
function inTheIce({ x, y }: Point): boolean {
  const deep = 0.05;
  return [x - deep, x, x + deep].every((near) => y < terrain.height(near) - deep);
}

/** The whole haul at 60 frames a second, the rope coming in at 0.45 m a second as the solo game
 * runs it: a second sitting where they lay, hauled from the foot of the line to its anchor, and a
 * second where the haul left them. */
function haul(): Frame[] {
  const reading = new ClimberReading(slope);
  const pose = new ClimberPose();
  const frames: Frame[] = [];
  const total = new LineHold(SHAPE, SHAPE.at(-1) ?? LIP, 1).down;
  const step = (hauled: boolean, physics: Point): void => {
    const state = reading.read(casualty(hauled, physics), BODY, {
      at: physics,
      jumar: null,
      carabiner: null,
      grown: 1,
    });
    const drawn = pose.advance(1 / 60, state);
    frames.push({ at: reading.drawnAt, facing: reading.facing, pose: drawn, hauled });
  };
  const foot = SHAPE.at(-1) ?? LIP;
  // They lie facing the wall, as one who fell from its lip does.
  reading.read({ ...casualty(false, foot), down: false, walking: "left" }, BODY, {
    at: foot,
    jumar: null,
    carabiner: null,
    grown: 1,
  });
  pose.advance(5, {
    ...reading.read(casualty(false, foot), BODY, {
      at: foot,
      jumar: null,
      carabiner: null,
      grown: 1,
    }),
  });
  for (let frame = 0; frame < 60; frame += 1) {
    step(false, foot);
  }
  for (let down = total; down > 0; down -= 0.45 / 60) {
    step(true, LineHold.along(SHAPE, down));
  }
  const top = SHAPE[0] ?? LIP;
  for (let frame = 0; frame < 60; frame += 1) {
    step(false, top);
  }
  return frames;
}

describe("A casualty hauled out of a crevasse, as the slope draws them (#279)", () => {
  const frames = haul();
  const hauled = frames.filter((frame) => frame.hauled);

  it("keeps every joint out of the ice, from the floor, up the wall's steps and over its lip", () => {
    const inside = frames.flatMap((frame, index) =>
      joints(frame.pose)
        .map((joint) => onTheSlope(frame, joint))
        .filter(inTheIce)
        .map(({ x, y }) => `frame ${index}: (${x.toFixed(2)}, ${y.toFixed(2)})`),
    );

    expect(inside.slice(0, 5)).toEqual([]);
  });

  it("hangs in the harness up the wall, upright, never lying in the air as one who fell", () => {
    const up = hauled.filter((frame) => onTheSlope(frame, frame.pose.pelvis).y < LIP.y - 1.2);

    expect(up.length).toBeGreaterThan(400);
    for (const frame of up) {
      expect(Math.abs(frame.pose.tilt)).toBeLessThan(0.6);
      expect(onTheSlope(frame, frame.pose.head).y).toBeGreaterThan(
        onTheSlope(frame, frame.pose.pelvis).y + 0.5,
      );
    }
  });

  it("is never upright over the lip: once the harness is up to it they're over it on their front", () => {
    const over = frames.filter((frame) => onTheSlope(frame, frame.pose.pelvis).y > LIP.y - 0.02);

    expect(over.length).toBeGreaterThan(60);
    for (const frame of over) {
      const pelvis = onTheSlope(frame, frame.pose.pelvis);
      const shoulder = onTheSlope(frame, frame.pose.shoulder);
      // Leaning well over toward the anchor, the shoulders over the snow on the top, not standing
      // over the crevasse.
      expect(pelvis.x - shoulder.x).toBeGreaterThan(0.8 * (shoulder.y - pelvis.y));
      expect(shoulder.x).toBeLessThan(LIP.x);
    }
  });

  it("comes up smoothly: no joint jumps from one frame to the next while the rope comes in", () => {
    const jumps: string[] = [];
    hauled.slice(40).forEach((frame, index) => {
      const before = hauled[index + 39];
      if (before === undefined) {
        return;
      }
      const now = joints(frame.pose).map((joint) => onTheSlope(frame, joint));
      const then = joints(before.pose).map((joint) => onTheSlope(before, joint));
      const most = Math.max(
        ...now.map((at, at2) =>
          Math.hypot(at.x - (then[at2]?.x ?? at.x), at.y - (then[at2]?.y ?? at.y)),
        ),
      );
      if (most > 0.05) {
        jumps.push(`frame ${index + 40}: ${most.toFixed(3)} m`);
      }
    });

    expect(jumps.slice(0, 5)).toEqual([]);
  });
});
