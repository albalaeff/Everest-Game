import { describe, expect, it } from "vitest";

import { DwellerHands } from "./dweller-hands";
import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerJoints, DwellerLook, Held, Spot } from "./dweller-pose";
import { TentArt } from "./tent-art";

const pose = new DwellerPose();
const far = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);
/** A turn in degrees, the short way round, as a size. */
const turn = (degrees: number): number => Math.abs(degrees - 360 * Math.round(degrees / 360));
/** How long each act is looked at, in seconds: what plays once to its end, and what goes round a
 * few times round. */
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
const ACTS = Object.keys(SEEN) as Act[];
/** The frames of an act, `rate` a second, each with the second it's at and its joints. */
interface Frame {
  readonly at: number;
  readonly look: DwellerLook;
  readonly joints: DwellerJoints;
}
const frames = (act: Act, rate = 60, seconds = SEEN[act]): Frame[] =>
  Array.from({ length: Math.round(seconds * rate) + 1 }, (_, index) => {
    const look = pose.look(act, index / rate);
    return { at: index / rate, look, joints: pose.joints(look) };
  });
/** Where the working end of what a hand holds is: `reach` from where it's held, the way it's
 * drawn pointing. */
const end = ({ joints }: Frame, side: 0 | 1, reach: number): Spot => {
  const way = DwellerPose.pointing(joints.aims[side]);
  return { x: joints.hands[side].x + way.x * reach, y: joints.hands[side].y + way.y * reach };
};
/** The frames in which the nearer hand holds one of `things`. */
const holding = (all: readonly Frame[], ...things: Held[]): Frame[] =>
  all.filter(({ look }) => things.includes(look.hands[0].holds));
/** The first frame in which the nearer hand holds `thing`, and the last. */
const taken = (all: readonly Frame[], thing: Held): readonly [Frame, Frame] => {
  const held = holding(all, thing);
  const [first, last] = [held[0], held.at(-1)];
  if (first === undefined || last === undefined) {
    throw new Error(`${thing} is never held`);
  }
  return [first, last];
};

describe("DwellerPose: the arms and the hands (#269)", () => {
  it("draws no bone longer than it is, and puts each hand where the pose has it grip", () => {
    for (const act of ACTS) {
      for (const { look, joints } of frames(act, 20)) {
        for (const side of [0, 1] as const) {
          const hand = look.hands[side];
          const upper = far(joints.shoulders[side], joints.elbows[side]);
          const fore = far(joints.elbows[side], joints.wrists[side]);
          // A bone that points toward the viewer is drawn shorter, never longer.
          expect(upper).toBeLessThan(DwellerPose.UPPER_ARM + 1e-6);
          expect(fore).toBeLessThan(DwellerPose.FOREARM + 1e-6);
          const palm = DwellerHands.WRIST[DwellerHands.SHAPES[hand.holds]];
          const away = Math.hypot(far(joints.shoulders[side], hand.at), hand.ahead);
          if (away + palm < DwellerPose.UPPER_ARM + DwellerPose.FOREARM - 1) {
            expect(far(joints.hands[side], hand.at)).toBeLessThan(0.01);
          }
          // A hand set to what it holds is as long as its shape, from the wrist to where it
          // grips; one that lies along its forearm is seen as short as the forearm is.
          const long = far(joints.wrists[side], joints.hands[side]);
          expect(long).toBeLessThan(palm + 1e-6);
          if (hand.firm > 0 && DwellerHands.TURNS[hand.holds] === undefined) {
            expect(long).toBeCloseTo(palm, 6);
          }
        }
      }
    }
  });

  it("bends a wrist no further than a wrist bends, more only as the forearm comes toward the viewer", () => {
    for (const act of ACTS) {
      for (const { joints } of frames(act, 20)) {
        for (const side of [0, 1] as const) {
          const seen = Math.min(
            1,
            far(joints.elbows[side], joints.wrists[side]) / DwellerPose.FOREARM,
          );
          const most = DwellerPose.WRIST_BEND + (1 - seen) * DwellerPose.WRIST_LOOSE;
          // To within a degree: the wrist and the hand settle each other.
          expect(turn(joints.palms[side] - joints.forearms[side])).toBeLessThan(most + 1);
        }
      }
    }
  });

  it("never shows a forearm end on, a sleeve pointing at the viewer", () => {
    for (const act of ACTS) {
      for (const { joints } of frames(act)) {
        for (const side of [0, 1] as const) {
          expect(far(joints.elbows[side], joints.wrists[side])).toBeGreaterThan(
            DwellerPose.FOREARM * 0.3,
          );
        }
      }
    }
  });

  it("moves without a jump from one frame to the next, sixty a second, round and round", () => {
    for (const act of ACTS) {
      const all = frames(act);
      for (let index = 1; index < all.length; index += 1) {
        const [before, now] = [all[index - 1], all[index]];
        if (before === undefined || now === undefined) {
          continue;
        }
        expect(Math.abs(now.look.lean - before.look.lean)).toBeLessThan(3);
        expect(Math.abs(now.look.tilt - before.look.tilt)).toBeLessThan(3);
        for (const side of [0, 1] as const) {
          const moved = (of: (joints: DwellerJoints) => Spot): number =>
            far(of(now.joints), of(before.joints));
          expect(moved(({ hands }) => hands[side])).toBeLessThan(16);
          expect(moved(({ wrists }) => wrists[side])).toBeLessThan(26);
          expect(moved(({ elbows }) => elbows[side])).toBeLessThan(40);
          // A hand turns smoothly while it holds the same thing, and so does the thing.
          if (now.look.hands[side].holds === before.look.hands[side].holds) {
            expect(turn(now.joints.palms[side] - before.joints.palms[side])).toBeLessThan(40);
            expect(turn(now.joints.aims[side] - before.joints.aims[side])).toBeLessThan(40);
          }
        }
      }
    }
  });

  it("holds each thing the way the pose aims it: what the wrist can't turn to, the pose doesn't ask for", () => {
    const things: readonly Held[] = [
      "bottle",
      "spoon",
      "spoonful",
      "stirrer",
      "bar",
      "lighter",
      "lit",
      "pouch",
      "sealed",
      "pot",
      "radio",
      "tracker",
      "meter",
      "watch",
    ];
    for (const act of ACTS) {
      for (const { look, joints } of frames(act, 30)) {
        for (const side of [0, 1] as const) {
          const hand = look.hands[side];
          if (hand.firm >= 1 && things.includes(hand.holds)) {
            expect(turn(joints.aims[side] - hand.aim)).toBeLessThan(12);
          }
        }
      }
    }
  });

  it("lays a hand across a bottle, a pouch and a lighter, and along a spoon and a bar", () => {
    const across = (frame: Frame | undefined, side: 0 | 1): number =>
      frame === undefined ? NaN : turn(frame.joints.palms[side] - frame.joints.aims[side]);
    const at = (act: Act, seconds: number): Frame => {
      const look = pose.look(act, seconds);
      return { at: seconds, look, joints: pose.joints(look) };
    };

    // Square to the thing, give or take what it turns in the fingers.
    expect(across(at("drink", 1.8), 0)).toBeGreaterThan(90 - DwellerHands.CANT.wide - 0.01);
    expect(across(at("drink", 1.8), 0)).toBeLessThan(90 + DwellerHands.CANT.wide + 0.01);
    expect(across(at("eat", 1), 1)).toBeGreaterThan(90 - DwellerHands.CANT.flat - 0.01);
    expect(across(at("light", 1), 0)).toBeGreaterThan(90 - DwellerHands.CANT.tight - 0.01);
    // The fingers run toward the bowl and the bitten end: the hand points the thing's way.
    expect(180 - across(at("eat", 1.9), 0)).toBeLessThan(DwellerHands.CANT.pinch + 0.01);
    expect(180 - across(at("bar", 1), 0)).toBeLessThan(DwellerHands.CANT.pinch + 0.01);
  });

  it("gives the same pose for the same act and seconds", () => {
    expect(pose.look("guitar", 3.21)).toEqual(pose.look("guitar", 3.21));
    expect(pose.look("fill", 2.7)).toEqual(pose.look("fill", 2.7));
    expect(pose.joints(pose.look("pour", 2.2))).toEqual(pose.joints(pose.look("pour", 2.2)));
  });
});

describe("DwellerPose: at the stove (#269)", () => {
  /** Inside the pot: between its walls, below its rim and above its bottom. */
  const inPot = ({ x, y }: Spot): boolean =>
    Math.abs(x - DwellerPose.POT.x) < DwellerPose.POT_INSIDE.half &&
    y > DwellerPose.POT.y &&
    y < DwellerPose.POT.y + DwellerPose.POT_INSIDE.deep;

  it("lights the stove with a lighter held to the burner: a strike, another, and the flame comes up", () => {
    const lighting = frames("light");
    const lit = holding(lighting, "lit");

    expect(lighting[0]?.look.flame).toBe(0);
    expect(lighting.at(-1)?.look.flame).toBe(1);
    // Two strikes, the lighter in the fist between them.
    const strikes = lighting.filter(
      ({ look }, index) =>
        look.hands[0].holds === "lit" && lighting[index - 1]?.look.hands[0].holds !== "lit",
    );
    expect(strikes).toHaveLength(2);
    for (const frame of lit) {
      expect(far(end(frame, 0, DwellerHands.REACH.lighter), DwellerPose.BURNER)).toBeLessThan(22);
    }
    // The stove's flame only comes up once the lighter has been lit at it.
    expect(lighting.find(({ look }) => look.flame > 0)?.at).toBeGreaterThan(lit[0]?.at ?? Infinity);
    expect(lighting.at(-1)?.look.hands[0].holds).toBe("nothing");
  });

  it("stirs the pot with the spoon in the fist, its bowl down in the water, round and round", () => {
    const stirring = holding(frames("melt"), "stirrer");
    const bowls = stirring
      .filter(({ look }) => look.hands[0].firm >= 1)
      .map((frame) => end(frame, 0, DwellerHands.REACH.stirrer));

    expect(bowls.length).toBeGreaterThan(300);
    expect(bowls.every(inPot)).toBe(true);
    expect(
      Math.max(...bowls.map(({ x }) => x)) - Math.min(...bowls.map(({ x }) => x)),
    ).toBeGreaterThan(20);
    // The fist is over the rim, the spoon upright in it.
    for (const { joints, look } of stirring.filter(({ look }) => look.hands[0].firm >= 1)) {
      expect(joints.hands[0].y).toBeLessThan(DwellerPose.POT.y - 8);
      expect(turn(look.hands[0].aim - 180)).toBeLessThan(12);
    }
    expect(stirring.every(({ look }) => look.flame === 1 && look.dips === "pot")).toBe(true);
  });

  it("leaves the spoon standing in the pot where it stirred, takes a lump of snow from the sack and lets it fall into the pot", () => {
    const melting = frames("melt");
    const [first, last] = taken(melting, "snow");
    const falling = melting.filter(({ look }) => look.lump !== null);

    // The spoon is let go where it stands between stirs, and taken up there again.
    const lets = melting.filter(
      ({ look }, index) =>
        look.hands[0].holds !== "stirrer" && melting[index - 1]?.look.hands[0].holds === "stirrer",
    );
    expect(lets.length).toBeGreaterThan(0);
    for (const { joints } of lets) {
      expect(far(joints.hands[0], DwellerPose.SPOON_LEFT.at)).toBeLessThan(6);
    }
    // The lump comes from the snow in the sack, and is let go over the pot.
    expect(far(first.joints.hands[0], DwellerPose.SNOW)).toBeLessThan(26);
    expect(Math.abs(last.joints.hands[0].x - DwellerPose.POT.x)).toBeLessThan(
      DwellerPose.POT_INSIDE.half - 10,
    );
    expect(last.joints.hands[0].y).toBeLessThan(DwellerPose.POT.y);
    expect(falling.length).toBeGreaterThan(10);
    const lumps = falling.map(({ look }) => look.lump ?? { x: 0, y: 0 });
    expect(
      lumps.every(({ x }) => Math.abs(x - DwellerPose.POT.x) < DwellerPose.POT_INSIDE.half),
    ).toBe(true);
    expect(far(lumps[0] ?? DwellerPose.POT, last.joints.hands[0])).toBeLessThan(20);
    expect(lumps.at(-1)?.y).toBeGreaterThan(DwellerPose.POT.y + 20);
  });

  it("takes the bottle from where it stands, pours its water into the pot and stands it back", () => {
    const pouring = frames("pour");
    const [first, last] = taken(pouring, "bottle");
    const running = pouring.filter(({ look }) => look.stream !== null);

    // Upright where the floor's bottle stands, as it's taken and as it's put back.
    for (const frame of [first, last]) {
      expect(far(frame.joints.hands[0], DwellerPose.BOTTLE)).toBeLessThan(2.5);
      expect(turn(frame.joints.aims[0])).toBeLessThan(3);
    }
    expect(running.length).toBeGreaterThan(60);
    for (const frame of running) {
      const mouth = end(frame, 0, DwellerHands.REACH.bottle);
      const [from, to] = frame.look.stream ?? [mouth, mouth];
      // Tipped right over, its mouth over the pot; the water leaves the mouth and lands inside.
      expect(turn(frame.joints.aims[0])).toBeGreaterThan(80);
      expect(Math.abs(mouth.x - DwellerPose.POT.x)).toBeLessThan(DwellerPose.POT_INSIDE.half - 8);
      expect(mouth.y).toBeLessThan(DwellerPose.POT.y - 10);
      expect(far(from, mouth)).toBeLessThan(3);
      expect(inPot(to)).toBe(true);
    }
    expect(pouring.every(({ look }) => look.flame === 1)).toBe(true);
  });

  it("holds both hands out to the flame while the water comes to the boil", () => {
    const warming = frames("boil").filter(({ at }) => at > 1 && at < 2.2);

    for (const { look, joints } of warming) {
      for (const side of [0, 1] as const) {
        expect(look.hands[side].holds).toBe("nothing");
        expect(look.hands[side].firm).toBe(1);
        expect(far(joints.hands[side], DwellerPose.BURNER)).toBeLessThan(125);
        // The fingers point at the stove, to the viewer's left.
        expect(DwellerPose.pointing(look.hands[side].aim).x).toBeLessThan(-0.9);
      }
    }
  });

  it("takes a pouch from the pile and the pot off the stove by its handle, pours the pot's water into the pouch and puts the pot back", () => {
    const filling = frames("fill");
    const [lifted, put] = taken(filling, "pot");
    const pouch = filling.filter(({ look }) => look.hands[1].holds === "pouch");
    const running = filling.filter(({ look }) => look.stream !== null);

    expect(far(pouch[0]?.joints.hands[1] ?? { x: 0, y: 0 }, DwellerPose.MEAL)).toBeLessThan(3);
    for (const frame of [lifted, put]) {
      expect(far(frame.joints.hands[0], DwellerPose.HANDLE)).toBeLessThan(2.5);
      expect(turn(frame.joints.aims[0])).toBeLessThan(1);
    }
    expect(running.length).toBeGreaterThan(30);
    for (const frame of running) {
      const lip = DwellerPose.lip(frame.joints.hands[0], frame.joints.aims[0]);
      const opening = end(frame, 1, DwellerHands.REACH.pouch);
      const [from, to] = frame.look.stream ?? [lip, lip];
      // The pot's lip is over the pouch's opening, and the water falls from the one into the
      // other.
      expect(frame.joints.aims[0]).toBeGreaterThan(50);
      expect(Math.abs(lip.x - opening.x)).toBeLessThan(TentArt.POUCH.width / 2 - 6);
      expect(lip.y).toBeLessThan(opening.y - 8);
      expect(far(from, lip)).toBeLessThan(1);
      expect(far(to, opening)).toBeLessThan(10);
    }
    // The stove is turned off as the pot comes off it.
    expect(lifted.look.flame).toBeLessThan(1);
    expect(filling.at(-1)?.look.flame).toBe(0);
    expect(filling.at(-1)?.look.hands).toMatchObject([{ holds: "nothing" }, { holds: "pouch" }]);
  });

  it("seals the pouch, finger and thumb along its top, and lets it stand", () => {
    const steeping = frames("steep");
    const sealing = holding(steeping, "seal");
    const along = sealing.map(({ joints }) => joints.hands[0]);

    expect(steeping[0]?.look.hands[1].holds).toBe("pouch");
    expect(steeping.at(-1)?.look.hands).toMatchObject([{ holds: "nothing" }, { holds: "sealed" }]);
    // Along the top of the pouch in the other hand, from one side of it to the other.
    for (const frame of sealing) {
      const top = end({ ...frame }, 1, DwellerHands.REACH.pouch + 3);
      expect(far(frame.joints.hands[0], top)).toBeLessThan(TentArt.POUCH.width / 2);
    }
    expect((along.at(-1)?.x ?? 0) - (along[0]?.x ?? 0)).toBeGreaterThan(25);
    expect(steeping.find(({ look }) => look.hands[1].holds === "sealed")?.at).toBeGreaterThan(
      sealing[0]?.at ?? Infinity,
    );
  });

  it("eats from the pouch on the lap: the spoon into it, up to the mouth with its load, and back", () => {
    const eating = frames("eat").filter(({ at }) => at >= 0.5);
    const loaded = holding(eating, "spoonful");
    const bowl = (frame: Frame): Spot => end(frame, 0, DwellerHands.REACH.spoon);
    const opening = (frame: Frame): Spot => end(frame, 1, DwellerHands.REACH.pouch);

    expect(
      eating.every(({ look }) => look.hands[1].holds === "pouch" && look.dips === "pouch"),
    ).toBe(true);
    // Down into the pouch, below its opening and between its sides.
    const deepest = eating.reduce((best, frame) => (bowl(frame).y > bowl(best).y ? frame : best));
    expect(bowl(deepest).y).toBeGreaterThan(opening(deepest).y + 12);
    expect(Math.abs(bowl(deepest).x - opening(deepest).x)).toBeLessThan(
      TentArt.POUCH.width / 2 - 8,
    );
    // Up to the lips, the mouth open for it; and it comes away empty.
    const fed = eating.find(
      (frame) => far(bowl(frame), frame.joints.mouth) < 6 && frame.look.mouth > 0.5,
    );
    expect(fed?.look.hands[0].holds).toBe("spoonful");
    expect(loaded[0]?.at).toBeLessThan(fed?.at ?? 0);
    expect(
      eating.some(({ look, at }) => at > (fed?.at ?? Infinity) && look.hands[0].holds === "spoon"),
    ).toBe(true);
    // The loaded spoon is carried near level, not to spill.
    for (const frame of loaded) {
      expect(turn(frame.joints.aims[0] - 90)).toBeLessThan(60);
    }
    // The mouth shuts on it and chews.
    expect(eating.some(({ look }) => look.mouth === 0)).toBe(true);
  });

  it("runs one part of a chore into the next: each begins as the one before ends, and waits as it ended", () => {
    const parts = ["light", "pour", "boil", "fill", "steep", "eat"] as const;

    parts.slice(0, -1).forEach((part, index) => {
      const ends = pose.look(part, DwellerPose.LASTS[part]);
      const begins = pose.look(parts[index + 1] ?? part, 0);
      expect(ends.lean).toBeCloseTo(begins.lean, 6);
      expect(ends.tilt).toBeCloseTo(begins.tilt, 6);
      ends.hands.forEach(({ at }, side) => {
        expect(far(at, begins.hands[side]?.at ?? { x: NaN, y: NaN })).toBeLessThan(0.01);
      });
      // And after its movement a part holds what it came to.
      const waits = pose.look(part, DwellerPose.LASTS[part] + 4);
      expect(waits.lean).toBeCloseTo(ends.lean, 6);
      expect(waits.hands.map(({ at, holds }) => ({ at, holds }))).toEqual(
        ends.hands.map(({ at, holds }) => ({ at, holds })),
      );
    });
  });
});

describe("DwellerPose: the person in the tent (#258)", () => {
  it("sits still but for the breath, a blink and a glance at the door, the hands open on the knees", () => {
    const sitting = frames("idle", 20);

    expect(sitting.every(({ look }) => look.lying === 0 && look.shown === 1 && !look.guitar)).toBe(
      true,
    );
    expect(sitting.some(({ look }) => look.eyes < 0.3)).toBe(true);
    expect(sitting.filter(({ look }) => look.eyes === 1).length).toBeGreaterThan(200);
    expect(Math.max(...sitting.map(({ look }) => Math.abs(look.tilt)))).toBeGreaterThan(3);
    const lifts = sitting.map(({ joints }) => joints.hands[0].y);
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeLessThan(4);
    expect(sitting.every(({ look }) => look.hands.every(({ holds }) => holds === "nothing"))).toBe(
      true,
    );
    // The elbows out from the body, below the shoulders.
    for (const { joints } of sitting) {
      expect(joints.elbows[0].x).toBeLessThan(joints.shoulders[0].x);
      expect(joints.elbows[1].x).toBeGreaterThan(joints.shoulders[1].x);
      expect(joints.elbows[0].y).toBeGreaterThan(joints.shoulders[0].y);
    }
  });

  it("takes the bottle from the floor for a drink, tips it at the lips with the head back, and stands it back", () => {
    const drinking = frames("drink");
    const [first, last] = taken(drinking, "bottle");
    const mouth = (frame: Frame): Spot => end(frame, 0, DwellerHands.REACH.bottle);
    const sipping = drinking.filter(({ at }) => at > 1.5 && at < 2.3);

    for (const frame of [first, last]) {
      expect(far(frame.joints.hands[0], DwellerPose.BOTTLE)).toBeLessThan(2.5);
      expect(turn(frame.joints.aims[0])).toBeLessThan(3);
    }
    for (const frame of sipping) {
      // The bottle's mouth at the lips, its bottom higher than its mouth, the eyes half shut.
      expect(far(mouth(frame), frame.joints.mouth)).toBeLessThan(4);
      expect(DwellerPose.pointing(frame.joints.aims[0]).y).toBeGreaterThan(0);
      expect(frame.look.tilt).toBeLessThan(-5);
      expect(frame.look.eyes).toBeLessThan(0.5);
      expect(frame.look.mouth).toBeGreaterThan(0.3);
    }
    expect(drinking.every(({ look }) => look.stream === null)).toBe(true);
    expect(drinking[0]?.look.hands[0].at).toEqual(drinking.at(-1)?.look.hands[0].at);
    expect(drinking.at(-1)?.look.tilt).toBeCloseTo(0, 9);
  });

  it("takes a bar from the chest pocket for two bites, chewing between, and puts it back", () => {
    const eating = frames("bar");
    const held = holding(eating, "bar");
    const bitten = (frame: Frame): Spot => end(frame, 0, DwellerHands.REACH.bar);
    const bites = held.filter(
      (frame) => far(bitten(frame), frame.joints.mouth) < 5 && frame.look.mouth > 0.8,
    );

    expect(held.length).toBeGreaterThan(120);
    // Two bites, apart.
    expect(bites.length).toBeGreaterThan(4);
    expect((bites.at(-1)?.at ?? 0) - (bites[0]?.at ?? 0)).toBeGreaterThan(1);
    expect(
      eating.some(({ at, look }) => at > 1.4 && at < 2.2 && look.mouth > 0.2 && look.mouth < 0.4),
    ).toBe(true);
    expect(eating.at(-1)?.look).toMatchObject({ mouth: 0 });
    expect(eating.at(-1)?.look.hands[0].holds).toBe("nothing");
  });

  it("strums the guitar on the lap with one hand while the other moves along its neck, a foot keeping time", () => {
    const playing = frames("guitar", 20);
    const strum = playing.map(({ look }) => look.hands[0].at.y);
    const frets = playing.map(({ look }) => look.hands[1].at.x);

    expect(playing.every(({ look }) => look.guitar)).toBe(true);
    expect(playing.every(({ look }) => look.hands[0].holds === "pick")).toBe(true);
    expect(playing.every(({ look }) => look.hands[1].holds === "neck")).toBe(true);
    expect(Math.max(...strum) - Math.min(...strum)).toBeGreaterThan(30);
    expect(Math.max(...frets) - Math.min(...frets)).toBeGreaterThan(30);
    expect(playing.some(({ look }) => look.tap > 0.9)).toBe(true);
    expect(playing.some(({ look }) => look.tap === 0)).toBe(true);
    // The elbow hangs under the hand on the neck.
    const [first] = playing;
    expect(first?.joints.elbows[1].y).toBeGreaterThan(first?.joints.hands[1].y ?? Infinity);
  });

  it("lies in the bag asleep, the eyes shut, and wakes with a stretch and a yawn", () => {
    const asleep = frames("sleep", 20);
    const waking = frames("wake", 20);

    expect(asleep.every(({ look }) => look.lying === 1 && look.eyes === 0)).toBe(true);
    expect(waking[0]?.look.lying).toBe(1);
    expect(waking.at(-1)?.look).toMatchObject({ lying: 0, eyes: 1, mouth: 0 });
    expect(Math.min(...waking.map(({ look }) => look.hands[0].at.y))).toBeLessThan(-240);
    expect(Math.max(...waking.map(({ look }) => look.mouth))).toBeGreaterThan(0.9);
    // Both elbows out for the stretch.
    const stretching = pose.joints(pose.look("wake", 1.1));
    expect(stretching.elbows[0].x).toBeLessThan(stretching.shoulders[0].x);
    expect(stretching.elbows[1].x).toBeGreaterThan(stretching.shoulders[1].x);
  });

  it("comes in from the door on hands and knees, the palms flat on the mats, and sits up; and goes out the same way back", () => {
    const entering = frames("enter", 20);
    const leaving = frames("leave", 20);

    expect(entering[0]?.look).toMatchObject({ shift: DwellerPose.FROM_DOOR, shown: 0 });
    expect(entering[0]?.look.lean).toBeGreaterThan(50);
    expect(entering.at(-1)?.look).toMatchObject({ shift: 0, shown: 1 });
    expect(entering.at(-1)?.look.lean).toBeCloseTo(4, 6);
    expect(leaving[0]?.look.shift).toBeCloseTo(0, 6);
    expect(leaving.at(-1)?.look).toMatchObject({ shift: DwellerPose.FROM_DOOR, shown: 0 });
    // Crawling, the hands are set down ahead of the wrists, the way they go, never back.
    for (const { joints } of entering.filter(({ at }) => at > 0.3 && at < 0.9)) {
      for (const side of [0, 1] as const) {
        expect(turn(joints.palms[side] - 90)).toBeLessThan(75);
      }
    }
  });

  it("turns to the pack and reaches into it, then sits back where they sat", () => {
    const packing = frames("pack", 20);

    expect(packing.some(({ look }) => look.turned && look.shift > DwellerPose.AT_PACK * 0.9)).toBe(
      true,
    );
    expect(packing[0]?.look).toMatchObject({ shift: 0, turned: false });
    expect(packing.at(-1)?.look).toMatchObject({ shift: 0, turned: false });
  });
});

describe("DwellerPose: the devices (#271)", () => {
  const at = (act: Act, seconds: number): Frame => {
    const look = pose.look(act, seconds);
    return { at: seconds, look, joints: pose.joints(look) };
  };
  /** The first frame of `act` in which hand `side` holds `thing`. */
  const first = (act: Act, side: 0 | 1, thing: Held): Frame => {
    const found = frames(act).find(({ look }) => look.hands[side].holds === thing);
    if (found === undefined) {
      throw new Error(`${thing} is never held in ${act}`);
    }
    return found;
  };
  /** How far apart two frames' arms are, at the most, in pixels. */
  const apart = (one: Frame, other: Frame): number =>
    Math.max(
      ...([0, 1] as const).flatMap((side) => [
        far(one.joints.hands[side], other.joints.hands[side]),
        far(one.joints.elbows[side], other.joints.elbows[side]),
      ]),
      far(one.joints.head, other.joints.head),
    );
  const DEVICES = [
    ["radio", "radio"],
    ["watch", "watch"],
    ["meter", "meter"],
    ["tracker", "tracker"],
  ] as const;

  it("takes the radio from where it lies on the pad, the hand along it, turns it upright and holds it by the shoulder, the eyes on it", () => {
    const taken = first("radio-out", 1, "radio");
    expect(far(taken.joints.hands[1], DwellerPose.RADIO)).toBeLessThan(2.5);
    expect(turn(taken.joints.aims[1] - DwellerPose.RADIO_LIES)).toBeLessThan(3);

    const held = at("radio", 2);
    expect(held.look.hands[1].holds).toBe("radio");
    expect(held.joints.hands[1].y).toBeLessThan(held.joints.shoulders[1].y);
    expect(held.joints.hands[1].x).toBeGreaterThan(held.joints.shoulders[1].x - 20);
    expect(turn(held.joints.aims[1])).toBeLessThan(20);
    expect(held.look.gaze.x).toBeGreaterThan(0.3);
    expect(held.look.hands[0].holds).toBe("nothing");
  });

  it("talks into the radio: its top to the lips, the mouth moving with the words, and back to the shoulder", () => {
    const reach = DwellerHands.REACH.radio;
    const spoken = at("radio-talk", 0.8);
    expect(far(end(spoken, 1, reach), spoken.joints.mouth)).toBeLessThan(14);
    const mouths = frames("radio-talk").map(({ look }) => look.mouth);
    expect(Math.max(...mouths)).toBeGreaterThan(0.3);
    expect(mouths[0]).toBe(0);
    expect(mouths.at(-1)).toBe(0);

    expect(apart(at("radio-talk", 0), at("radio", 0))).toBeLessThan(1.5);
    expect(apart(at("radio-talk", 1.7), at("radio", 0))).toBeLessThan(1.5);
  });

  it("turns the wrist up for the watch, across the chest, the head down to it, and the other hand's finger presses its button", () => {
    const held = at("watch", 2);
    const [left, right] = held.joints.shoulders;
    expect(held.look.hands[1].holds).toBe("watch");
    expect(held.joints.hands[1].x).toBeGreaterThan(left.x);
    expect(held.joints.hands[1].x).toBeLessThan(right.x);
    expect(held.joints.hands[1].y).toBeLessThan(-80);
    expect(held.look.tilt).toBeGreaterThan(10);
    expect(held.look.gaze.y).toBeGreaterThan(0.8);

    const pressing = at("watch-out", 0.95);
    expect(far(pressing.joints.hands[0], held.joints.wrists[1])).toBeLessThan(40);
    expect(far(at("watch-out", 1.6).joints.hands[0], at("idle", 0).joints.hands[0])).toBeLessThan(
      2,
    );
  });

  it("takes the weather meter from the chest pocket and holds it out toward the door, which is open for it", () => {
    const taken = first("meter-out", 0, "meter");
    expect(far(taken.joints.hands[0], DwellerPose.CHEST_POCKET)).toBeLessThan(2.5);
    expect(turn(taken.joints.aims[0])).toBeLessThan(12);
    expect(taken.look.door ?? false).toBe(false);

    const held = at("meter", 2);
    expect(held.look.hands[0].holds).toBe("meter");
    expect(held.joints.hands[0].x).toBeLessThan(-230);
    expect(held.joints.hands[0].y).toBeLessThan(held.joints.shoulders[0].y);
    expect(held.look.lean).toBeGreaterThan(15);
    expect(held.look.door).toBe(true);
    expect(held.look.gaze.x).toBeLessThan(-0.8);
  });

  it("takes the tracker from the pocket on the wall and holds it over the lap, the other hand's thumb on its keys, the head down to it", () => {
    const taken = first("tracker-out", 0, "tracker");
    expect(far(taken.joints.hands[0], DwellerPose.TRACKER)).toBeLessThan(2.5);
    expect(turn(taken.joints.aims[0])).toBeLessThan(3);

    const held = at("tracker", 2);
    expect(held.look.hands[0].holds).toBe("tracker");
    expect(far(held.joints.hands[0], held.joints.hands[1])).toBeLessThan(40);
    expect(held.joints.hands[0].y).toBeGreaterThan(held.joints.shoulders[0].y);
    expect(held.look.tilt).toBeGreaterThan(10);
    const taps = frames("tracker").map(({ joints }) => joints.hands[1].y);
    expect(Math.max(...taps) - Math.min(...taps)).toBeGreaterThan(2);
  });

  it.each(DEVICES)("holds the %s as it was when it came out, with no jump", (device) => {
    expect(apart(at(`${device}-out`, SEEN[`${device}-out`]), at(device, 0))).toBeLessThan(1.5);
  });

  it.each(DEVICES)("puts the %s back the way it came, and sits as before", (device, thing) => {
    const back = frames(`${device}-away`);
    const [begins, ends] = [back[0], back.at(-1)];
    if (begins === undefined || ends === undefined) {
      throw new Error("no frames");
    }
    expect(apart(begins, at(device, 0))).toBeLessThan(1.5);
    expect(apart(ends, at(`${device}-out`, 0))).toBeLessThan(1.5);
    for (const side of [0, 1] as const) {
      expect(far(ends.joints.hands[side], at("idle", 0).joints.hands[side])).toBeLessThan(2);
      expect(ends.look.hands[side].holds === thing && thing !== "watch").toBe(false);
    }
  });

  it("names the device each of the climber's is in the tent", () => {
    expect(DwellerPose.DEVICES).toEqual({
      radio: "radio",
      gps: "watch",
      wind: "meter",
      tracker: "tracker",
    });
  });
});
