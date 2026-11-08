import { describe, expect, it } from "vitest";

import debriefTexts from "../../content/debrief.json";
import type { Fall, LogPage } from "../physics";
import type { Strike } from "../simulation";
import { Debrief } from "./debrief";
import type { DebriefFacts } from "./debrief";
import { Texts } from "./texts";

const HOUR = 3600;
const debrief = new Debrief(new Texts(debriefTexts.en), { from: 6, peak: 14, until: 20 });

/** A page of the logbook: a clean climb out of the Icefall at 05:30, unless it says otherwise. */
const page = (over: Partial<LogPage> = {}): LogPage => ({
  id: "player",
  unclipped: 0,
  exposed: 0,
  underSeracs: 0,
  stopped: 0,
  arrived: 5.5 * HOUR,
  died: null,
  ...over,
});

const facts = (over: Partial<DebriefFacts> = {}): DebriefFacts => ({
  page: page(),
  falls: [],
  strikes: [],
  player: "player",
  ...over,
});

const held = (drop: number): Fall => ({ step: 1, drop, speed: 3, impact: 1, held: true });
const unheld = (drop: number, impact: number): Fall => ({
  step: 2,
  drop,
  speed: impact,
  impact,
  held: false,
});

/** The value the debrief gives a line, by its label's text. */
const value = (said: ReturnType<Debrief["of"]>, label: string): string | undefined =>
  said.lines.find((line) => line.label === label)?.value;

describe("Debrief: what the climb was, after it (#194)", () => {
  it("calls a climb clipped in wherever it mattered clean, out before the sun", () => {
    const said = debrief.of(facts({ page: page({ unclipped: 600 }) }));

    expect(said.verdict.tone).toBe("good");
    expect(said.verdict.text).toContain("clean");
    expect(value(said, "Out of the Icefall")).toBe("05:30, before the sun was on the ice");
    expect(value(said, "Unclipped on the route")).toBe("10 min");
    expect(value(said, "Unclipped where a slip was a fall")).toBe("none");
  });

  it("counts the falls the rope caught, and says it saved them", () => {
    const said = debrief.of(facts({ falls: [held(2), held(4)] }));

    expect(said.verdict.tone).toBe("good");
    expect(said.verdict.text).toContain("2 times");
    expect(value(said, "Times the rope caught you")).toBe("2");
  });

  it("tells a climber who was unclipped where a slip was a fall that they were lucky", () => {
    const said = debrief.of(facts({ page: page({ unclipped: 900, exposed: 150 }) }));

    expect(said.verdict.tone).toBe("warn");
    expect(said.verdict.text).toContain("2 min");
    expect(
      said.lines.find(({ label }) => label === "Unclipped where a slip was a fall"),
    ).toMatchObject({ value: "2 min", tone: "bad" });
  });

  it("tells a climber out after the sun that they were late, and how long they stood under the seracs", () => {
    const said = debrief.of(
      facts({ page: page({ arrived: 9 * HOUR, underSeracs: 1800, stopped: 45 }) }),
    );

    expect(said.verdict.tone).toBe("warn");
    expect(value(said, "Out of the Icefall")).toBe("09:00, with the sun on the ice");
    expect(value(said, "Under the seracs")).toBe("30 min");
    expect(said.lines.find(({ label }) => label === "Of it, standing still")).toMatchObject({
      value: "under a minute",
      tone: "bad",
    });
  });

  it("names a serac that killed the climber, and the hour", () => {
    const strike: Strike = {
      zone: "seracs",
      kind: "serac",
      step: 9,
      timeOfDay: 4 * HOUR,
      climbers: ["player"],
      killed: ["player"],
    };
    const said = debrief.of(
      facts({ page: page({ arrived: null, died: 4 * HOUR }), strikes: [strike] }),
    );

    expect(said.dead).toBe(true);
    expect(said.verdict.tone).toBe("bad");
    expect(said.verdict.text).toContain("serac");
    expect(value(said, "Died at")).toBe("04:00");
    expect(value(said, "Ice and snow that came down near you")).toBe("1");
  });

  it("says how far an unroped fall was, when a fall killed the climber", () => {
    const said = debrief.of(
      facts({
        page: page({ arrived: null, died: 5 * HOUR, exposed: 30 }),
        falls: [unheld(26.4, 22)],
      }),
    );

    expect(said.verdict.tone).toBe("bad");
    expect(said.verdict.text).toContain("26 m");
    expect(value(said, "Falls with no rope to hold you")).toBe("1");
  });

  it("writes hours as hours and minutes", () => {
    const said = debrief.of(facts({ page: page({ unclipped: 2 * HOUR + 5 * 60 }) }));

    expect(value(said, "Unclipped on the route")).toBe("2 h 5 min");
  });
});
