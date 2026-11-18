import { describe, expect, it } from "vitest";
import { DwellerActs } from "./dweller-acts";
import type { TentWork } from "./dweller-acts";
import { DwellerPose } from "./dweller-pose";
import type { Act } from "./dweller-pose";

const IDLE: TentWork = { chore: null, progress: 0, sleptTo: null };

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

describe("DwellerActs: what the person in the tent is seen doing (#258)", () => {
  it("comes in on hands and knees, then sits", () => {
    const acts = new DwellerActs();

    expect(acts.advance(0, IDLE).act).toBe("enter");
    expect(seen(acts, 3, IDLE)).toEqual(["enter", "idle"]);
  });

  it("shows the chore in hand, how far through it is, and sits again when it's done", () => {
    const acts = new DwellerActs();
    seen(acts, 3, IDLE);

    const melting = acts.advance(0.05, { ...IDLE, chore: "melt", progress: 0.4 });
    expect(melting).toMatchObject({ act: "melt", progress: 0.4 });
    expect(seen(acts, 1, { ...IDLE, chore: "cook", progress: 0.1 })).toEqual(["cook"]);
    expect(seen(acts, 1, { ...IDLE, chore: "guitar" })).toEqual(["guitar"]);
    expect(seen(acts, 1, IDLE)).toEqual(["idle"]);
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
