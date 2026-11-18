import { describe, expect, it } from "vitest";
import { HandBones, HandTurn, Vector3 } from "./hand-bones";
import type { Digit, Grip } from "./hand-bones";

/** Where a finger or the thumb ends: its tip's joint. */
const tip = (digit: Digit | undefined): Vector3 => digit?.joints.at(-1) ?? Vector3.ZERO;
/** How far a point is from a line through `centre` along `axis`, a unit way. */
const fromAxis = (point: Vector3, centre: Vector3, axis: Vector3): number =>
  point.minus(centre).across(axis).size;
/** The grips that close round something round, and those that hold it some other way. */
const ROUND: readonly Grip[] = ["wrap", "cup", "fist", "pot", "lighter"];
const GRIPS: readonly Grip[] = ["open", ...ROUND, "fret", "pinch", "seal", "plate", "top", "bar"];
const close = (a: Vector3, b: Vector3, within = 1e-9): void => {
  expect(a.minus(b).size).toBeLessThan(within);
};

describe("HandBones: a man's hand in three dimensions, posed for what it holds (#274)", () => {
  it("is a median man's hand: as long from the wrist to the middle fingertip, as wide across the palm", () => {
    const xs = HandBones.PALM.map(([x]) => x);
    const middle = HandBones.FINGERS[1];
    const straight = (middle?.knuckle.y ?? 0) + (middle?.lengths ?? []).reduce((a, b) => a + b, 0);

    // ANSUR II's median man: 88 mm across the palm, 193 from the wrist's crease to the
    // fingertip, which is a little beyond the joint the hand turns about.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(84);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(92);
    expect(straight).toBeGreaterThan(193);
    expect(straight).toBeLessThan(212);
    // The middle finger is the longest, the little finger the shortest; the thumb starts low on
    // the palm, on its side.
    const lengths = HandBones.FINGERS.map(({ lengths: bones }) => bones[0] + bones[1] + bones[2]);
    expect(Math.max(...lengths)).toBe(lengths[1]);
    expect(Math.min(...lengths)).toBe(lengths[3]);
    expect(HandBones.THUMB.base.y).toBeLessThan(40);
    expect(HandBones.THUMB.base.x).toBeGreaterThan(0);
  });

  it("closes each finger round what it wraps until it touches it, and the thumb round it the other way", () => {
    for (const grip of ROUND) {
      const shape = HandBones.shape(grip);
      const thing = shape.thing;
      if (thing === null || thing.kind !== "round") {
        throw new Error(`${grip} holds nothing round`);
      }
      for (const finger of shape.fingers) {
        // Along each of its bones, from the knuckle out.
        const along = finger.joints.slice(1).flatMap((joint, index) => {
          const from = finger.joints[index] ?? joint;
          return [0.25, 0.5, 0.75, 1].map((share) => from.toward(joint, share));
        });
        const nearest = Math.min(
          ...along.map((point) => fromAxis(point, thing.centre, thing.axis)),
        );
        // On it, not through it: within a finger's thickness of its surface, and no deeper than
        // the flesh gives; round a thin handle, curled into the hollow of the hand.
        const slack = thing.radius < 15 ? 12 : 6;
        expect(nearest).toBeLessThan(thing.radius + (finger.radii[1] ?? 10) + slack);
        expect(nearest).toBeGreaterThan(thing.radius - 5);
      }
      // Round the thing from the other side from the fingertips.
      const round = (point: Vector3): Vector3 =>
        point.minus(thing.centre).across(thing.axis).unit();
      const angle = round(tip(shape.fingers[1])).angle(round(tip(shape.thumb)));
      expect(angle).toBeGreaterThan(grip === "fist" || grip === "pot" ? 40 : 70);
    }
  });

  it("opens every grip to the same relaxed hand, and closes it on its thing as far as it's shut", () => {
    const relaxed = HandBones.shape("open", 0);
    for (const grip of GRIPS) {
      const open = HandBones.shape(grip, 0);
      open.fingers.forEach((finger, index) => {
        close(tip(finger), tip(relaxed.fingers[index]));
      });
      close(tip(open.thumb), tip(relaxed.thumb));
      // Halfway shut, halfway there.
      const shut = HandBones.shape(grip, 1);
      const half = HandBones.shape(grip, 0.5);
      const [from, to, between] = [
        tip(open.fingers[1]),
        tip(shut.fingers[1]),
        tip(half.fingers[1]),
      ];
      expect(between.minus(from).size).toBeLessThan(to.minus(from).size + 1e-9);
    }
    // Spread flat, the fingers lie nearly straight and apart.
    const spread = HandBones.shape("open", 0, 1);
    expect(tip(spread.fingers[0]).x - tip(spread.fingers[3]).x).toBeGreaterThan(
      tip(relaxed.fingers[0]).x - tip(relaxed.fingers[3]).x,
    );
  });

  it("holds a pouch by its side, the fingers over its face, or by its top hanging under them, and a bar by its end", () => {
    const side = HandBones.shape("plate");
    const top = HandBones.shape("top");
    const bar = HandBones.shape("bar");
    const along = new Vector3(0, 1, 0);

    // Held by its top, the pouch is further along the fingers than the knuckles, and points
    // back toward the wrist: it hangs under the hand that lifts it.
    expect(top.hold.dot(along)).toBeGreaterThan(HandBones.FINGERS[1]?.knuckle.y ?? 0);
    expect(top.aim.dot(along)).toBeLessThan(0);
    // Up along its face, whichever way it's held; a bar out past the knuckles.
    for (const shape of [side, top, bar]) {
      expect(Math.abs(shape.aim.dot(shape.face ?? Vector3.ZERO))).toBeLessThan(1e-9);
    }
    expect(bar.hold.size).toBeGreaterThan(HandBones.FINGERS[1]?.knuckle.y ?? 0);
    // Its face to the viewer, a pouch has the fingers over it, the back of the hand to the
    // viewer; a bar, the thumb, and the palm to the viewer.
    const seen = (shape: typeof side): number =>
      HandBones.turned(shape, new Vector3(0, -1, 0), new Vector3(0.3, 0.9, 0.3).unit()).back.dot(
        Vector3.OUT,
      );
    expect(seen(side)).toBeGreaterThan(0);
    expect(seen(top)).toBeGreaterThan(0);
    expect(top.face).toEqual(side.face);
    expect(seen(bar)).toBeLessThan(0);
  });

  it("turns a hand to hold its thing the way the pose aims it, a flat one with its face to the viewer", () => {
    const aim = new Vector3(Math.sin(0.6), -Math.cos(0.6), 0);
    const forearm = new Vector3(0.8, 0.5, 0.33).unit();
    for (const grip of GRIPS.filter((name) => name !== "open")) {
      const shape = HandBones.shape(grip);
      const turn = HandBones.turned(shape, aim, forearm);
      close(turn.of(shape.aim.unit()), aim, 1e-6);
      if (shape.face !== null) {
        close(turn.of(shape.face.unit()), Vector3.OUT, 1e-6);
      }
    }
  });
});

describe("HandTurn: which way a hand is turned (#274)", () => {
  it("makes a right hand from the way its fingers point and its back faces, and a left one its mirror", () => {
    const turn = HandTurn.of(new Vector3(0.3, 0.9, 0.2), new Vector3(0.2, -0.3, 1));
    for (const way of [turn.thumb, turn.along, turn.back]) {
      expect(way.size).toBeCloseTo(1, 9);
    }
    expect(turn.along.dot(turn.back)).toBeCloseTo(0, 9);
    close(turn.thumb, turn.along.cross(turn.back), 1e-9);
    // As near the back asked for as the fingers let it be.
    expect(turn.back.angle(new Vector3(0.2, -0.3, 1))).toBeLessThan(30);
    const left = turn.mirrored();
    close(left.thumb, turn.thumb.mirrored());
    close(left.thumb, left.back.cross(left.along), 1e-9);
  });

  it("turns smoothly through a back asked for along the fingers, rather than flip", () => {
    let before = HandTurn.of(new Vector3(0, 1, 0), new Vector3(0.6, 0.8, 0));
    for (let step = 1; step <= 60; step += 1) {
      const lean = 0.6 - (1.2 * step) / 60;
      const now = HandTurn.of(new Vector3(0, 1, 0), new Vector3(lean, 0.8, 0));
      expect(now.back.angle(before.back)).toBeLessThan(12);
      before = now;
    }
  });

  it("goes from one turn to another the short way round, and ends there", () => {
    const from = HandTurn.FLAT;
    const to = HandTurn.of(new Vector3(1, 0.2, 0), new Vector3(0, -1, 0.4));
    close(from.toward(to, 0).along, from.along, 1e-9);
    close(from.toward(to, 1).along, to.along, 1e-9);
    close(from.toward(to, 1).back, to.back, 1e-9);
    // Halfway, as far from each.
    const half = from.toward(to, 0.5);
    expect(half.along.angle(from.along)).toBeCloseTo(half.along.angle(to.along), 0);
  });
});
