import { describe, expect, it } from "vitest";

import sherpaTexts from "../../content/sherpa.json";
import coachTexts from "../../content/coach.json";
import type { SherpaView } from "../agents";
import { Climber } from "../physics";
import type { ClimberView, Fall } from "../physics";
import type { CoachTip } from "./coach";
import { SherpaVoice } from "./sherpa-voice";
import type { SherpaTextName, SherpaWorld } from "./sherpa-voice";
import { Texts } from "./texts";

/** A climber standing on the ground, as the physics would show them. */
const standing = (over: Partial<ClimberView> = {}): ClimberView => ({
  x: 0,
  y: 0,
  altitude: 5400,
  falling: false,
  dead: false,
  walking: "stop",
  moving: false,
  exertion: 0,
  first: null,
  second: null,
  firstAt: null,
  secondAt: null,
  jumarHeld: false,
  ladder: null,
  falls: [],
  slipChance: 0,
  hanging: false,
  kit: Climber.CHECKED,
  cramponLoose: false,
  refitting: false,
  hauling: false,
  haulHeld: false,
  onIce: false,
  picks: [],
  pickPoor: false,
  lowering: false,
  gear: Climber.EQUIPPED,
  ...over,
});

/** The climb as a test sets it, frame by frame. */
class FakeWorld implements SherpaWorld {
  view: SherpaView = {
    climber: "pemba",
    doing: "waiting",
    client: null,
    ladder: null,
    restLeft: null,
  };
  pembaView = standing();
  playerView = standing();
  playerAlong = 10;
  pembaAt = 14;
  inPart: string | null = "moraine";
  seracs = false;
  sun = false;
  coach: CoachTip | null = null;

  sherpa(): SherpaView {
    return this.view;
  }
  pemba(): ClimberView {
    return this.pembaView;
  }
  player(): ClimberView {
    return this.playerView;
  }
  along(): number {
    return this.playerAlong;
  }
  pembaAlong(): number {
    return this.pembaAt;
  }
  part(): string | null {
    return this.inPart;
  }
  underSeracs(): boolean {
    return this.seracs;
  }
  firstLight(): boolean {
    return this.sun;
  }
  clock(): string {
    return "03:00";
  }
  tip(): CoachTip | null {
    return this.coach;
  }
}

const FILLS = {
  flow: 1.1,
  minutes: 20,
  least: 8,
  most: 21,
  fallYear: "2012",
  avalancheYear: "2014",
  fieldAltitude: 5700,
  campAltitude: 5880,
};
const english = new Texts<SherpaTextName>(sherpaTexts.en);

/** A voice and its world, and a way to play frames of a sixtieth of a second, saying what was up. */
const listening = () => {
  const world = new FakeWorld();
  const voice = new SherpaVoice(english, FILLS);
  const heard: string[] = [];
  const play = (seconds: number): string | null => {
    let line: string | null = null;
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      const said = voice.line(world, 1 / 60);
      line = said?.name ?? null;
      if (said !== null && heard.at(-1) !== said.name) {
        heard.push(said.name);
      }
    }
    return line;
  };
  return { world, voice, heard, play };
};

describe("SherpaVoice: Pemba's lines, for the moment (#212)", () => {
  it("sets off with the clock's time, then keeps quiet while nothing happens", () => {
    const { voice, world, heard, play } = listening();

    const first = voice.line(world, 1 / 60);
    play(10);

    expect(first).toMatchObject({
      cue: "set-off",
      words: "03:00. Good. The Icefall sleeps while it's cold, so we go now.",
      urgent: false,
    });
    expect(heard).toEqual(["set-off.1"]);
  });

  it("keeps a line up as long as it takes to read: longer for more words, within its least and longest", () => {
    const { play } = listening();

    // The set-off line has 12 words: a glance and 12 words at 2.6 a second, about 5.8 s.
    expect(play(5.5)).toBe("set-off.1");
    expect(play(0.5)).toBeNull();
  });

  it("cuts in at once with a warning the coach shows, unclipped by a crevasse, and lets it be read", () => {
    const { world, heard, play } = listening();
    play(1);

    world.coach = "unclipped";
    const now = play(1 / 60);
    play(2);
    world.coach = null;
    play(6);

    expect(now).toBe("unclipped.1");
    expect(heard).toEqual(["set-off.1", "unclipped.1"]);
  });

  it("says the same warning again only after a while, the next of its lines", () => {
    const { world, heard, play } = listening();
    play(8);
    // Careless at 8 s, again at 17 s, too soon, and again at 36 s.
    for (const seconds of [5, 15, 5]) {
      world.coach = "careless";
      play(4);
      world.coach = null;
      play(seconds);
    }

    expect(heard.filter((name) => name.startsWith("careless"))).toEqual([
      "careless.1",
      "careless.2",
    ]);
  });

  it("names no key nor button, which the coach does: a line says what to do, not what to press", () => {
    const keys = /\b(?:W|S|D|C|E|R|F|Q|T|Z|X|Space|Shift|Tab)\b|\[[^\]]+\]/u;
    const coach = Object.values(coachTexts.en).join(" ");

    for (const language of [sherpaTexts.en, sherpaTexts.ru]) {
      for (const [name, line] of Object.entries(language)) {
        expect(`${name}: ${line}`).not.toMatch(keys);
      }
    }
    expect(coach).toMatch(keys);
  });

  it("is written against Wikipedia's Signs of AI writing: none of its tells, and no line over two short sentences", () => {
    const tells =
      /\b(?:crucial|testament|vibrant|delve|tapestry|pivotal|showcas|underscor|highlighting|journey|navigat|seamless|furthermore|moreover)\w*|not (?:just|only) .+ but|—/iu;

    for (const [name, line] of Object.entries(sherpaTexts.en)) {
      expect(`${name}: ${line}`).not.toMatch(tells);
      expect(line.split(" ").length).toBeLessThanOrEqual(26);
    }
  });

  it("has every line in Russian too, filled in with the same numbers", () => {
    expect(Object.keys(sherpaTexts.ru).sort()).toEqual(Object.keys(sherpaTexts.en).sort());
    for (const [name, line] of Object.entries(sherpaTexts.en)) {
      const russian: string = (sherpaTexts.ru as Readonly<Record<string, string>>)[name] ?? "";
      const fills = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/gu)].map(([, fill]) => fill).sort();
      expect(russian).not.toBe("");
      expect(fills(russian)).toEqual(fills(line));
    }
  });

  it("says a part of the route once, after a quiet moment, and its fact and story after that, with the knowledge base's numbers", () => {
    const { world, heard, play } = listening();
    play(8);

    world.inPart = "popcorn";
    play(1);
    const early = heard.length;
    play(60);
    // Back to the Popcorn a while later: nothing it said there before, again.
    world.inPart = "maze";
    play(1);
    world.inPart = "popcorn";
    play(30);
    const words = heard.map((name) =>
      english.say(name as SherpaTextName, { ...FILLS, time: "03:00" }),
    );

    expect(early).toBe(1);
    expect(heard.slice(1, 4)).toEqual(["popcorn.1", "fact-ladders.1", "story-name.1"]);
    expect(words[2]).toBe(
      "Every spring the Icefall Doctors fix this route. 8 to 21 ladders, depends on the year.",
    );
    expect(heard.filter((name) => name === "popcorn.1")).toHaveLength(1);
  });

  it("tells a joke after a quiet minute, at most one a minute, and never the same one twice", () => {
    const { heard, play } = listening();

    play(5 * 60);
    const jokes = heard.filter((name) => name.startsWith("joke-"));

    expect(jokes).toHaveLength(4);
    expect(new Set(jokes).size).toBe(4);
  });

  it("says what he does: the first ladder he steps onto, the line he holds, and his rest with the player and going on", () => {
    const { world, heard, play } = listening();
    play(8);

    world.pembaView = standing({ ladder: "block" });
    play(4);
    world.pembaView = standing();
    world.view = { ...world.view, doing: "holding", ladder: "block", client: "player" };
    play(5);
    world.view = { ...world.view, doing: "resting", ladder: null, restLeft: 600 };
    play(5);
    world.view = { ...world.view, doing: "leading", client: null, restLeft: null };
    play(5);

    expect(heard).toEqual(["set-off.1", "first-ladder.1", "holding.1", "safe.1", "going-on.1"]);
  });

  it("says so when the player crosses a ladder whose line he holds without a slip, twice a climb at most", () => {
    const { world, heard, play } = listening();
    play(8);
    const crossing = (slip: boolean): void => {
      world.view = { ...world.view, doing: "holding", ladder: "long", client: "player" };
      world.playerView = standing({ ladder: "long" });
      play(slip ? 1 : 3);
      if (slip) {
        world.playerView = standing({ ladder: "long", falling: true, hanging: true });
        play(2);
        world.playerView = standing({ ladder: "long" });
        play(1);
      }
      world.playerView = standing();
      world.view = { ...world.view, doing: "leading", ladder: null, client: null };
      play(25);
    };

    crossing(true);
    crossing(false);
    crossing(false);
    crossing(false);

    expect(heard.filter((name) => name.startsWith("good-crossing"))).toEqual([
      "good-crossing.1",
      "good-crossing.2",
    ]);
  });

  it("says he has the player when they hang near him, to climb when he's far, and counts as he hauls", () => {
    const near = listening();
    near.play(8);
    near.world.playerView = standing({ falling: true, hanging: true });
    near.world.pembaAt = 12;
    near.play(1);
    near.world.pembaView = standing({ hauling: true, haulHeld: true });
    near.play(4);
    const far = listening();
    far.play(8);
    far.world.pembaAt = 40;
    far.world.playerView = standing({ falling: true, hanging: true });
    far.play(1);

    expect(near.heard.slice(1)).toEqual(["rescue-coming.1", "pulling.1"]);
    expect(far.heard.slice(1)).toEqual(["climb-yourself.1"]);
  });

  it("laughs at a slip the rope held, and has nothing to say once he's dead", () => {
    const { world, heard, play } = listening();
    play(8);
    const held: Fall = { step: 9, drop: 2, speed: 3, impact: 0, held: true };

    world.playerView = standing({ falls: [held] });
    play(1);
    world.pembaView = standing({ dead: true });
    world.coach = "unclipped";
    const dead = play(5);

    expect(heard.slice(1)).toEqual(["slip-held.1"]);
    expect(dead).toBeNull();
  });

  it("says the arrival's line for the camp, and his name", () => {
    const { voice } = listening();

    expect(voice.arrival()).toBe("Camp 1. Now the hardest part: sitting and doing nothing.");
    expect(voice.name).toBe("Pemba");
  });
});
