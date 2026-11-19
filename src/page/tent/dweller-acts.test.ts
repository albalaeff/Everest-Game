import { describe, expect, it } from "vitest";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { KnowledgeBase } from "../../content/knowledge-base";
import { TentFacts } from "../../content/tent-facts";
import { DwellerActs } from "./dweller-acts";
import type { TentWork } from "./dweller-acts";
import { DwellerPose } from "./dweller-pose";
import type { Act } from "./dweller-pose";

const IDLE: TentWork = { chore: null, progress: 0, sleptTo: null, device: null };

/** The acts seen over `seconds` of frames, a twentieth of a second each, with no repeats. */
function seen(acts: DwellerActs, seconds: number, work: TentWork): Act[] {
  const shown: Act[] = [];
  for (let frame = 0; frame < seconds * 20; frame += 1) {
    const { act } = acts.advance(0.05, work);
    if (shown.at(-1) !== act) {
      shown.push(act);
    }
  }
  return shown;
}

describe("DwellerActs: what the person in the tent is seen doing (#258, #269)", () => {
  it("comes in on hands and knees, then sits", () => {
    const acts = new DwellerActs();

    expect(acts.advance(0, IDLE).act).toBe("enter");
    expect(seen(acts, 3, IDLE)).toEqual(["enter", "idle"]);
  });

  it("shows the chore in hand, and sits again when it's done", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);

    expect(acts.advance(0.05, { ...IDLE, chore: "melt", progress: 0.4 }).act).toBe("melt");
    expect(seen(acts, 1, { ...IDLE, chore: "guitar" })).toEqual(["guitar"]);
    expect(seen(acts, 1, IDLE)).toEqual(["idle"]);
  });

  it("shows a chore at the stove in its parts, each begun as the chore gets so far (#269)", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);
    const at = (chore: "melt" | "cook", progress: number): Act =>
      acts.advance(0.05, { ...IDLE, chore, progress }).act;

    // Melting snow, the stove is lit first.
    expect(at("melt", 0.02)).toBe("light");
    expect(at("melt", 0.2)).toBe("melt");
    expect(at("melt", 0.98)).toBe("melt");
    expect(seen(acts, 1, IDLE)).toEqual(["idle"]);
    // Cooking: lit, the water poured, brought to the boil, the pouch filled, left to stand, eaten.
    expect([0.02, 0.15, 0.35, 0.5, 0.7, 0.9].map((progress) => at("cook", progress))).toEqual([
      "light",
      "pour",
      "boil",
      "fill",
      "steep",
      "eat",
    ]);
  });

  it("begins each part of a chore at its own start, and gives its movement the time it takes", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);
    const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
    const { numbers } = new TentFacts(knowledge);
    const pace = knowledge.number("time.compression");

    expect(acts.advance(1, { ...IDLE, chore: "cook", progress: 0.02 })).toEqual({
      act: "light",
      seconds: 0,
    });
    expect(acts.advance(1, { ...IDLE, chore: "cook", progress: 0.05 })).toEqual({
      act: "light",
      seconds: 1,
    });
    expect(acts.advance(0.5, { ...IDLE, chore: "cook", progress: 0.15 })).toEqual({
      act: "pour",
      seconds: 0,
    });
    // Each part is seen to its end before the next begins: played at its own pace where its
    // share of the chore is as long as its movement, and quicker where it's shorter, at the
    // mountain's pace (#278), but never more than twice as quick.
    for (const [chore, seconds] of [
      ["melt", numbers.melt.seconds / pace],
      ["cook", numbers.meal.seconds / pace],
    ] as const) {
      const parts = DwellerActs.PARTS[chore];
      const playing = new DwellerActs();
      seen(playing, 3, IDLE);
      const reached = new Map<Act, number>();
      for (let frame = 0; frame <= seconds * 60; frame += 1) {
        const progress = Math.min(1, frame / 60 / seconds);
        const { act, seconds: at } = playing.advance(1 / 60, {
          ...IDLE,
          chore,
          progress,
          lasts: seconds,
        });
        reached.set(act, Math.max(reached.get(act) ?? 0, at));
      }
      parts.forEach(([from, act], index) => {
        const until = parts[index + 1]?.[0] ?? 1;
        const lasts = DwellerPose.LASTS[act as keyof typeof DwellerPose.LASTS];
        expect(reached.get(act) ?? 0).toBeGreaterThanOrEqual(lasts - 0.05);
        expect(lasts / ((until - from) * seconds)).toBeLessThanOrEqual(2);
      });
      expect(parts[0]?.[0]).toBe(0);
    }
  });

  it("plays a drink once over a chore, and goes back to it", () => {
    const acts = new DwellerActs();
    const melting: TentWork = { ...IDLE, chore: "melt", progress: 0.2 };
    seen(acts, 3, melting);

    acts.play("drink");
    acts.play("drink");

    expect(seen(acts, 5, melting)).toEqual(["drink", "melt"]);
  });

  it("lies down for a sleep, sleeps while it lasts, and wakes with a stretch", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);

    expect(seen(acts, 6, { ...IDLE, chore: "sleep", progress: 0.1 })).toEqual(["lie", "sleep"]);
    expect(acts.asleep).toBe(true);
    acts.play("drink");
    expect(seen(acts, 4, { ...IDLE, sleptTo: 7200 })).toEqual(["wake", "idle"]);
    expect(acts.asleep).toBe(false);
  });

  it("shows a night the clock skipped: down, a moment asleep, and up", () => {
    const acts = new DwellerActs(3600);
    seen(acts, 3, { ...IDLE, sleptTo: 3600 });

    const night = seen(acts, 8, { ...IDLE, sleptTo: 90_000 });

    expect(night).toEqual(["lie", "sleep", "wake", "idle"]);
  });

  it("takes as long asleep as a dream at the least", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);
    acts.advance(0.05, { ...IDLE, sleptTo: 500 });
    const lie = DwellerPose.ONCE.lie ?? 0;

    expect(seen(acts, lie + DwellerActs.DREAM - 0.2, { ...IDLE, sleptTo: 500 }).at(-1)).toBe(
      "sleep",
    );
    expect(seen(acts, 0.5, { ...IDLE, sleptTo: 500 }).at(-1)).toBe("wake");
  });

  it("crawls to the door on the way out, from a chore too, and is gone", () => {
    const acts = new DwellerActs();
    seen(acts, 3, { ...IDLE, chore: "guitar" });

    acts.leave();
    acts.play("bar");

    expect(acts.gone).toBe(false);
    expect(seen(acts, 2, IDLE)).toEqual(["leave"]);
    expect(acts.gone).toBe(true);
  });
});

describe("DwellerActs: a device in the tent (#271)", () => {
  const settled = (): DwellerActs => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);
    return acts;
  };
  const holding = (device: TentWork["device"]): TentWork => ({ ...IDLE, device });

  it("takes the device the card shows from where it's kept, and holds it", () => {
    const acts = settled();

    expect(seen(acts, 3, holding("radio"))).toEqual(["radio-out", "radio"]);
    expect(acts.holding).toBe("radio");
  });

  it("shows each of the climber's devices as the person has it in the tent", () => {
    for (const [device, act] of [
      ["gps", "watch"],
      ["wind", "meter"],
      ["tracker", "tracker"],
    ] as const) {
      expect(seen(settled(), 3, holding(device))).toEqual([`${act}-out`, act]);
    }
  });

  it("puts it back when the card closes, and sits", () => {
    const acts = settled();
    seen(acts, 3, holding("tracker"));

    expect(seen(acts, 3, IDLE)).toEqual(["tracker-away", "idle"]);
    expect(acts.holding).toBeNull();
  });

  it("puts one back before it takes another", () => {
    const acts = settled();
    seen(acts, 3, holding("radio"));

    expect(seen(acts, 5, holding("wind"))).toEqual(["radio-away", "meter-out", "meter"]);
  });

  it("talks into the radio once for a phrase, and listens again; not into anything else", () => {
    const acts = settled();
    seen(acts, 3, holding("radio"));
    acts.talk();

    expect(seen(acts, 3, holding("radio"))).toEqual(["radio-talk", "radio"]);

    seen(acts, 5, holding("gps"));
    acts.talk();
    expect(seen(acts, 3, holding("gps"))).toEqual(["watch"]);
  });

  it("says a phrase pressed while the radio is on its way out once it's in the hand", () => {
    const acts = settled();
    acts.advance(0.05, holding("radio"));
    acts.talk();

    expect(seen(acts, 4, holding("radio"))).toEqual(["radio-out", "radio-talk", "radio"]);
  });

  it("puts the device down for a drink, and takes it up again after", () => {
    const acts = settled();
    seen(acts, 3, holding("radio"));
    acts.play("drink");

    expect(seen(acts, 8, holding("radio"))).toEqual(["radio-away", "drink", "radio-out", "radio"]);
  });

  it("holds a device over a chore at the stove, and goes back to the chore", () => {
    const acts = settled();
    const cooking: TentWork = { ...IDLE, chore: "cook", progress: 0.35 };
    seen(acts, 1, cooking);

    expect(seen(acts, 3, { ...cooking, device: "radio" })).toEqual(["radio-out", "radio"]);
    expect(seen(acts, 3, cooking)).toEqual(["radio-away", "boil"]);
  });

  it("puts it back before lying down to sleep, and takes none while asleep", () => {
    const acts = settled();
    seen(acts, 3, holding("radio"));
    const asleep: TentWork = { ...IDLE, chore: "sleep", device: "radio" };

    expect(seen(acts, 5, asleep)).toEqual(["radio-away", "lie", "sleep"]);
    expect(acts.holding).toBeNull();
  });

  it("leaves with it put away: straight to the door", () => {
    const acts = settled();
    seen(acts, 3, holding("wind"));
    acts.leave();

    expect(seen(acts, 2, IDLE)).toEqual(["leave"]);
    expect(acts.holding).toBeNull();
  });
});
