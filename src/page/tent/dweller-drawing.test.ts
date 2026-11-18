import { describe, expect, it } from "vitest";
import { DwellerDrawing } from "./dweller-drawing";
import { DwellerPose } from "./dweller-pose";

const SEAT = { x: 640, y: 574 };
const drawing = new DwellerDrawing(SEAT);
const pose = new DwellerPose();

/** The numbers of a path or a transform, in the order they're written. */
function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/gu)].map(([found]) => Number(found));
}

describe("DwellerDrawing: the person in the tent as a drawing (#258)", () => {
  it("draws a person of parts: a body, legs, two arms with hands, a head with a face, and what the hands hold", () => {
    const markup = drawing.markup();

    for (const part of ["all", "torso", "leg0", "leg1", "arm0", "arm1", "hand0", "hand1", "head"]) {
      expect(markup).toContain(`data-part="${part}"`);
    }
    for (const face of [
      "dw-eye",
      "dw-iris",
      "dw-lid",
      "dw-brow",
      "dw-nose",
      "dw-mouth",
      "dw-ear",
    ]) {
      expect(markup).toContain(face);
    }
    for (const held of ["spoon", "bottle", "bar", "pouch", "snow", "lighter"]) {
      expect(markup).toContain(`data-held="${held}"`);
    }
  });

  it("sits them on their seat, whole, their eyes open and their mouth shut", () => {
    const frame = drawing.frame(pose.look("idle", 1));

    expect(frame.all).toBe("translate(640 574)");
    expect(frame.shown).toBe(1);
    expect(frame.lids).toBeCloseTo(0, 9);
    expect(frame.mouth).toBe(0);
    expect(frame.guitar).toBe(false);
    expect(frame.stream).toBe("");
  });

  it("ends each sleeve at the wrist, short of the hand, and keeps the arm's bones their lengths", () => {
    const look = pose.look("melt", 2.5);
    const frame = drawing.frame(look);
    const [sx = 0, sy = 0, ex = 0, ey = 0, wx = 0, wy = 0] = numbers(frame.arms[0]);
    const [hx = 0, hy = 0] = numbers(frame.hands[0]);

    expect(Math.hypot(ex - sx, ey - sy)).toBeCloseTo(DwellerPose.UPPER_ARM, 0);
    expect(Math.hypot(hx - wx, hy - wy)).toBeCloseTo(9, 0);
    expect(Math.hypot(hx - ex, hy - ey)).toBeCloseTo(DwellerPose.FOREARM, 0);
  });

  it("shuts the eyes in a blink and opens the mouth for a spoonful", () => {
    const looks = Array.from({ length: 80 }, (_, index) => pose.look("cook", index / 20, 0.8));
    const frames = looks.map((look) => drawing.frame(look));

    expect(Math.max(...frames.map(({ lids }) => lids))).toBeGreaterThan(4);
    expect(Math.max(...frames.map(({ mouth }) => mouth))).toBeGreaterThan(4);
    expect(frames.every(({ holds }) => holds[0] === "spoon" && holds[1] === "pouch")).toBe(true);
  });

  it("pours the bottle's water into the pot while it's tipped over it, and not as it's drunk from", () => {
    const pouring = drawing.frame(pose.look("cook", 3, 0.25));
    const drinking = drawing.frame(pose.look("drink", 1.2));

    expect(pouring.holds[0]).toBe("bottle");
    expect(pouring.stream).not.toBe("");
    const [, , , , toX = 0, toY = 0] = numbers(pouring.stream);
    // Into the pot in the vestibule: left of the seat, above the floor.
    expect(toX).toBeLessThan(-200);
    expect(toY).toBeLessThan(-30);
    expect(drinking.holds[0]).toBe("bottle");
    expect(drinking.stream).toBe("");
  });

  it("puts the legs under them on hands and knees, their hips off the mats, and fades them in at the door", () => {
    const crawling = drawing.frame(pose.look("enter", 0.3));
    const sitting = drawing.frame(pose.look("idle", 0));
    const knee = (path: string): number => numbers(path)[3] ?? 0;

    expect(crawling.shown).toBeLessThan(1);
    expect(numbers(crawling.all)[0]).toBeLessThan(SEAT.x - 200);
    expect(numbers(crawling.all)[1]).toBeLessThan(SEAT.y - 30);
    // Sitting, the knee is level with the hips; kneeling, it's under them, on the mats.
    expect(knee(sitting.legs[0])).toBeLessThan(0);
    expect(knee(crawling.legs[0])).toBeGreaterThan(40);
  });

  it("turns them to the pack, mirrored, and lifts a foot with the guitar's beat", () => {
    const packing = drawing.frame(pose.look("pack", 1.2));
    const beats = Array.from({ length: 40 }, (_, index) =>
      drawing.frame(pose.look("guitar", index / 20)),
    );
    const toes = beats.map(({ feet }) => numbers(feet[1])[3] ?? 0);

    expect(packing.all).toContain("scale(-1 1)");
    expect(beats.every(({ guitar }) => guitar)).toBe(true);
    expect(Math.max(...toes) - Math.min(...toes)).toBeGreaterThan(4);
    expect(new Set(beats.map(({ feet }) => feet[0])).size).toBe(1);
  });

  it("fades them out as they lie down into the bag", () => {
    expect(drawing.frame(pose.look("sleep", 3)).shown).toBe(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeGreaterThan(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeLessThan(1);
  });
});
