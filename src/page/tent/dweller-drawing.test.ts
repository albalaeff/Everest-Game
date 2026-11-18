import { describe, expect, it } from "vitest";
import { DwellerDrawing } from "./dweller-drawing";
import type { LimbFrame, LimbName } from "./dweller-drawing";
import { DwellerPose } from "./dweller-pose";
import { DwellerShapes } from "./dweller-shapes";

const SEAT = { x: 640, y: 574 };
const drawing = new DwellerDrawing(SEAT);
const pose = new DwellerPose();
/** The lamp's way, up and to the right. */
const LAMP = { x: 0.55, y: -0.83 };
const LIMBS: readonly LimbName[] = [
  "upper0",
  "fore0",
  "upper1",
  "fore1",
  "thigh0",
  "shin0",
  "foot0",
  "thigh1",
  "shin1",
  "foot1",
];

/** The numbers of a path or a transform, in the order they're written. */
function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/gu)].map(([found]) => Number(found));
}

/** Where a limb's frame is: its root, its angle in degrees, and how much of its length shows. */
function placed(limb: LimbFrame): { x: number; y: number; angle: number; short: number } {
  const [x = 0, y = 0, angle = 0, short = 0] = numbers(limb.transform);
  return { x, y, angle, short };
}

describe("DwellerDrawing: the person in the tent as a drawing (#258, #264)", () => {
  it("draws the slope's climber in parts: the quilted body and limbs, hands open and closed, a head with a face, and what the hands hold", () => {
    const markup = drawing.markup();

    for (const part of [
      "all",
      "torso",
      ...LIMBS,
      "upper0-drop",
      "fore1-drop",
      "hand0",
      "hand1",
      "head",
      "guitar",
      "stream",
    ]) {
      expect(markup).toContain(`data-part="${part}"`);
    }
    for (const kit of [
      "dw-baffle",
      "dw-seam",
      "dw-yoke",
      "dw-zip",
      "dw-cuff",
      "dw-panel",
      "dw-sole",
    ]) {
      expect(markup).toContain(`class="${kit}"`);
    }
    for (const face of ["dw-iris", "dw-lid-skin", "dw-brow", "dw-nose", "dw-lip-upper", "dw-ear"]) {
      expect(markup).toContain(face);
    }
    expect(markup.match(/class="dw-fist"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-open"/gu)?.length).toBeGreaterThanOrEqual(2);
    for (const held of ["spoon", "bottle", "bar", "pouch", "snow", "lighter", "pick"]) {
      expect(markup.match(new RegExp(`data-held="${held}"`, "gu"))).toHaveLength(2);
    }
  });

  it("sits them on their seat, whole, their eyes open, their mouth shut and their hands open", () => {
    const frame = drawing.frame(pose.look("idle", 1));

    expect(frame.all).toBe("translate(640 574)");
    expect(frame.shown).toBe(1);
    expect(frame.eyes).toBe(1);
    expect(frame.mouth).toBe(0);
    expect(frame.fists).toEqual([false, false]);
    expect(frame.guitar).toBe(false);
    expect(frame.stream).toBe("");
  });

  it("draws each limb along its bone, shorter where it comes toward the viewer and never longer", () => {
    for (const [act, seconds, progress] of [
      ["idle", 1, 0],
      ["melt", 2.5, 0],
      ["cook", 2, 0.5],
      ["guitar", 0.4, 0],
      ["enter", 0.6, 0],
    ] as const) {
      const frame = drawing.frame(pose.look(act, seconds, progress));
      for (const name of LIMBS) {
        const { short } = placed(frame.limbs[name]);
        expect(short).toBeGreaterThan(0.2);
        expect(short).toBeLessThanOrEqual(1);
      }
    }
    // Sitting, the forearms reach forward to the knees; holding the pouch, toward the viewer.
    const sitting = drawing.frame(pose.look("idle", 1));
    const holding = drawing.frame(pose.look("cook", 2, 0.5));
    expect(placed(sitting.limbs.fore0).short).toBeLessThan(0.75);
    expect(placed(holding.limbs.fore1).short).toBeLessThan(placed(sitting.limbs.fore1).short);
  });

  it("ends each sleeve at the wrist, its share of the forearm short of the hand", () => {
    const look = pose.look("melt", 2.5);
    const joints = pose.joints(look);
    const fore = placed(drawing.frame(look).limbs.fore0);
    const length = DwellerShapes.FOREARM * fore.short;
    const wrist = {
      x: fore.x + length * Math.cos((fore.angle * Math.PI) / 180),
      y: fore.y + length * Math.sin((fore.angle * Math.PI) / 180),
    };
    const forearm = Math.hypot(
      joints.hands[0].x - joints.elbows[0].x,
      joints.hands[0].y - joints.elbows[0].y,
    );
    const share = DwellerShapes.GRIP / (DwellerShapes.FOREARM + DwellerShapes.GRIP);

    expect(fore.x).toBeCloseTo(joints.elbows[0].x, 1);
    expect(fore.y).toBeCloseTo(joints.elbows[0].y, 1);
    expect(Math.hypot(joints.hands[0].x - wrist.x, joints.hands[0].y - wrist.y)).toBeCloseTo(
      forearm * share,
      0,
    );
  });

  it("lights each limb on its side toward the lamp, whichever way the pose turns it", () => {
    for (const [act, seconds] of [
      ["idle", 1],
      ["wake", 1.08],
      ["melt", 2.2],
    ] as const) {
      const frame = drawing.frame(pose.look(act, seconds));
      for (const name of LIMBS) {
        const { lit } = frame.limbs[name];
        const { angle } = placed(frame.limbs[name]);
        const radians = (angle * Math.PI) / 180;
        // The limb's own +y side, on the screen.
        const plus = { x: -Math.sin(radians), y: Math.cos(radians) };
        const toward = plus.x * LAMP.x + plus.y * LAMP.y;
        expect(lit === "plus" ? toward : -toward).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("drops each arm's shadow down and to the left of it", () => {
    const frame = drawing.frame(pose.look("idle", 1));
    const drop = DwellerDrawing.drop(frame.limbs.upper0);

    expect(drop.startsWith("translate(-3 4) ")).toBe(true);
    expect(drop.endsWith(frame.limbs.upper0.transform)).toBe(true);
  });

  it("shuts the eyes in a blink, opens the mouth for a spoonful, and closes the hands round the spoon and the pouch", () => {
    const looks = Array.from({ length: 80 }, (_, index) => pose.look("cook", index / 20, 0.8));
    const frames = looks.map((look) => drawing.frame(look));

    expect(Math.min(...frames.map(({ eyes }) => eyes))).toBeLessThan(0.3);
    expect(Math.max(...frames.map(({ mouth }) => mouth))).toBeGreaterThan(0.8);
    expect(frames.every(({ holds }) => holds[0] === "spoon" && holds[1] === "pouch")).toBe(true);
    expect(frames.every(({ fists }) => fists[0] && fists[1])).toBe(true);
  });

  it("looks where the pose looks, as far as the eye turns", () => {
    const frame = drawing.frame({ ...pose.look("idle", 1), gaze: { x: 5, y: -1 } });

    expect(frame.gaze.x).toBeCloseTo(2.6, 6);
    expect(frame.gaze.y).toBeCloseTo(-1.4, 6);
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
    const down = (limb: LimbFrame): number => Math.sin((placed(limb).angle * Math.PI) / 180);

    expect(crawling.shown).toBeLessThan(1);
    expect(numbers(crawling.all)[0]).toBeLessThan(SEAT.x - 200);
    expect(numbers(crawling.all)[1]).toBeLessThan(SEAT.y - 30);
    // Sitting, the thigh is out across the mats; kneeling, it's down under the hips.
    expect(Math.abs(down(sitting.limbs.thigh0))).toBeLessThan(0.3);
    expect(down(crawling.limbs.thigh0)).toBeGreaterThan(0.7);
  });

  it("turns them to the pack, mirrored, and lifts a foot with the guitar's beat", () => {
    const packing = drawing.frame(pose.look("pack", 1.2));
    const beats = Array.from({ length: 40 }, (_, index) =>
      drawing.frame(pose.look("guitar", index / 20)),
    );
    const turns = beats.map(({ limbs }) => placed(limbs.foot1).angle);

    expect(packing.all).toContain("scale(-1 1)");
    expect(beats.every(({ guitar }) => guitar)).toBe(true);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(4);
    expect(new Set(beats.map(({ limbs }) => limbs.foot0.transform)).size).toBe(1);
  });

  it("fades them out as they lie down into the bag", () => {
    expect(drawing.frame(pose.look("sleep", 3)).shown).toBe(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeGreaterThan(0);
    expect(drawing.frame(pose.look("lie", 0.6)).shown).toBeLessThan(1);
  });
});
