import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";
import { FrontShapes } from "./front-shapes";

const front = new FrontShapes();
const side = new FigureShapes();
const { standing } = front;
const pelvis = standing.pelvis.y;

const top = (outline: Outline): number => Math.max(...outline.map(({ y }) => y));
const bottom = (outline: Outline): number => Math.min(...outline.map(({ y }) => y));
const leftmost = (outline: Outline): number => Math.min(...outline.map(({ x }) => x));
const rightmost = (outline: Outline): number => Math.max(...outline.map(({ x }) => x));
const across = (outline: Outline): number => rightmost(outline) - leftmost(outline);
const apart = (a: Joint, b: Joint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Where the side figure's head shape `outline` reaches up to, as it stands, turned by its nod. */
function sideHeadTop(outline: Outline): number {
  const cos = Math.cos(-standing.nod);
  const sin = Math.sin(-standing.nod);
  return standing.head.y + Math.max(...outline.map(({ x, y }) => x * sin + y * cos));
}

/** Whether an outline is another mirrored across the middle, corner for corner. */
function mirrors(left: Outline, right: Outline): boolean {
  return (
    left.length === right.length &&
    left.every(({ x, y }) => right.some((point) => apart(point, { x: -x, y }) < 1e-9))
  );
}

describe("FrontShapes", () => {
  it("stands as tall as the side figure, its hood's top where the side's is", () => {
    // #235's front figure stood 8 cm taller than the side one, its head too big and too high.
    expect(Math.abs(top(front.head.hood) - sideHeadTop(side.hood))).toBeLessThan(0.015);
    expect(top(front.head.hood)).toBeLessThan(1.77);
  });

  it("bends at the knees, the hips, the shoulders and the elbows where the side figure does", () => {
    const [near, far] = standing.legs;
    const [arm] = standing.arms;
    const { DOWN } = FigureShapes;
    // A limb's round end is as wide as its down round the joint it hangs from, cut into corners.
    for (const leg of front.legs) {
      expect(top(leg.thigh.outline) - DOWN.thigh.root).toBeCloseTo(pelvis, 2);
      expect(top(leg.shin.outline) - DOWN.shin.root).toBeCloseTo(
        (near.middle.y + far.middle.y) / 2,
        2,
      );
    }
    for (const limb of front.arms) {
      expect(top(limb.upper.outline) - DOWN.upperArm.root).toBeCloseTo(arm.root.y, 2);
      expect(top(limb.forearm.outline) - DOWN.forearm.root).toBeCloseTo(arm.middle.y, 2);
      // The mitt hangs round the hand, as the side's does.
      expect(bottom(limb.mitt)).toBeLessThan(arm.end.y);
      expect(top(limb.mitt)).toBeGreaterThan(arm.end.y);
    }
  });

  it("keeps the body between the crotch, under the pelvis, and the collar, over the shoulders", () => {
    // #235's body hung from 0.95 m: its crotch was over the side figure's pelvis.
    const outline = front.torso.outline;
    expect(bottom(outline)).toBeLessThan(pelvis);
    expect(bottom(outline)).toBeCloseTo(pelvis + Math.min(...side.torso.map(({ y }) => y)), 1);
    expect(top(outline)).toBeGreaterThan(standing.shoulder.y);
    expect(top(outline)).toBeLessThan(standing.shoulder.y + 0.1);
  });

  it("belts the harness and begins the yoke as high as the side figure's", () => {
    const { from, to } = FigureShapes.BELT;
    expect(bottom(front.harness.belt)).toBeCloseTo(pelvis + from, 6);
    expect(top(front.harness.belt)).toBeCloseTo(pelvis + to, 6);
    expect(bottom(front.yoke)).toBeCloseTo(pelvis + FigureShapes.YOKE, 6);
    // The cowstails tie in under the belt, at the foot of the belay loop.
    expect(front.tie.y).toBeLessThan(pelvis + from);
    expect(front.tie.y).toBeGreaterThan(bottom(front.harness.belay) - 0.01);
  });

  it("pads each limb with as much down as the side figure's, and puffs it between the seams", () => {
    const { DOWN, SEAMS } = FigureShapes;
    const [, right] = front.legs;
    // Across its root, a thigh is as wide as the side's.
    const hip = right.thigh.outline.filter(({ y }) => Math.abs(y - pelvis) < 0.02);
    expect(across(hip)).toBeGreaterThan(2 * DOWN.thigh.root - 0.01);
    expect(across(hip)).toBeLessThan(2 * DOWN.thigh.root + 0.02);
    // Its seams are the side's, and between two the down bulges out past the bone's taper.
    const { thigh } = right;
    const length = pelvis - (top(right.shin.outline) - DOWN.shin.root);
    expect(thigh.seams.length).toBe(SEAMS.thigh.length);
    const widest = FigureShapes.band(
      thigh.outline,
      thigh.along,
      (thigh.seams[0] ?? 0) + 0.04,
      (thigh.seams[0] ?? 0) + 0.05,
    );
    const share = ((SEAMS.thigh[0] ?? 0) + (SEAMS.thigh[1] ?? 0)) / 2;
    const tapered = 2 * (DOWN.thigh.root + (DOWN.thigh.end - DOWN.thigh.root) * share);
    expect(across(widest)).toBeGreaterThan(tapered + FrontShapes.PUFF);
    expect(length).toBeGreaterThan(0.35);
    expect(front.torso.seams).toEqual(SEAMS.torso.map((up) => pelvis + up));
  });

  it("is as broad as a climber in down, the hood as wide as the side's is deep", () => {
    const [left, right] = front.arms;
    const shoulders = rightmost(right.upper.outline) - leftmost(left.upper.outline);
    expect(shoulders).toBeGreaterThan(0.55);
    expect(shoulders).toBeLessThan(0.68);
    expect(Math.abs(across(front.head.hood) - across(side.hood))).toBeLessThan(0.02);
    // The arms hang out from the body a little: the forearms clear the waist.
    const waist = FigureShapes.band(front.torso.outline, FigureShapes.UP, pelvis, pelvis + 0.06);
    expect(leftmost(right.forearm.outline)).toBeGreaterThan(rightmost(waist) - 0.01);
  });

  it("stands each boot on the ground, its crampon's points as deep as the side's", () => {
    for (const { boot } of front.legs) {
      expect(bottom(boot.shell)).toBeCloseTo(0, 9);
      expect(Math.abs(top(boot.shell) - top(side.boot))).toBeLessThan(0.02);
      expect(Math.min(...boot.crampon.map(bottom))).toBeCloseTo(
        Math.min(...side.crampon.map(bottom)),
        9,
      );
    }
  });

  it("draws the left of the figure as the right one mirrored", () => {
    const [left, right] = front.legs;
    const [leftArm, rightArm] = front.arms;
    expect(mirrors(left.thigh.outline, right.thigh.outline)).toBe(true);
    expect(mirrors(left.boot.shell, right.boot.shell)).toBe(true);
    expect(mirrors(leftArm.upper.outline, rightArm.upper.outline)).toBe(true);
    expect(mirrors(leftArm.mitt, rightArm.mitt)).toBe(true);
    for (const outline of [front.torso.outline, front.head.hood, front.mask.on]) {
      expect(mirrors(outline, outline)).toBe(true);
    }
  });

  it("puts the lamp on the brim over the goggles, and the valve on the mask over the mouth", () => {
    const { head, mask, lamp, mouth } = front;
    expect(lamp.y).toBeGreaterThan(top(head.goggles));
    expect(lamp.y).toBeLessThan(top(head.hood));
    expect(Math.abs(lamp.y - sideHeadTop([{ x: 0.11, y: 0.111 }]))).toBeLessThan(0.01);
    expect(mouth.y).toBeGreaterThan(bottom(mask.on));
    expect(mouth.y).toBeLessThan(top(mask.on));
    expect(top(mask.on)).toBeLessThan(top(head.goggles));
  });

  it("runs the hose from the regulator over the shoulder to the valve, wherever the mask is", () => {
    for (const masked of [true, false]) {
      const hose = front.hose(1, masked);
      const valve = masked ? front.mask.valve : front.mask.hangingValve;
      const end = hose[hose.length - 1] ?? { x: 0, y: 0 };
      expect(apart(end, valve)).toBeLessThan(0.025);
      // Over the left shoulder, beside the collar.
      expect(hose.some(({ x, y }) => x < -0.12 && Math.abs(y - standing.shoulder.y) < 0.03)).toBe(
        true,
      );
    }
    // A Sherpa's bigger pack carries the regulator higher, by its size.
    const [client] = front.hose(1, true);
    const [sherpa] = front.hose(1.3, true);
    expect((sherpa?.y ?? 0) - pelvis).toBeCloseTo(((client?.y ?? 0) - pelvis) * 1.3, 6);
  });

  it("hangs the mask off the face on the chest, under the collar and over the yoke", () => {
    const { hanging, hangingValve } = front.mask;
    expect(top(hanging)).toBeLessThan(bottom(front.collar));
    expect(bottom(hanging)).toBeGreaterThan(pelvis + FigureShapes.YOKE - 0.04);
    expect(hangingValve.y).toBeLessThan(top(hanging));
    expect(ClimberPose.STANDING).toBe(pelvis);
  });
});
