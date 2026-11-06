import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint, Pose, PoseState } from "./climber-pose";
import { Cowstails } from "./cowstails";
import { RopeBeside } from "./rope-beside";

/** Ropes on level snow, in the figure's metres: one from 3 m behind the feet to 8 m ahead, one
 * ending at an anchor half a metre ahead, and the next one on from that anchor. */
const level = (xs: readonly number[]): RopeBeside => new RopeBeside(xs.map((x) => ({ x, y: 0 })));
const line = level([-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
const ropes = (id: string): RopeBeside =>
  ({ ending: level([-3, -2, -1, 0, 0.5]), next: level([0.5, 1.5, 2.5, 3.5]) })[id] ?? line;

type Clipped = PoseState["clipped"];

const state = (clipped: Clipped, over: Partial<PoseState> = {}): PoseState => ({
  travelled: 10,
  moving: false,
  falling: false,
  dead: false,
  onRope: clipped[0] !== null,
  clipped,
  onLadder: false,
  rise: 0,
  tiredness: "fresh",
  pace: "steady",
  ...over,
});

const distance = (a: Joint, b: Joint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** How far `point` is from the line between `from` and `to`. */
function offLine(point: Joint, from: Joint, to: Joint): number {
  const along = { x: to.x - from.x, y: to.y - from.y };
  const share =
    ((point.x - from.x) * along.x + (point.y - from.y) * along.y) /
    (along.x * along.x + along.y * along.y);
  const share01 = Math.min(Math.max(share, 0), 1);
  return distance(point, { x: from.x + along.x * share01, y: from.y + along.y * share01 });
}

/** A climber at a stand, clipped as `before`, and `seconds` after they clip as `after`. */
function clipping(before: Clipped, after: Clipped, seconds: number): Pose {
  const climber = new ClimberPose();
  climber.advance(3, state(before));
  return climber.advance(seconds, state(after));
}

const stood = (clipped: Clipped): Pose => clipping(clipped, clipped, 3);

describe("Cowstails", () => {
  it("hangs the jumar and the carabiner at the hip unclipped, and lifts no rope", () => {
    const pose = stood([null, null]);
    const gear = new Cowstails(pose, ropes);

    for (const device of [gear.jumar, gear.carabiner]) {
      expect(distance(device, pose.pelvis)).toBeLessThan(0.3);
      expect(device.y).toBeLessThan(gear.loop.y);
    }
    expect(gear.through).toEqual([]);
  });

  it("holds the jumar in the near hand, the rope lifted through it from the snow behind to the snow ahead", () => {
    const pose = stood(["line", null]);
    const gear = new Cowstails(pose, ropes);
    const [behind, through, ahead] = gear.through;

    expect(distance(gear.jumar, pose.arms[0].end)).toBeLessThan(1e-4);
    expect(through).toEqual(gear.jumar);
    expect(behind?.y).toBeCloseTo(0, 9);
    expect(behind?.x).toBeLessThan(0);
    expect(ahead?.y).toBeCloseTo(0, 9);
    expect(ahead?.x).toBeGreaterThan(gear.jumar.x + 1);
    expect(distance(gear.carabiner, pose.pelvis)).toBeLessThan(0.3);
  });

  it("runs the carabiner on that rope below the jumar, or alone on the snow just ahead of the feet", () => {
    const both = new Cowstails(stood(["line", "line"]), ropes);
    const [behind = both.jumar] = both.through;
    const alone = new Cowstails(stood([null, "line"]), ropes);

    expect(offLine(both.carabiner, behind, both.jumar)).toBeLessThan(1e-9);
    expect(both.carabiner.y).toBeLessThan(both.jumar.y);
    expect(distance(both.carabiner, both.loop)).toBeLessThan(distance(both.jumar, both.loop));
    expect(alone.carabiner.y).toBeCloseTo(0, 9);
    expect(alone.carabiner.x).toBeGreaterThan(0.2);
    expect(alone.carabiner.x).toBeLessThan(0.8);
    expect(alone.through).toEqual([]);
  });

  it("carries the carabiner in the far hand from the hip to the rope, and the jumar back to the hip", () => {
    const reaching = clipping([null, null], [null, "line"], 0.3);
    const clipped = clipping([null, null], [null, "line"], 1.2);
    const unclipping = clipping(["line", "line"], [null, "line"], 0.3);
    const unclipped = clipping(["line", "line"], [null, "line"], 1.2);
    const atTheHip = new Cowstails(stood([null, null]), ropes).jumar;

    expect(distance(new Cowstails(reaching, ropes).carabiner, reaching.arms[1].end)).toBeLessThan(
      1e-9,
    );
    expect(new Cowstails(clipped, ropes).carabiner.y).toBeCloseTo(0, 9);
    expect(distance(new Cowstails(unclipping, ropes).jumar, unclipping.arms[0].end)).toBeLessThan(
      1e-9,
    );
    expect(new Cowstails(unclipping, ropes).through).toHaveLength(3);
    expect(distance(new Cowstails(unclipped, ropes).jumar, atTheHip)).toBeLessThan(0.05);
    expect(new Cowstails(unclipped, ropes).through).toEqual([]);
  });

  it("moves the carabiner past the anchor onto the next rope, the jumar still on the first", () => {
    const gear = new Cowstails(clipping(["ending", "ending"], ["ending", "next"], 1.2), ropes);

    expect(gear.carabiner.y).toBeCloseTo(0, 9);
    expect(gear.carabiner.x).toBeGreaterThan(0.5);
    expect(gear.through.at(-1)?.x).toBeCloseTo(0.5, 9);
  });

  it("leaves the jumar on a rope the hand doesn't lift, slid up a wall as far as its sling reaches", () => {
    // Up a ladder's wall from the feet: the hands on the ladder, the rope where it hangs.
    const wall = new RopeBeside([0, 1, 2, 3].map((y) => ({ x: 0, y })));
    const climber = new ClimberPose();
    const onLadder = { onRope: false, onLadder: true };
    climber.advance(3, state(["line", "line"], onLadder));
    const climbing = new Cowstails(
      climber.advance(1 / 60, state(["line", "line"], { ...onLadder, moving: true })),
      () => wall,
    );
    const falling = new Cowstails(
      new ClimberPose().advance(1, state(["line", null], { falling: true })),
      ropes,
    );

    expect(climbing.jumar.x).toBeCloseTo(0, 9);
    expect(climbing.jumar.y).toBeGreaterThan(climbing.loop.y + 0.4);
    expect(climbing.carabiner.x).toBeCloseTo(0, 9);
    expect(climbing.carabiner.y).toBeLessThan(climbing.jumar.y);
    expect(climbing.through).toEqual([]);
    expect(distance(falling.jumar, line.nearest(falling.jumar))).toBeLessThan(1e-9);
    expect(falling.through).toEqual([]);
  });
});
