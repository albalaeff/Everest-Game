import { describe, expect, it } from "vitest";
import { DwellerBlend } from "./dweller-blend";
import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerLook, Spot } from "./dweller-pose";

const pose = new DwellerPose();
const FRAME = 1 / 60;
const far = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);
/** The looks shown over `seconds` of `act` from its start, a sixtieth of a second each. */
function shown(blend: DwellerBlend, act: Act, seconds: number): DwellerLook[] {
  return Array.from({ length: Math.round(seconds / FRAME) + 1 }, (_, frame) =>
    blend.next(pose.look(act, frame * FRAME), act, frame === 0 ? 0 : FRAME),
  );
}

describe("DwellerBlend: the person in the tent between one act and the next (#269)", () => {
  it("shows an act as it is while it goes on", () => {
    const blend = new DwellerBlend();

    shown(blend, "idle", 1).forEach((look, frame) => {
      expect(look).toEqual(pose.look("idle", frame * FRAME));
    });
  });

  it("turns the pose they were in into the next act's, over a third of a second, so nothing jumps when a drink cuts a chore short", () => {
    const blend = new DwellerBlend();
    const stirring = shown(blend, "melt", 2).at(-1);
    const drinking = shown(blend, "drink", 1);
    const [first] = drinking;
    if (stirring === undefined || first === undefined) {
      throw new Error("nothing was shown");
    }

    // The first frame of the drink is where the stirring left off, though the drink itself
    // begins with the hand on the knee, the body upright.
    expect(first.lean).toBeCloseTo(stirring.lean, 6);
    expect(far(first.hands[0].at, stirring.hands[0].at)).toBeLessThan(0.01);
    expect(far(pose.look("drink", 0).hands[0].at, stirring.hands[0].at)).toBeGreaterThan(100);
    // From frame to frame the hand moves a little at a time.
    drinking.slice(1).forEach((look, index) => {
      const before = drinking[index] ?? look;
      expect(far(look.hands[0].at, before.hands[0].at)).toBeLessThan(16);
      expect(Math.abs(look.lean - before.lean)).toBeLessThan(2.5);
    });
    // And after a third of a second it's the drink's own pose, the stove still burning.
    const after = Math.ceil(DwellerBlend.LASTS / FRAME) + 1;
    expect(drinking[after]).toEqual({ ...pose.look("drink", after * FRAME), flame: 1 });
    expect(drinking[after - 6]?.hands).not.toEqual(pose.look("drink", (after - 6) * FRAME).hands);
  });

  it("takes what a hand holds, and all that's one thing or another, from the new act at once", () => {
    const blend = new DwellerBlend();
    shown(blend, "melt", 2);
    const [first] = shown(blend, "guitar", 0);

    expect(first?.hands.map(({ holds }) => holds)).toEqual(["pick", "neck"]);
    expect(first?.guitar).toBe(true);
    expect(first?.dips).toBeNull();
    expect(first?.lump).toBeNull();
    // The flame goes down with the pose, not out at once.
    expect(first?.flame).toBeCloseTo(1, 6);
  });

  it("leaves the stove burning through a drink taken over a chore, and out when there's no chore", () => {
    const blend = new DwellerBlend();
    shown(blend, "melt", 2);
    const drinking = shown(blend, "drink", DwellerPose.ONCE.drink ?? 0);

    expect(pose.look("drink", 1).flame).toBe(0);
    expect(drinking.every(({ flame }) => flame === 1)).toBe(true);
    // Back at the chore the stove is the chore's again, and sitting it's out.
    expect(shown(blend, "fill", 3).at(-1)?.flame).toBe(0);
    expect(shown(blend, "bar", 1).every(({ flame }) => flame === 0)).toBe(true);
    const sitting = new DwellerBlend();
    shown(sitting, "idle", 1);
    expect(shown(sitting, "drink", 1).every(({ flame }) => flame === 0)).toBe(true);
  });

  it("turns what a hand holds the short way round", () => {
    const blend = new DwellerBlend();
    const from = pose.look("idle", 0);
    const hand = (aim: number): DwellerLook => ({
      ...from,
      hands: [{ ...from.hands[0], aim }, from.hands[1]],
    });
    blend.next(hand(170), "idle", 0);
    blend.next(hand(-170), "light", 0);
    const middle = blend.next(hand(-170), "light", DwellerBlend.LASTS / 2);

    // From 170 on through 180 to 190, which is -170: not back through 0.
    expect(middle.hands[0].aim).toBeCloseTo(180, 6);
  });

  it("doesn't blend into or out of the sleeping bag, at the door, or turning to the pack: those run on by themselves", () => {
    const cut = (from: Act, at: number, to: Act): boolean => {
      const blend = new DwellerBlend();
      shown(blend, from, at);
      return shown(blend, to, 0)[0] === undefined
        ? false
        : JSON.stringify(shown(new DwellerBlend(), to, 0)[0]) ===
            JSON.stringify(blend.next(pose.look(to, 0), to, 0));
    };

    // Asleep to waking, lying down to asleep, in at the door to sitting.
    expect(cut("sleep", 1, "wake")).toBe(true);
    expect(cut("lie", DwellerPose.ONCE.lie ?? 0, "sleep")).toBe(true);
    expect(cut("idle", 1, "leave")).toBe(false);
    const blend = new DwellerBlend();
    shown(blend, "pack", 1.2);
    expect(blend.next(pose.look("idle", 0), "idle", 0)).toEqual(pose.look("idle", 0));
  });
});
