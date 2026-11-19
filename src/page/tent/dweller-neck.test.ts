import { describe, expect, it } from "vitest";

import { DwellerHead } from "./dweller-head";
import { DwellerNeck } from "./dweller-neck";
import type { Curve } from "./dweller-neck";
import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerJoints, Spot } from "./dweller-pose";
import { DwellerShapes } from "./dweller-shapes";

const pose = new DwellerPose();
const neck = new DwellerNeck();
const head = new DwellerHead("test");
const shapes = new DwellerShapes();
/** How long each act is looked at, in seconds: each one that plays once, to its end, and a few
 * rounds of each that goes round. */
const SEEN: Readonly<Record<Act, number>> = {
  idle: 12,
  light: DwellerPose.LASTS.light + 1,
  pour: DwellerPose.LASTS.pour + 1,
  boil: DwellerPose.LASTS.boil + 1,
  fill: DwellerPose.LASTS.fill + 1,
  steep: DwellerPose.LASTS.steep + 1,
  eat: 0.5 + 3 * DwellerPose.LASTS.eat,
  melt: 0.7 + 2 * DwellerPose.LASTS.melt,
  sleep: 4,
  guitar: 8,
  enter: 1.8,
  leave: 1.1,
  drink: 3.5,
  bar: 3.6,
  pack: 2.4,
  lie: 1.2,
  wake: 1.8,
  radio: 9,
  watch: 9,
  meter: 7,
  tracker: 8,
  "radio-out": 1.4,
  "radio-away": 1.2,
  "radio-talk": 1.7,
  "watch-out": 1.6,
  "watch-away": 1.3,
  "meter-out": 1.7,
  "meter-away": 1.5,
  "tracker-out": 1.5,
  "tracker-away": 1.3,
};

/** Every act's joints, 30 frames a second, each with what it is. */
const POSES: readonly (readonly [string, DwellerJoints])[] = (Object.keys(SEEN) as Act[]).flatMap(
  (act) =>
    Array.from({ length: Math.round(SEEN[act] * 30) + 1 }, (_, index) => {
      const look = pose.look(act, index / 30);
      return [`${act} at ${(index / 30).toFixed(2)} s`, pose.joints(look)] as const;
    }),
);

/** A point of a cubic curve, `t` of the way along it. */
function along({ from, out, in: into, to }: Curve, t: number): Spot {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * from.x + b * out.x + c * into.x + d * to.x,
    y: a * from.y + b * out.y + c * into.y + d * to.y,
  };
}

/** A point of the body's frame in the head's millimetres, the head as `joints` has it. */
function inTheHead(joints: DwellerJoints, { x, y }: Spot): Spot {
  const turn = (spot: Spot, degrees: number): Spot => {
    const angle = (degrees * Math.PI) / 180;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    return { x: spot.x * cos - spot.y * sin, y: spot.x * sin + spot.y * cos };
  };
  // The body turns by `torso` about the hips, and the head by `headAngle` about its middle.
  const middle = turn(joints.head, -joints.torso);
  const local = turn({ x: x - middle.x, y: y - middle.y }, joints.torso - joints.headAngle);
  return { x: local.x / DwellerHead.SCALE, y: local.y / DwellerHead.SCALE };
}

/** Where a vertical line at `x` crosses an outline, top to bottom. */
function crossings(outline: readonly Spot[], x: number): number[] {
  const found: number[] = [];
  outline.forEach((from, index) => {
    const to = outline[(index + 1) % outline.length] ?? from;
    if (from.x > x !== to.x > x) {
      found.push(from.y + ((x - from.x) / (to.x - from.x)) * (to.y - from.y));
    }
  });
  return found.sort((one, other) => one - other);
}

/** Whether an outline has `spot` inside it. */
function inside(outline: readonly Spot[], spot: Spot): boolean {
  return crossings(outline, spot.x).filter((y) => y < spot.y).length % 2 === 1;
}

describe("DwellerNeck: the tent's person's neck, from the collar up into the head (#277)", () => {
  const silhouette = head.silhouette();
  const chin = Math.max(...silhouette.map(({ y }) => y));
  const collar = shapes.body.baseLayer;

  it("comes out from under the jaw in every pose: above the chin nothing of it shows beside the head", () => {
    const beside: string[] = [];
    for (const [what, joints] of POSES) {
      const { far, near } = neck.shape(joints);
      for (const side of [far, near]) {
        for (let step = 0; step <= 24; step += 1) {
          const point = inTheHead(joints, along(side, step / 24));
          if (point.y >= chin || inside(silhouette, point)) {
            continue;
          }
          // Outside the head and above the chin, it's only where the head is above it: under
          // the jaw or the ear.
          const over = crossings(silhouette, point.x);
          const under = over.length > 0 && point.y >= (over.at(-1) ?? 0) - 0.5;
          if (!under) {
            beside.push(`${what}: (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) mm`);
          }
        }
      }
    }

    expect(beside.slice(0, 5)).toEqual([]);
  });

  it("goes down into the base layer's collar, in every pose, the way the body leans", () => {
    const loose: string[] = [];
    for (const [what, joints] of POSES) {
      const { far, near } = neck.shape(joints);
      if (!inside(collar, far.to) || !inside(collar, near.to)) {
        loose.push(what);
      }
    }

    expect(loose.slice(0, 5)).toEqual([]);
  });

  it("is as wide as a man's neck where it shows, and never folds as the head turns on it", () => {
    const folded: string[] = [];
    for (const [what, joints] of POSES) {
      const { far, near } = neck.shape(joints);
      for (let step = 0; step <= 24; step += 1) {
        const [left, right] = [along(far, step / 24), along(near, step / 24)];
        // Across the neck, its near side is to the right of its far one, a neck's width apart.
        if (Math.hypot(right.x - left.x, right.y - left.y) < 0.7 * 2 * DwellerNeck.ROOT.half) {
          folded.push(`${what} at ${step}/24`);
        }
        if (right.x - left.x <= 0) {
          folded.push(`${what} at ${step}/24, crossed`);
        }
      }
    }
    // Where it goes into the collar, a man's neck: about 12 cm across (ANSUR II).
    const across = (2 * DwellerNeck.ROOT.half) / DwellerShapes.SCALE;

    expect(folded.slice(0, 5)).toEqual([]);
    expect(across).toBeGreaterThan(0.11);
    expect(across).toBeLessThan(0.125);
  });

  it("is in the jaw's shadow under it, and the stubble grows a little way down it, wherever the head is turned", () => {
    for (const [, joints] of POSES.filter((_, index) => index % 40 === 0)) {
      const { shade, growth } = neck.shape(joints);
      const [dark, gone] = shade.map((spot) => inTheHead(joints, spot));
      const [grown, bare] = growth.map((spot) => inTheHead(joints, spot));

      // Darkest along the jaw, gone a few centimetres under the chin, down the head and away
      // from the lamp, up and to the right.
      expect(dark?.y).toBeLessThan(chin);
      expect(gone?.y).toBeGreaterThan(chin + 10);
      expect(gone?.x).toBeGreaterThan(dark?.x ?? 0);
      expect(grown?.y).toBeLessThan(chin);
      expect(bare?.y).toBeGreaterThan(chin);
    }
  });

  it("has the muscle from behind the ear down toward the middle of the collar on its near side", () => {
    for (const [what, joints] of POSES.filter((_, index) => index % 40 === 0)) {
      const { muscle, near } = neck.shape(joints);
      const top = inTheHead(joints, muscle.from);

      expect(inside(silhouette, top), what).toBe(true);
      expect(inside(collar, muscle.to), what).toBe(true);
      // Toward the middle: it ends nearer the far side than it starts.
      expect(muscle.to.x).toBeLessThan(near.to.x - DwellerNeck.ROOT.half / 2);
    }
  });
});
