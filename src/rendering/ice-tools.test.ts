import { describe, expect, it } from "vitest";

import type { Joint } from "./climber-pose";
import { IceTools } from "./ice-tools";
import type { DrawnTool, HeldTools, PickIn, ToolBody, ToolsState } from "./ice-tools";

const FRAME = 1 / 60;

/** A climber on the ice, their feet at the origin, facing a face of it 0.3 m ahead. */
const BODY: ToolBody = {
  roots: [
    { x: 0.02, y: 1.31 },
    { x: -0.02, y: 1.31 },
  ],
  pelvis: { x: 0, y: 0.82 },
  lean: 0.1,
  reach: 0.58,
  hands: [
    { x: 0.12, y: 0.78 },
    { x: -0.06, y: 0.8 },
  ],
  inside: (point) => point,
  turned: (way) => way,
};

const INTO_THE_FACE: Joint = { x: 1, y: 0 };

const pick = (swing: number, y: number, x = 0.3, into = INTO_THE_FACE): PickIn => ({
  swing,
  at: { x, y },
  into,
});

const state = (over: Partial<ToolsState> = {}): ToolsState => ({
  picks: [],
  poor: false,
  carried: 1,
  upright: true,
  free: true,
  ...over,
});

/** `seconds` of frames of the tools in `now`, each frame's tools. */
function play(tools: IceTools, now: ToolsState, seconds: number, body = BODY): HeldTools[] {
  const frames: HeldTools[] = [];
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame += 1) {
    tools.advance(FRAME, now);
    frames.push(tools.place(body));
  }
  return frames;
}

const last = (frames: readonly HeldTools[]): HeldTools => {
  const frame = frames.at(-1);
  if (frame === undefined) {
    throw new Error("No frames");
  }
  return frame;
};

const kind = (held: HeldTools, which: DrawnTool["kind"]): DrawnTool => {
  const tool = held.tools.find((drawn) => drawn.kind === which);
  if (tool === undefined) {
    throw new Error(`No ${which} drawn`);
  }
  return tool;
};

const apart = (a: Joint, b: Joint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Whether the axe is cocked in a frame: in the near hand, up over the shoulder, its head dropped
 * back behind the hand. */
const cocked = (frame: HeldTools): boolean => {
  const axe = kind(frame, "axe");
  const hand = frame.hands[0];
  if (axe.hand !== 0 || hand === null) {
    return false;
  }
  const tip = IceTools.tip(axe);
  return hand.y > BODY.roots[0].y + 0.2 && tip.x < hand.x - 0.3 && tip.y < hand.y;
};

describe("IceTools", () => {
  it("starts with the axe strapped to the pack, head down, and a second tool beside it when there's one", () => {
    const one = last(play(new IceTools(), state(), 0.1));
    expect(one.tools.map(({ kind, hand }) => ({ kind, hand }))).toEqual([
      { kind: "axe", hand: null },
    ]);
    expect(one.hands).toEqual([null, null]);
    const axe = kind(one, "axe");
    // Head down: from the grip up by the lid, the shaft runs down the pack, behind the back.
    expect(Math.sin(axe.angle)).toBeLessThan(-0.95);
    expect(axe.grip.x).toBeLessThan(BODY.pelvis.x - 0.2);
    expect(axe.grip.y).toBeGreaterThan(BODY.pelvis.y + 0.35);

    const two = last(play(new IceTools(), state({ carried: 2 }), 0.1));
    expect(two.tools.map(({ kind, hand }) => ({ kind, hand }))).toEqual([
      { kind: "axe", hand: null },
      { kind: "tool", hand: null },
    ]);
    expect(last(play(new IceTools(), state({ carried: 0 }), 0.1)).tools).toEqual([]);
  });

  it("swings the axe off the pack into the first pick: over the shoulder, cocked behind the head, and in where the pick went", () => {
    const tools = new IceTools();
    play(tools, state(), 0.2);
    const first = pick(1, 2);
    const frames = play(tools, state({ picks: [first] }), 1.2);

    // The near hand goes up over the shoulder to the pack for it, the axe still strapped on.
    const reaching = frames.slice(0, 6);
    for (const frame of reaching) {
      expect(kind(frame, "axe").hand).toBeNull();
      expect(frame.hands[0]).not.toBeNull();
    }
    // Cocked: the hand up over the shoulder, the axe's head dropped back behind it.
    expect(frames.some(cocked)).toBe(true);

    // In: the pick's point a little way into the ice where it went in, the hand on the grip.
    const done = last(frames);
    const axe = kind(done, "axe");
    expect(axe.hand).toBe(0);
    const tip = IceTools.tip(axe);
    expect(tip.x).toBeGreaterThan(first.at.x);
    expect(apart(tip, first.at)).toBeLessThan(0.04);
    expect(apart(done.hands[0] ?? { x: 9, y: 9 }, axe.grip)).toBeLessThan(1e-9);
    // The shaft hangs from the pick along the face, its grip out from the ice.
    expect(Math.sin(axe.angle)).toBeGreaterThan(0.95);
    expect(axe.grip.x).toBeLessThan(first.at.x - 0.1);
  });

  it("strikes once, as the pick goes in at the end of the swing, its head whipping through fastest then", () => {
    const tools = new IceTools();
    play(tools, state(), 0.2);
    const frames = play(tools, state({ picks: [pick(1, 2)] }), 1.2);
    const struck = frames.flatMap((frame, index) => frame.strikes.map(() => index));
    expect(struck).toHaveLength(1);
    const at = struck[0] ?? 0;
    expect(frames[at]?.strikes[0]).toMatchObject({ at: { x: 0.3, y: 2 }, into: INTO_THE_FACE });

    // The shaft turns far faster in the strike's last frames than in its first: a flick of the
    // wrist, the hand ahead and the head whipping through after it.
    const angles = frames.slice(at - 6, at + 1).map((frame) => kind(frame, "axe").angle);
    const turned = (from: number, to: number): number =>
      Math.abs((angles[to] ?? 0) - (angles[from] ?? 0));
    expect(turned(3, 6)).toBeGreaterThan(2 * turned(0, 3));
    // And it stops dead in the ice: no more than a shudder after.
    const after = frames.slice(at + 1).map((frame) => kind(frame, "axe").angle);
    expect(Math.max(...after) - Math.min(...after)).toBeLessThan(0.15);
  });

  it("on the axe alone, takes it out of the pick it hung from, out and up, and swings it into the next", () => {
    const tools = new IceTools();
    play(tools, state({ picks: [pick(1, 1.9)] }), 1.5);
    const before = IceTools.tip(
      kind(last(play(tools, state({ picks: [pick(1, 1.9)] }), 0.1)), "axe"),
    );
    const next = pick(2, 2.3);
    const frames = play(tools, state({ picks: [next] }), 1.2);
    // Out first: the pick comes up and away from the ice.
    const out = IceTools.tip(kind(frames[8] ?? last(frames), "axe"));
    expect(out.x).toBeLessThan(before.x - 0.03);
    // Then back over the shoulder, and into the next.
    expect(frames.some(cocked)).toBe(true);
    expect(apart(IceTools.tip(kind(last(frames), "axe")), next.at)).toBeLessThan(0.04);
    expect(last(frames).strikes).toEqual([]);
    expect(frames.flatMap(({ strikes }) => strikes)).toHaveLength(1);
  });

  it("keeps each tool in its own hand on two: the hands take turns swinging, and never swap", () => {
    const tools = new IceTools();
    const two = (picks: readonly PickIn[]): ToolsState => state({ carried: 2, picks });
    const p1 = pick(1, 1.9);
    const p2 = pick(2, 2.1, 0.28);
    const p3 = pick(3, 2.3);
    const frames = [
      ...play(tools, two([p1]), 1.5),
      ...play(tools, two([p2, p1]), 1.5),
      ...play(tools, two([p3, p2]), 1.5),
    ];
    for (const frame of frames) {
      for (const tool of frame.tools) {
        expect(tool.hand === null || tool.hand === (tool.kind === "axe" ? 0 : 1)).toBe(true);
      }
    }
    const done = last(frames);
    // The axe went in first and third, the second tool between, and stays where it went.
    expect(apart(IceTools.tip(kind(done, "axe")), p3.at)).toBeLessThan(0.04);
    expect(apart(IceTools.tip(kind(done, "tool")), p2.at)).toBeLessThan(0.04);
    expect(done.hands.every((hand) => hand !== null)).toBe(true);
  });

  it("leaves the hands free that hold no tool: the near one takes the axe, the far one the second", () => {
    const tools = new IceTools();
    play(tools, state({ carried: 2 }), 0.1);
    expect(tools.handsFree).toEqual([true, true]);
    play(tools, state({ carried: 2, picks: [pick(1, 2)] }), 1.5);
    expect(tools.handsFree).toEqual([false, true]);
    play(tools, state({ carried: 2, picks: [pick(2, 2.2), pick(1, 2)] }), 1.5);
    expect(tools.handsFree).toEqual([false, false]);
  });

  it("sets a pick that bites poorly shallow, and a sound one deeper", () => {
    const depth = (poor: boolean): number => {
      const tools = new IceTools();
      const frames = play(tools, state({ picks: [pick(1, 2)], poor }), 1.5);
      return IceTools.tip(kind(last(frames), "axe")).x - 0.3;
    };
    expect(depth(false)).toBeGreaterThan(depth(true) + 0.008);
    expect(depth(true)).toBeGreaterThanOrEqual(0);
  });

  it("puts the climber's weight on a pick as it settles, and none once it's in", () => {
    const tools = new IceTools();
    play(tools, state(), 0.1);
    const loads: number[] = [];
    for (let frame = 0; frame < 90; frame += 1) {
      tools.advance(FRAME, state({ picks: [pick(1, 2)] }));
      tools.place(BODY);
      loads.push(tools.loading);
    }
    expect(Math.max(...loads)).toBeGreaterThan(0.5);
    expect(loads.at(-1)).toBe(0);
  });

  it("takes the axe out over the lip and straps it back on the pack once they're off the ice", () => {
    const tools = new IceTools();
    const lip = pick(1, 1.6, 0.6, { x: 0, y: -1 });
    play(tools, state({ picks: [lip] }), 1.5);
    const frames = play(tools, state(), 3);
    expect(frames.some((frame) => kind(frame, "axe").hand === 0)).toBe(true);
    const done = last(frames);
    expect(kind(done, "axe").hand).toBeNull();
    expect(done.hands).toEqual([null, null]);
    const packed = last(play(new IceTools(), state(), 0.1));
    expect(apart(kind(done, "axe").grip, kind(packed, "axe").grip)).toBeLessThan(1e-9);
  });

  it("straps it on at once for a ladder, and keeps it in the hand in a fall", () => {
    const toLadder = new IceTools();
    play(toLadder, state({ picks: [pick(1, 2)] }), 1.5);
    const quick = play(toLadder, state({ free: false }), 1.2);
    expect(kind(last(quick), "axe").hand).toBeNull();

    const falling = new IceTools();
    play(falling, state({ picks: [pick(1, 2)] }), 1.5);
    const fall = play(falling, state({ upright: false }), 3);
    expect(fall.every((frame) => kind(frame, "axe").hand === 0)).toBe(true);
  });

  it("goes on from where the tool is when the next pick cuts a swing short: the tool never jumps", () => {
    const tools = new IceTools();
    play(tools, state({ picks: [pick(1, 1.9)] }), 1.5);
    const swinging = play(tools, state({ picks: [pick(2, 2.2)] }), 0.3);
    const cut = play(tools, state({ picks: [pick(3, 2.0, 0.32)] }), 1.2);
    // The step across the cut is no bigger than the steps the tool was taking before it.
    const earlier = IceTools.tip(kind(swinging.at(-2) ?? last(swinging), "axe"));
    const before = IceTools.tip(kind(last(swinging), "axe"));
    const after = IceTools.tip(kind(cut[0] ?? last(cut), "axe"));
    expect(apart(before, after)).toBeLessThan(1.3 * apart(earlier, before) + 0.005);
    expect(apart(IceTools.tip(kind(last(cut), "axe")), { x: 0.32, y: 2 })).toBeLessThan(0.04);
    // Off the pack, the axe leaves the straps where it was strapped: no jump into the hand.
    const drawing = new IceTools();
    play(drawing, state(), 0.1);
    const frames = play(drawing, state({ picks: [pick(1, 2)] }), 0.6);
    const taken = frames.findIndex((frame) => kind(frame, "axe").hand === 0);
    const strapped = kind(frames[taken - 1] ?? last(frames), "axe");
    const held = kind(frames[taken] ?? last(frames), "axe");
    expect(apart(IceTools.tip(strapped), IceTools.tip(held))).toBeLessThan(0.05);
  });
});
