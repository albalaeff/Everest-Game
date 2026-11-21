import { describe, expect, it } from "vitest";

import sherpaTexts from "../../content/sherpa.json";
import coachTexts from "../../content/coach.json";
import type { SherpaView } from "../agents";
import { Climber } from "../physics";
import type { ClimberView, Fall } from "../physics";
import type { HazardWeather } from "../simulation";
import type { CoachTip } from "./coach";
import { SherpaVoice } from "./sherpa-voice";
import type { SherpaLine, SherpaTextName, SherpaWorld } from "./sherpa-voice";
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
  clipping: null,
  stillChance: 0,
  heldBack: null,
  facing: 1,
  towardViewer: false,
  injuries: [],
  down: false,
  carriedBy: null,
  carrying: null,
  onLine: null,
  hauled: false,
  helping: null,
  sheltered: false,
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
  due: "tourniquet" | "splint" | "wrap" | null = null;
  weather: HazardWeather = "clear";

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
  aidDue(): "tourniquet" | "splint" | "wrap" | null {
    return this.due;
  }
  sky(): HazardWeather {
    return this.weather;
  }

  tip(): CoachTip | null {
    return this.coach;
  }
}

const FILLS = {
  flow: 1.1,
  least: 8,
  most: 21,
  fallYear: "2012",
  avalancheYear: "2014",
  stormYear: "1996",
  quakeYear: "2015",
  fieldAltitude: 5700,
  campAltitude: 5880,
  camp2Altitude: 6400,
  water: 3.3,
  clientLeast: 6,
  clientMost: 8,
  crossLeast: 30,
  crossMost: 40,
  firstYear: "1953",
  firstTime: "11:30",
  kamiRita: 32,
  lhakpa: 11,
  babuHours: 21,
};
const english = new Texts<SherpaTextName>(sherpaTexts.en);

/** A line's cue: its name without its variant's number. */
const cueOf = (name: string): string => name.slice(0, name.lastIndexOf("."));

/** A cue's lines, in their file's order. */
const linesOf = (cue: string): readonly string[] =>
  english.names.filter((name) => cueOf(name) === cue);

/** A voice and its world on a climb's seed, and a way to play frames of a sixtieth of a second,
 * saying what was up: the lines said, their names and their cues. */
const listening = (seed = 1) => {
  const world = new FakeWorld();
  const voice = new SherpaVoice(english, FILLS, seed);
  const said: SherpaLine[] = [];
  const heard: string[] = [];
  const play = (seconds: number): string | null => {
    let line: string | null = null;
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      const up = voice.line(world, 1 / 60);
      line = up?.name ?? null;
      if (up !== null && said.at(-1) !== up) {
        said.push(up);
        heard.push(up.name);
      }
    }
    return line;
  };
  const cues = (): string[] => heard.map(cueOf);
  return { world, voice, said, heard, cues, play };
};

/** The parts of the route he has lines for, in the order a climb goes through them. */
const PARTS = ["popcorn", "maze", "football-field", "upper-icefall", "western-cwm"];

/** A climb on `seed`: a minute in each part of the route, and what he said. */
const climbing = (seed: number): readonly SherpaLine[] => {
  const { world, said, play } = listening(seed);
  play(8);
  for (const part of PARTS) {
    world.inPart = part;
    play(60);
  }
  return said;
};

describe("SherpaVoice: Pemba's lines, for the moment (#212)", () => {
  it("sets off with the clock's time, then keeps quiet while nothing happens", () => {
    const { voice, world, cues, play } = listening();

    const first = voice.line(world, 1 / 60);
    play(10);

    expect(first).toMatchObject({ cue: "set-off", urgent: false });
    expect(first?.words).toMatch(/^03:00\. .*\bcold\b/u);
    expect(cues()).toEqual(["set-off"]);
  });

  it("keeps a line up as long as it takes to read: a glance, and its words at a reading pace", () => {
    const { voice, world, play } = listening();

    const first = voice.line(world, 1 / 60);
    // The set-off line: a glance of 1.2 s and its words at 2.6 a second, about 6 s.
    const reading = 1.2 + (first?.words.split(" ").length ?? 0) / 2.6;

    expect(play(reading - 0.3)).toBe(first?.name);
    expect(play(0.6)).toBeNull();
  });

  it("cuts in at once with a warning the coach shows, unclipped by a crevasse, and lets it be read", () => {
    const { world, cues, play } = listening();
    play(1);

    world.coach = "unclipped";
    const now = play(1 / 60);
    play(2);
    world.coach = null;
    play(6);

    expect(cueOf(now ?? "")).toBe("unclipped");
    expect(cues()).toEqual(["set-off", "unclipped"]);
  });

  it("cuts in when a gust is coming and when the player's ladder twists, and as he goes past them on the rope (#197)", () => {
    const { world, cues, play } = listening();
    play(8);

    world.coach = "gust";
    play(4);
    world.coach = "ladder-twist";
    play(4);
    world.coach = null;
    world.view = { ...world.view, doing: "passing" };
    play(4);

    expect(cues()).toEqual(["set-off", "gust", "twist", "passing"]);
  });

  it("says the weather as it comes: cloud, snow, a storm at once, and the sky clearing (#272)", () => {
    const { world, cues, play } = listening();
    play(8);

    world.weather = "cloud";
    play(12);
    world.weather = "snow";
    play(12);
    world.weather = "storm";
    play(2);
    expect(cues().at(-1)).toBe("weather-storm");
    play(10);
    world.weather = "clear";
    play(12);

    expect(cues()).toEqual([
      "set-off",
      "weather-cloud",
      "weather-snow",
      "weather-storm",
      "weather-clearing",
    ]);
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
    const careless = heard.filter((name) => cueOf(name) === "careless");
    const lines = linesOf("careless");
    const first = lines.indexOf(careless[0] ?? "");

    expect(careless).toEqual([lines[first], lines[(first + 1) % lines.length]]);
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

  it("says a part of the route once, after a quiet moment, then two of its facts and stories", () => {
    const { world, cues, play } = listening();
    play(8);

    world.inPart = "popcorn";
    play(1);
    const early = cues().length;
    play(60);
    // Back to the Popcorn a while later: nothing it said there before, again.
    world.inPart = "maze";
    play(1);
    world.inPart = "popcorn";
    play(30);
    const told = cues().slice(2, 4);

    expect(early).toBe(1);
    expect(cues()[1]).toBe("popcorn");
    expect(told.filter((cue) => /^(?:fact|story)-/u.test(cue))).toHaveLength(2);
    expect(new Set(cues()).size).toBe(cues().length);
  });

  it("fills his facts with the numbers the page hands him, on any climb", () => {
    const said = [1, 2, 3, 4, 5, 6].flatMap(climbing);

    expect(said.filter(({ words }) => words.includes("{"))).toEqual([]);
    expect(said.find(({ cue }) => cue === "fact-ladders")?.words).toBe(
      "Every spring the Icefall Doctors fix this route. 8 to 21 ladders, depends on the year.",
    );
  });

  it("picks by the climb's seed which facts and stories he tells, and which lines come first: two climbs don't sound alike, one seed sounds the same (#218)", () => {
    const climbs = [1, 2, 3, 4, 5, 6].map((seed) => climbing(seed).map(({ name }) => name));
    const stories = climbs.map((names) =>
      names.filter((name) => /^(?:fact|story)-/u.test(name)).join(),
    );

    expect(climbing(1).map(({ name }) => name)).toEqual(climbs[0]);
    expect(new Set(stories).size).toBe(climbs.length);
    expect(new Set(climbs.map(([first]) => first)).size).toBeGreaterThan(1);
  });

  it("tells a joke after a quiet minute, at most one a minute, and never the same one twice", () => {
    const { cues, play } = listening();

    play(5 * 60);
    const jokes = cues().filter((cue) => cue.startsWith("joke-"));

    expect(jokes).toHaveLength(4);
    expect(new Set(jokes).size).toBe(4);
  });

  it("starts his jokes somewhere else on another climb", () => {
    const firsts = [1, 2, 3, 4, 5, 6].map((seed) => {
      const { cues, play } = listening(seed);
      play(70);
      return cues().find((cue) => cue.startsWith("joke-"));
    });

    expect(new Set(firsts).size).toBeGreaterThan(2);
  });

  it("says what he does: the first ladder he steps onto, the line he holds, and his rest with the player and going on", () => {
    const { world, cues, play } = listening();
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

    expect(cues()).toEqual(["set-off", "first-ladder", "holding", "safe", "going-on"]);
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

    const good = heard.filter((name) => cueOf(name) === "good-crossing");

    expect(good).toHaveLength(2);
    expect(new Set(good).size).toBe(2);
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

    expect(near.cues().slice(1)).toEqual(["rescue-coming", "pulling"]);
    expect(far.cues().slice(1)).toEqual(["climb-yourself"]);
  });

  it("says a fallen ladder is theirs to haul back, pulls with the player, and says when it's lashed again (#228)", () => {
    const { world, cues, play } = listening();
    play(8);

    world.coach = "ladder-broken";
    world.view = { ...world.view, doing: "raising" };
    play(8);
    world.pembaView = standing({ hauling: true, haulHeld: true });
    play(8);
    world.coach = null;
    world.view = { ...world.view, doing: "leading" };
    world.pembaView = standing();
    play(8);

    expect(cues().slice(1)).toEqual(["broken", "raising", "set-back"]);
  });

  it("tells no story while he hauls a fallen ladder back up, and says it's lashed the moment it is (#244)", () => {
    const { world, cues, play } = listening();
    play(8);
    // In the Maze, its line said and read, its facts and stories still to tell.
    world.inPart = "maze";
    play(14);
    world.view = { ...world.view, doing: "raising" };
    world.pembaView = standing({ hauling: true, haulHeld: true });
    play(11);
    world.view = { ...world.view, doing: "leading" };
    world.pembaView = standing();
    const lashed = play(0.1);
    play(20);

    expect(cues().slice(1, 4)).toEqual(["maze", "raising", "set-back"]);
    expect(cueOf(lashed ?? "")).toBe("set-back");
    // The Maze's stories wait for a quiet moment once he's done, and come then.
    expect(
      cues()
        .slice(4)
        .some((cue) => /^(?:fact|story)-/u.test(cue)),
    ).toBe(true);
  });

  it("says no place's line while the player hangs on the rope and he goes to them, but once they rest (#244)", () => {
    const { world, cues, play } = listening();
    play(8);

    world.inPart = "maze";
    world.playerView = standing({ falling: true, hanging: true });
    world.pembaAt = 12;
    world.view = { ...world.view, doing: "rescuing", client: "player" };
    play(20);
    const hanging = cues().slice(1);
    world.playerView = standing();
    world.view = { ...world.view, doing: "resting", restLeft: 600 };
    play(20);

    expect(hanging).toEqual(["rescue-coming"]);
    expect(cues().slice(2, 4)).toEqual(["safe", "maze"]);
  });

  it("says the ladder's lashed once the warning up is read, however long it takes to read (#244)", () => {
    const { world, cues, play } = listening();
    play(8);
    world.view = { ...world.view, doing: "raising" };
    world.pembaView = standing({ hauling: true, haulHeld: true });
    play(10);

    // The player's lamp dies as the ladder comes back: both its lines take over 4 s to read.
    world.coach = "lamp";
    play(1 / 60);
    world.view = { ...world.view, doing: "leading" };
    world.pembaView = standing();
    play(12);

    expect(cues().slice(1)).toEqual(["raising", "lamp", "set-back"]);
  });

  it("says nothing of a ladder set back when he stopped holding its rope before anyone hauled (#228)", () => {
    const { world, cues, play } = listening();
    play(8);

    world.view = { ...world.view, doing: "raising" };
    play(4);
    world.view = { ...world.view, doing: "waiting" };
    play(8);

    expect(cues()).not.toContain("set-back");
  });

  it("laughs at a slip the rope held, and has nothing to say once he's dead", () => {
    const { world, cues, play } = listening();
    play(8);
    const held: Fall = { step: 9, drop: 2, speed: 3, impact: 0, held: true };

    world.playerView = standing({ falls: [held] });
    play(1);
    world.pembaView = standing({ dead: true });
    world.coach = "unclipped";
    const dead = play(5);

    expect(cues().slice(1)).toEqual(["slip-held"]);
    expect(dead).toBeNull();
  });

  it("says the arrival's line for the camp, and his name", () => {
    const { voice } = listening();

    expect(linesOf("camp-1").map((name) => english.say(name as SherpaTextName))).toContain(
      voice.arrival(),
    );
    expect(voice.name).toBe("Pemba");
  });
});

/** A client who lies hurt (#241): he says he's coming, and each thing he does as he does it. */
describe("Pemba's voice, by a client who lies hurt", () => {
  it("says he's coming as he sets off to them, and nothing of the place meanwhile", () => {
    const { world, cues, play } = listening();
    play(8);
    world.inPart = "popcorn";
    world.view = { ...world.view, doing: "reaching", client: "player" };
    play(30);

    expect(cues()).toContain("hurt-coming");
    expect(cues()).not.toContain("popcorn");
  });

  it("says the anchor, the tourniquet, the splint, the haul, the carry and Base Camp as each begins", () => {
    const { world, cues, play } = listening();
    play(8);
    world.view = { ...world.view, doing: "reaching", client: "player" };
    play(4);
    world.view = { ...world.view, doing: "anchoring" };
    world.pembaView = standing({ helping: { kind: "anchor", whom: "player", progress: 0.1 } });
    play(8);
    world.view = { ...world.view, doing: "treating" };
    world.due = "tourniquet";
    world.pembaView = standing({ helping: { kind: "aid", whom: "player", progress: 0.1 } });
    play(8);
    world.due = "splint";
    play(8);
    world.view = { ...world.view, doing: "hauling-out" };
    world.due = null;
    world.pembaView = standing({
      hauling: true,
      helping: { kind: "line-haul", whom: "player", progress: 0.1 },
    });
    play(8);
    world.view = { ...world.view, doing: "carrying" };
    world.pembaView = standing({ carrying: "player" });
    play(8);
    world.view = { ...world.view, doing: "evacuated" };
    world.pembaView = standing();
    play(8);

    expect(cues()).toEqual([
      "set-off",
      "hurt-coming",
      "anchor",
      "tourniquet",
      "splint",
      "haul-out",
      "on-my-back",
      "base-camp",
    ]);
  });

  it("says each of those lines in Russian too", () => {
    const russian = new Texts<SherpaTextName>(sherpaTexts.ru);
    for (const cue of ["hurt-coming", "anchor", "tourniquet", "splint", "wrap", "haul-out"]) {
      expect(russian.say(`${cue}.1` as SherpaTextName)).toMatch(/[а-яё]/u);
    }
    expect(russian.say("on-my-back.1")).toBe("На спину. Идём вниз.");
  });
});
