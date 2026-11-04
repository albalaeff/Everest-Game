import { describe, expect, it } from "vitest";

import { Expedition, MountainClock, ObjectiveHazards } from "../simulation";
import type { HazardSettings, HazardZone } from "../simulation";
import { TestGround } from "../simulation/testing/test-ground";
import { HazardNotice } from "./hazard-notice";
import type { HazardTexts } from "./hazard-notice";

/** A serac that cracks on the first step anyone is under it, and comes down five mountain
 * seconds later: ten steps at a ratio of 10. */
const ODDS = { rate: 100_000, warmth: 1, snow: 1, wind: 1, warning: 5 };
const SETTINGS: HazardSettings = {
  kinds: { serac: ODDS, avalanche: ODDS, crevasse: ODDS, cornice: ODDS },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
};
const SERAC: HazardZone = { id: "serac", kind: "serac", from: 20, to: 30 };
const TEXTS: HazardTexts = {
  "warning-serac": "Ice cracks above you. Get clear!",
  "warning-avalanche": "Avalanche!",
  "warning-crevasse": "The snow gives!",
  "warning-cornice": "The cornice cracks!",
};

/** The player under the serac, on the clock and the hazards alone, and the notice over it. */
class UnderTheSerac {
  readonly ground = new TestGround({ player: 25 });
  readonly element = { textContent: "", hidden: true };
  readonly notice: HazardNotice;
  private readonly expedition: Expedition;

  constructor() {
    const clock = new MountainClock(10);
    const hazards = new ObjectiveHazards(SETTINGS, clock, this.ground);
    this.notice = new HazardNotice(this.element, TEXTS, hazards, this.ground, "player");
    this.expedition = Expedition.start(
      {
        seed: 1,
        climbers: ["player"],
        start: {
          [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "14:00" }),
          [ObjectiveHazards.NAME]: ObjectiveHazards.start({ weather: "clear", zones: [SERAC] }),
        },
      },
      [clock, hazards],
    );
  }

  play(steps: number): void {
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance();
    }
    this.notice.frame();
  }
}

describe("HazardNotice", () => {
  it("is hidden while nothing is going over the player", () => {
    const climb = new UnderTheSerac();

    climb.notice.frame();

    expect(climb.element.hidden).toBe(true);
  });

  it("warns the player while the serac over them cracks", () => {
    const climb = new UnderTheSerac();

    climb.play(1);

    expect(climb.element).toEqual({ textContent: TEXTS["warning-serac"], hidden: false });
  });

  it("goes once the player is clear of it, and once it's come down", () => {
    const clear = new UnderTheSerac();
    clear.play(1);
    clear.ground.put("player", 35);
    clear.notice.frame();
    const down = new UnderTheSerac();
    down.play(1);
    down.ground.put("player", 10);
    down.play(10);
    down.ground.put("player", 25);
    down.notice.frame();

    expect(clear.element.hidden).toBe(true);
    expect(down.element.hidden).toBe(true);
  });
});
