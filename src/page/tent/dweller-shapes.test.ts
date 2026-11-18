import { describe, expect, it } from "vitest";
import { ClimberPose } from "../../rendering/climber-pose";
import { FigureShapes } from "../../rendering/figure-shapes";
import type { Outline } from "../../rendering/figure-shapes";
import { FrontShapes } from "../../rendering/front-shapes";
import { DwellerShapes } from "./dweller-shapes";
import { TentArt } from "./tent-art";

const shapes = new DwellerShapes();
const front = new FrontShapes();
const { SCALE } = DwellerShapes;
const pelvis = front.standing.pelvis.y;

function extent(outline: Outline): { left: number; right: number; top: number; bottom: number } {
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

describe("DwellerShapes: the person in the tent on the slope climber's bones and suit (#264)", () => {
  it("draws at the tent's own scale", () => {
    expect(SCALE).toBe(TentArt.SCALE);
  });

  it("gives the arms and the legs the slope climber's bones", () => {
    expect(DwellerShapes.UPPER_ARM).toBeCloseTo(ClimberPose.UPPER_ARM * SCALE, 9);
    expect(DwellerShapes.FOREARM).toBeCloseTo(ClimberPose.FOREARM * SCALE, 9);
    expect(DwellerShapes.THIGH).toBeCloseTo(ClimberPose.THIGH * SCALE, 9);
    expect(DwellerShapes.SHIN).toBeCloseTo(ClimberPose.SHIN * SCALE, 9);
    for (const [part, length] of [
      [shapes.upperArm, DwellerShapes.UPPER_ARM],
      [shapes.forearm, DwellerShapes.FOREARM],
      [shapes.thigh, DwellerShapes.THIGH],
      [shapes.shin, DwellerShapes.SHIN],
    ] as const) {
      expect(part.length).toBeCloseTo(length, 9);
    }
  });

  it("pads each limb as thick as the suit's down, round both its ends", () => {
    const pads = [
      [shapes.upperArm, FigureShapes.DOWN.upperArm],
      [shapes.forearm, FigureShapes.DOWN.forearm],
      [shapes.thigh, FigureShapes.DOWN.thigh],
      [shapes.shin, FigureShapes.DOWN.shin],
    ] as const;
    for (const [part, down] of pads) {
      const { left, right, top, bottom } = extent(part.outline);
      expect(left).toBeCloseTo(-down.root * SCALE, 0);
      expect(right).toBeCloseTo(part.length + down.end * SCALE, 0);
      // As thick as its root, and a few millimetres more where the down bulges.
      expect(bottom - top).toBeGreaterThanOrEqual(2 * down.root * SCALE - 0.5);
      expect(bottom - top).toBeLessThan(2 * (down.root + FrontShapes.PUFF) * SCALE + 0.5);
    }
  });

  it("quilts the arms, the thighs and the body between the slope's seams", () => {
    expect(shapes.upperArm.seams).toHaveLength(FigureShapes.SEAMS.upperArm.length);
    expect(shapes.upperArm.baffles).toHaveLength(FigureShapes.SEAMS.upperArm.length + 1);
    expect(shapes.forearm.seams).toHaveLength(FigureShapes.SEAMS.forearm.length);
    expect(shapes.thigh.seams).toHaveLength(FigureShapes.SEAMS.thigh.length);
    expect(shapes.body.seams).toHaveLength(FigureShapes.SEAMS.torso.length);
    expect(shapes.body.baffles).toHaveLength(FigureShapes.SEAMS.torso.length + 1);
    // A seam on the upper arm is where the side figure's is, a share of the bone from the root.
    const [first] = shapes.upperArm.seams;
    const middle = first === undefined ? NaN : (extent(first).left + extent(first).right) / 2;
    expect(middle).toBeCloseTo((FigureShapes.SEAMS.upperArm[0] ?? 0) * DwellerShapes.UPPER_ARM, 0);
  });

  it("sits on the front figure's body: its crotch on the mats under the hips, its width the suit's", () => {
    const body = extent(shapes.body.outline);
    const standing = extent(front.torso.outline);

    expect(body.bottom).toBeCloseTo((pelvis - standing.top) * SCALE, 6);
    expect(body.bottom).toBeCloseTo(FrontShapes.CROTCH * SCALE, 0);
    expect(body.right - body.left).toBeCloseTo((standing.right - standing.left) * SCALE, 6);
    // The yoke over the shoulders, the dark band the slope's climber has.
    expect(extent(shapes.body.yoke).bottom).toBeCloseTo(-FigureShapes.YOKE * SCALE, 6);
  });

  it("hangs the arms from the front figure's shoulders, and holds the head where the slope's climber's is", () => {
    const [left, right] = DwellerShapes.SHOULDERS;
    const root = front.standing.arms[0].root.y;

    expect(right.x - left.x).toBeCloseTo(2 * FrontShapes.ARMS.shoulder * SCALE, 9);
    expect(left.y).toBeCloseTo(-(root - pelvis) * SCALE, 9);
    expect(right.y).toBe(left.y);
    const head = DwellerShapes.NECK.y + DwellerShapes.HEAD.y;
    expect(head).toBeCloseTo(-(front.standing.head.y - pelvis) * SCALE, 0);
  });

  it("undoes the zip to the chest, the base layer in the opening and the hood down behind the neck", () => {
    const { zip, opening, collar, hood, baseLayer } = shapes.body;
    const collarTop = DwellerShapes.NECK.y;
    const [, top] = zip;

    expect(top?.y).toBeCloseTo(collarTop + 0.15 * SCALE, 6);
    expect(extent(opening).bottom).toBeCloseTo(collarTop + 0.15 * SCALE, 6);
    expect(extent(collar[0]).right).toBeLessThanOrEqual(extent(collar[1]).left + 8);
    // The base layer's collar stands under the jaw, the hood lies behind the neck above the
    // shoulders, lower than the chin.
    const chin = DwellerShapes.NECK.y + DwellerShapes.HEAD.y + 0.115 * SCALE;
    expect(extent(baseLayer).top).toBeGreaterThan(chin - 2);
    expect(extent(hood).top).toBeGreaterThan(chin - 2);
    expect(extent(hood).bottom).toBeLessThan(DwellerShapes.SHOULDERS[0].y + 6);
  });

  it("crosses the legs sitting: knees out to the sides, each ankle under the other knee, no bone longer than it is", () => {
    const { hips, knees, ankles, toes } = shapes.legs(0);

    for (const side of [0, 1] as const) {
      const out = side === 0 ? -1 : 1;
      expect(knees[side].x * out).toBeGreaterThan(Math.abs(hips[side].x) + 40);
      expect(ankles[side].x * out).toBeLessThan(0);
      expect(toes[side].x * out).toBeLessThan(-40);
      expect(Math.hypot(knees[side].x - hips[side].x, knees[side].y - hips[side].y)).toBeLessThan(
        DwellerShapes.THIGH,
      );
      expect(
        Math.hypot(ankles[side].x - knees[side].x, ankles[side].y - knees[side].y),
      ).toBeLessThanOrEqual(DwellerShapes.SHIN);
    }
  });

  it("puts the knees under the hips on hands and knees, the shins trailing behind, on the mats however high the hips", () => {
    const rise = 46;
    const { hips, knees, ankles } = shapes.legs(1, rise);
    const between = shapes.legs(0.5, rise);
    const mats = FrontShapes.CROTCH * SCALE + rise;

    for (const side of [0, 1] as const) {
      expect(Math.abs(knees[side].x)).toBeLessThan(20);
      expect(knees[side].y).toBeGreaterThan(hips[side].y + 40);
      expect(knees[side].y + FigureShapes.DOWN.shin.root * SCALE).toBeCloseTo(mats, 0);
      expect(ankles[side].x).toBeGreaterThan(knees[side].x + 80);
      expect(between.knees[side].x).toBeCloseTo(
        (knees[side].x + shapes.legs(0).knees[side].x) / 2,
        9,
      );
    }
  });

  it("puts a cuff on the sleeve's end, and a down bootie on each foot", () => {
    const cuff = extent(shapes.cuff);
    expect(cuff.left).toBeCloseTo(DwellerShapes.FOREARM - 0.07 * SCALE, 6);
    expect(cuff.right).toBeCloseTo(DwellerShapes.FOREARM - 0.02 * SCALE, 6);
    const bootie = extent(shapes.bootie.outline);
    expect(bootie.right).toBeCloseTo(DwellerShapes.BOOTIE.length + DwellerShapes.BOOTIE.half, 0);
    expect(shapes.bootie.seams).toHaveLength(2);
  });
});
