import { describe, expect, it } from "vitest";

import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerLook, Spot } from "./dweller-pose";

const far = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);
/** The looks of an act, a twentieth of a second apart, over `seconds`. */
const looks = (act: Act, seconds: number, progress = 0): DwellerLook[] =>
  Array.from({ length: Math.round(seconds * 20) + 1 }, (_, frame) =>
    pose.look(act, frame / 20, progress),
  );
const ACTS: readonly Act[] = [
  "idle",
  "melt",
  "cook",
  "sleep",
  "guitar",
  "enter",
  "leave",
  "drink",
  "bar",
  "pack",
  "lie",
  "wake",
];

const pose = new DwellerPose();

describe("DwellerPose: the person in the tent (#258)", () => {
  it("never draws an arm's bones longer than they are, the hands where they go when they reach", () => {
    for (const act of ACTS) {
      for (const progress of [0.05, 0.25, 0.5, 0.8]) {
        for (const look of looks(act, 3, progress)) {
          const joints = pose.joints(look);
          for (const side of [0, 1] as const) {
            const upper = far(joints.shoulders[side], joints.elbows[side]);
            const lower = far(joints.elbows[side], joints.hands[side]);
            // An elbow swinging from one side to the other comes toward the viewer: shorter
            // on the picture, never longer.
            expect(upper).toBeLessThan(DwellerPose.UPPER_ARM + 1e-6);
            expect(lower).toBeLessThan(DwellerPose.FOREARM + 0.05);
            const reach = far(joints.shoulders[side], look.hands[side]);
            if (reach < DwellerPose.UPPER_ARM + DwellerPose.FOREARM - 1 && reach > 6) {
              expect(far(joints.hands[side], look.hands[side])).toBeLessThan(0.01);
            }
          }
        }
      }
    }
  });

  it("keeps the bones their lengths with the hands low: sitting, at the stove, on hands and knees", () => {
    for (const act of ["idle", "melt", "enter"] as const) {
      for (const look of looks(act, 3)) {
        const joints = pose.joints(look);
        for (const side of [0, 1] as const) {
          expect(far(joints.shoulders[side], joints.elbows[side])).toBeCloseTo(
            DwellerPose.UPPER_ARM,
            6,
          );
          expect(far(joints.elbows[side], joints.hands[side])).toBeCloseTo(DwellerPose.FOREARM, 1);
        }
      }
    }
  });

  it("hangs the elbow under the hand on the guitar's neck, and swings both out for a stretch", () => {
    const playing = pose.joints(pose.look("guitar", 1));
    const stretching = pose.joints(pose.look("wake", 1.1));

    expect(playing.elbows[1].y).toBeGreaterThan(playing.hands[1].y);
    expect(stretching.elbows[0].x).toBeLessThan(stretching.shoulders[0].x);
    expect(stretching.elbows[1].x).toBeGreaterThan(stretching.shoulders[1].x);
  });

  it("sits still but for the breath, a blink and a glance at the door", () => {
    const sitting = looks("idle", 12);

    expect(sitting.every(({ lying, shown, guitar }) => lying === 0 && shown === 1 && !guitar)).toBe(
      true,
    );
    expect(sitting.some(({ eyes }) => eyes < 0.3)).toBe(true);
    expect(sitting.filter(({ eyes }) => eyes === 1).length).toBeGreaterThan(200);
    expect(Math.max(...sitting.map(({ tilt }) => Math.abs(tilt)))).toBeGreaterThan(3);
    expect(
      Math.max(...sitting.map(({ hands }) => hands[0].y)) -
        Math.min(...sitting.map(({ hands }) => hands[0].y)),
    ).toBeLessThan(4);
  });

  it("leans to the pot to melt snow, the flame lit: stirring, and a lump of snow in every few seconds", () => {
    const melting = looks("melt", 12);

    expect(melting.every(({ lean, flame }) => lean > 25 && flame === 1)).toBe(true);
    expect(melting.some(({ holds }) => holds[0] === "snow")).toBe(true);
    expect(melting.some(({ holds }) => holds[0] === "spoon")).toBe(true);
    const stirring = melting
      .filter(({ holds }) => holds[0] === "spoon")
      .map(({ hands }) => hands[0].x);
    expect(Math.max(...stirring) - Math.min(...stirring)).toBeGreaterThan(20);
  });

  it("cooks in order: lights the stove, pours the bottle's water in, lets the pouch stand, then eats", () => {
    const [lighting] = looks("cook", 0, 0.06);
    const [pouring] = looks("cook", 0, 0.25);
    const [standing] = looks("cook", 0, 0.5);
    const eating = looks("cook", 4, 0.8);

    expect(lighting?.holds[0]).toBe("lighter");
    expect(lighting?.flame).toBeGreaterThan(0);
    expect(lighting?.flame).toBeLessThan(1);
    expect(pouring).toMatchObject({ holds: ["bottle", "nothing"], flame: 1 });
    expect(standing).toMatchObject({ holds: ["nothing", "pouch"], flame: 0 });
    expect(eating.every(({ holds }) => holds[0] === "spoon" && holds[1] === "pouch")).toBe(true);
    // The spoon comes to the mouth, which opens for it, and goes back to the pouch.
    const nearest = eating.reduce((best, look) => {
      const joints = pose.joints(look);
      return Math.min(best, far(joints.hands[0], joints.mouth));
    }, Infinity);
    expect(nearest).toBeLessThan(26);
    const atTheMouth = eating.find((look) => {
      const joints = pose.joints(look);
      return far(joints.hands[0], joints.mouth) < 26;
    });
    expect(atTheMouth?.mouth).toBeGreaterThan(0.5);
    expect(eating.some(({ mouth }) => mouth === 0)).toBe(true);
  });

  it("tips the bottle and the head back for a drink, and puts the bottle down again", () => {
    const drink = looks("drink", DwellerPose.ONCE.drink ?? 0);
    const middle = drink[Math.floor(drink.length / 2)];
    const joints = pose.joints(middle ?? pose.look("drink", 0));

    expect(middle?.holds[0]).toBe("bottle");
    expect(middle?.tilt).toBeLessThan(-10);
    // The bottle is held by its middle, tipped: its mouth is at the lips.
    const tip = ((middle?.tip ?? 0) * Math.PI) / 180;
    expect(middle?.tip).toBeGreaterThan(100);
    const neck = {
      x: joints.hands[0].x + DwellerPose.BOTTLE_NECK * Math.sin(tip),
      y: joints.hands[0].y - DwellerPose.BOTTLE_NECK * Math.cos(tip),
    };
    expect(far(neck, joints.mouth)).toBeLessThan(24);
    expect(drink[0]?.tip).toBeCloseTo(0, 9);
    expect(drink[0]?.hands[0]).toEqual(drink.at(-1)?.hands[0]);
    expect(drink.at(-1)?.tilt).toBeCloseTo(0, 9);
  });

  it("strums the guitar on the lap with one hand while the other moves along its neck, a foot keeping time", () => {
    const playing = looks("guitar", 8);
    const strum = playing.map(({ hands }) => hands[0].y);
    const frets = playing.map(({ hands }) => hands[1].x);

    expect(playing.every(({ guitar }) => guitar)).toBe(true);
    expect(Math.max(...strum) - Math.min(...strum)).toBeGreaterThan(30);
    expect(Math.max(...frets) - Math.min(...frets)).toBeGreaterThan(30);
    expect(playing.some(({ tap }) => tap > 0.9)).toBe(true);
    expect(playing.some(({ tap }) => tap === 0)).toBe(true);
  });

  it("lies in the bag asleep, the eyes shut, and wakes with a stretch and a yawn", () => {
    const asleep = looks("sleep", 6);
    const waking = looks("wake", DwellerPose.ONCE.wake ?? 0);

    expect(asleep.every(({ lying, eyes }) => lying === 1 && eyes === 0)).toBe(true);
    expect(waking[0]?.lying).toBe(1);
    expect(waking.at(-1)).toMatchObject({ lying: 0, eyes: 1, mouth: 0 });
    expect(Math.min(...waking.map(({ hands }) => hands[0].y))).toBeLessThan(-240);
    expect(Math.max(...waking.map(({ mouth }) => mouth))).toBeGreaterThan(0.9);
  });

  it("comes in from the door on hands and knees and sits up, and goes out the same way back", () => {
    const entering = looks("enter", DwellerPose.ONCE.enter ?? 0);
    const leaving = looks("leave", DwellerPose.ONCE.leave ?? 0);

    expect(entering[0]).toMatchObject({ shift: DwellerPose.FROM_DOOR, shown: 0 });
    expect(entering[0]?.lean).toBeGreaterThan(50);
    expect(entering.at(-1)).toMatchObject({ shift: 0, shown: 1 });
    expect(entering.at(-1)?.lean).toBeCloseTo(4, 6);
    expect(leaving[0]?.shift).toBeCloseTo(0, 6);
    expect(leaving.at(-1)).toMatchObject({ shift: DwellerPose.FROM_DOOR, shown: 0 });
  });

  it("turns to the pack and reaches into it, then sits back where they sat", () => {
    const packing = looks("pack", DwellerPose.ONCE.pack ?? 0);

    expect(packing.some(({ turned, shift }) => turned && shift > DwellerPose.AT_PACK * 0.9)).toBe(
      true,
    );
    expect(packing[0]).toMatchObject({ shift: 0, turned: false });
    expect(packing.at(-1)).toMatchObject({ shift: 0, turned: false });
  });

  it("gives the same pose for the same act and seconds", () => {
    expect(pose.look("guitar", 3.21)).toEqual(pose.look("guitar", 3.21));
    expect(pose.look("cook", 1.5, 0.7)).toEqual(pose.look("cook", 1.5, 0.7));
  });
});
