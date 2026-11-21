import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "../content/knowledge-base";
import { KNOWLEDGE_FILES } from "../content/knowledge-files";
import { Mountain } from "../content/mountain";
import { Section } from "../content/section";
import type { ExpeditionStore } from "../saves";
import { Expedition, MountainClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { ActionQueue } from "./action-queue";
import { GodMode } from "./god-mode";
import { SoloGame } from "./solo-game";

const mountain = new Mountain(new KnowledgeBase(KNOWLEDGE_FILES));
const PLAYER = Section.PLAYER;
const HOUR = 3600;

/** The device's storage as a test sees it: each save as it came. */
class MemoryStore implements ExpeditionStore {
  readonly stored: ExpeditionSave[] = [];

  load(): Promise<ExpeditionSave | null> {
    return Promise.resolve(this.stored.at(-1) ?? null);
  }

  store(save: ExpeditionSave): Promise<void> {
    this.stored.push(save);
    return Promise.resolve();
  }
}

/** A new climb alone on the Icefall with its Sherpa, and the god mode over it. */
function aClimb(seed = 7) {
  const rules = mountain.rules();
  const scenario = mountain.scenario(seed, undefined, undefined, true, undefined, true);
  const expedition = Expedition.start(scenario, rules.all);
  const store = new MemoryStore();
  const queue = new ActionQueue();
  const game = new SoloGame(expedition, queue, store, PLAYER);
  const sherpa = scenario.npcs?.[0] ?? null;
  const god = new GodMode(game, rules, mountain.route, PLAYER, sherpa, seed);
  return { god, rules, game, queue, store, expedition, sherpa: sherpa ?? "" };
}

/** Where a climber stands at a place of the god mode's. */
const alongOf = (god: GodMode, id: string): number =>
  god.places.find((place) => place.id === id)?.along ?? Number.NaN;

/** Plays `seconds` of the climb alone, the player standing. */
const play = (game: SoloGame, seconds: number): void => {
  for (let second = 0; second < seconds; second += 1) {
    game.advance(1);
  }
};

describe("GodMode: the places", () => {
  it("lists the route's camps, parts, ladders, steps of ice, hazards' stretches and the seed's training, each where a climber stands there", () => {
    const { god } = aClimb();
    const { route } = mountain;
    const ids = god.places.map(({ id }) => id);
    const staged = route.staged(7);

    expect(ids).toEqual(expect.arrayContaining(["camp:base-camp", "camp:camp-1", "part:maze"]));
    expect(alongOf(god, "camp:camp-1")).toBe(664.5);
    expect(alongOf(god, "part:football-field")).toBe(384.25);
    expect(alongOf(god, "ladder:big-crevasse")).toBe(318.75);
    expect(alongOf(god, "hazard:hanging-glacier")).toBe(421.625);
    expect(ids.filter((id) => id.startsWith("ladder:"))).toHaveLength(16);
    expect(ids.filter((id) => id.startsWith("face:"))).toEqual([
      "face:popcorn",
      "face:maze",
      "face:upper-icefall",
    ]);
    expect(alongOf(god, "training:serac-collapse")).toBeCloseTo(
      (staged.collapse?.from ?? 0) - (staged.collapse?.lead ?? 0) - 1,
      9,
    );
    expect(ids).toContain(`training:${staged.ladder?.id ?? ""}`);
    expect(() => god.teleport("camp:summit")).toThrow(RangeError);
  });

  it("is asked for by the address's word, with a room's or without", () => {
    expect(GodMode.asked("https://albalaeff.eu/Everest-Game/?god")).toBe(true);
    expect(GodMode.asked("http://localhost:4173/?room=ABCDE&god=1")).toBe(true);
    expect(GodMode.asked("https://albalaeff.eu/Everest-Game/")).toBe(false);
    expect(GodMode.asked("https://albalaeff.eu/Everest-Game/?godly")).toBe(false);
  });
});

describe("GodMode: the teleport", () => {
  it("puts the player on their feet at a place, clipped to the rope there, Pemba beside them, and saves the climb", () => {
    const { god, rules, store, sherpa } = aClimb();

    const along = god.teleport("ladder:big-crevasse");
    const player = rules.physics.climber(PLAYER);

    expect(along).toBe(318.75);
    expect(rules.physics.along(PLAYER)).toBe(318.75);
    expect(player).toMatchObject({ dead: false, falling: false, ladder: null });
    expect(player.first).not.toBeNull();
    expect(player.second).toBe(player.first);
    expect(rules.physics.along(sherpa)).toBe(318.75);
    expect(rules.sherpa.view).toMatchObject({ doing: "waiting", client: null });
    expect(store.stored.length).toBeGreaterThan(0);
  });

  it("stands them at a ladder's nearer end when sent under its span, at a step of ice's foot or top, and at the ground's ends past them", () => {
    const { god, rules } = aClimb();
    const [face] = rules.physics.bareFaces;

    expect(god.teleport(330)).toBe(319.75);
    expect(god.teleport(375)).toBe(379.5);
    expect(god.teleport((face?.foot ?? 0) + 0.1)).toBe(face?.foot);
    expect(god.teleport((face?.top ?? 0) - 0.1)).toBe(face?.top);
    expect(god.teleport(-5)).toBe(0);
    expect(god.teleport(10_000)).toBe(rules.physics.terrain.length);
  });

  it("sends Pemba alone where he's asked, and he takes the climb afresh from there", () => {
    const { god, rules, sherpa } = aClimb();
    god.teleport(66);

    god.teleport(505, sherpa);

    expect(rules.physics.along(sherpa)).toBe(505);
    expect(rules.physics.along(PLAYER)).toBe(66);
  });

  it("puts the player on the ground nearest a point of the slope, where the panel's pick lands", () => {
    const { god, rules } = aClimb();
    const { x, y } = rules.physics.terrain.point(250);

    const along = god.teleportTo({ x, y: y + 0.5 });

    expect(Math.abs(along - 250)).toBeLessThan(0.5);
    expect(rules.physics.along(PLAYER)).toBe(along);
  });

  it("goes on from the climb it saved, the player where it put them", () => {
    const { god, store } = aClimb();
    god.teleport("camp:camp-1");
    const rules = mountain.rules();

    const resumed = SoloGame.resume(store.stored.at(-1) ?? null, rules.all);

    expect(resumed).not.toBeNull();
    expect(rules.physics.along(PLAYER)).toBe(664.5);
  });
});

describe("GodMode: the clock, the weather and the speed", () => {
  it("sets the clock on to the next time of day asked, and never back: an hour gone by is tomorrow's", () => {
    const { god, rules } = aClimb();

    god.hour("13:00");
    const afternoon = { day: rules.clock.day, time: rules.clock.timeOfDay };
    god.hour("04:30");

    expect(afternoon).toEqual({ day: 0, time: 13 * HOUR });
    expect(rules.clock.day).toBe(1);
    expect(rules.clock.timeOfDay).toBe(4.5 * HOUR);
    expect(MountainClock.text(rules.clock.timeOfDay)).toBe("04:30");
  });

  it("sets the weather for the hazards and the jolts alike", () => {
    const { god, rules, store } = aClimb();

    god.weather("snow");

    expect(rules.hazards.weather).toBe("snow");
    expect(store.stored.at(-1)?.rules["jolts"]).toMatchObject({ weather: "snow" });
  });

  it("calms the mountain: no gust comes on the open ground from then on, and none can be staged", () => {
    // Twenty minutes of play on the Popcorn in a wind, twelve hours of the mountain's.
    const windy = (calmed: boolean) => {
      const climb = aClimb();
      climb.god.teleport(250);
      climb.god.weather("wind");
      if (calmed) {
        climb.god.calm();
      }
      climb.god.speed(20);
      play(climb.game, 60);
      return climb;
    };
    const { god, rules, store } = windy(true);

    expect(windy(false).rules.jolts.jolts.length).toBeGreaterThan(0);
    expect(rules.jolts.jolts).toEqual([]);
    expect(god.jolt("gust")).toBe(false);
    expect(store.stored.at(-1)?.rules["jolts"]).toMatchObject({ zones: [] });
    // A day of the mountain's in all: about 2 s alone, more than the default five on a busy runner.
  }, 30_000);

  it("runs the climb as many times faster as it's told", () => {
    const { god, game } = aClimb();

    god.speed(20);
    game.advance(0.25);

    expect(game.step).toBe(100);
    expect(god.state.speed).toBe(20);
  });
});

describe("GodMode: scenarios staged on the spot", () => {
  it("stages a serac collapse over the player: it cracks at once, and comes down on them unless they get clear", () => {
    const { god, rules, game } = aClimb();
    god.teleport(390);

    const event = god.serac();
    game.advance(0.05);
    const cracking = rules.hazards.warnings.map(({ zone }) => zone);
    play(game, 10);

    expect(event).toMatchObject({ id: "god-serac-1", kind: "serac", trainees: [PLAYER] });
    expect(event.from).toBeLessThan(390);
    expect(event.to).toBeGreaterThan(390);
    expect(cracking).toEqual(["god-serac-1"]);
    expect(rules.hazards.strikes).toMatchObject([
      { zone: "god-serac-1", climbers: [PLAYER], training: true },
    ]);
    expect(god.serac().id).toBe("god-serac-2");
  });

  it("stages the next ladder ahead long enough to break, under the player's steps; or the one it names; or none past the last", () => {
    const { god, rules } = aClimb();
    god.teleport("ladder:big-crevasse");

    expect(god.ladder()).toBe("big-crevasse");
    expect(rules.physics.ladderCondition("big-crevasse")).toBe("whole");
    expect(god.ladder("block")).toBe("block");
    god.teleport("part:western-cwm");
    expect(god.ladder()).toBeNull();
  });

  it("brings a gust onto the player, and a twist at the lashed ladder they're at", () => {
    const { god, rules } = aClimb();
    god.teleport(66);

    const gust = god.jolt("gust");
    const twist = god.jolt("twist");
    god.teleport("ladder:wide-crevasse");
    god.teleport(200);

    expect([gust, twist]).toEqual([true, false]);
    expect(god.jolt("twist")).toBe(true);
    expect(rules.jolts.warnings.map(({ kind }) => kind)).toEqual(["gust", "twist"]);
  });

  it("slips the player where they stand: their rope holds them", () => {
    const { god, rules, game } = aClimb();
    god.teleport(66);

    god.slip();
    play(game, 5);

    expect(rules.physics.climber(PLAYER).falls).toHaveLength(1);
    expect(rules.physics.climber(PLAYER).falls[0]).toMatchObject({ held: true });
  });

  it("stands an immortal player up again where their body comes to rest, the fall kept, and leaves a mortal one dead", () => {
    const { god, rules, game } = aClimb();
    god.teleport(390);
    rules.physics.kill(PLAYER, game.step);
    god.update(0.05);
    const mortal = rules.physics.climber(PLAYER).dead;

    god.immortal(true);
    god.update(0.05);
    const falling = rules.physics.climber(PLAYER);
    play(game, 3);
    god.update(3);

    expect(mortal).toBe(true);
    expect(falling).toMatchObject({ dead: true, falling: true });
    expect(rules.physics.climber(PLAYER)).toMatchObject({ dead: false, falling: false });
    expect(rules.physics.climber(PLAYER).falls).toHaveLength(1);
    expect(god.state.immortal).toBe(true);
  });

  it("stands an immortal player up after a while still falling, before the page says they died", () => {
    const { god, rules, game } = aClimb();
    god.teleport(390);
    god.immortal(true);
    rules.physics.kill(PLAYER, game.step);

    god.update(1.9);
    const lying = rules.physics.climber(PLAYER).dead;
    god.update(0.2);

    expect(lying).toBe(true);
    expect(rules.physics.climber(PLAYER).dead).toBe(false);
  });
});

describe("GodMode: an injury to rescue a climber from (#241)", () => {
  it("breaks the player's leg where they stand: down, taking no step, and their Sherpa comes to them", () => {
    const { god, rules, game, queue, sherpa } = aClimb();
    god.teleport(250);
    god.teleport(240, sherpa);

    god.injure();
    queue.send({ kind: "walk", climber: PLAYER, direction: "right" });
    play(game, 6);

    const player = rules.physics.climber(PLAYER);
    expect(player).toMatchObject({ down: true, dead: false, moving: false });
    expect(player.injuries).toMatchObject([{ part: "leg", kind: "fracture", splinted: false }]);
    expect(rules.physics.along(PLAYER)).toBe(250);
    expect(rules.sherpa.view).toMatchObject({ client: PLAYER });
    expect(rules.physics.along(sherpa)).toBeGreaterThan(240);
  });

  it("stages the injury asked for, on the climber asked for", () => {
    const { god, rules, sherpa } = aClimb();
    god.teleport(250);

    god.injure({ part: "arm", kind: "open-fracture" }, sherpa);

    expect(rules.physics.climber(sherpa).injuries).toMatchObject([
      { part: "arm", kind: "open-fracture", tourniquet: false },
    ]);
    expect(rules.physics.climber(sherpa).down).toBe(true);
    expect(rules.physics.climber(PLAYER).injuries).toEqual([]);
  });

  it("lays them where it's told first, off the rope: a crevasse's floor, as a fall would have", () => {
    const { god, rules } = aClimb();
    const floor = 52;

    god.injure(undefined, PLAYER, floor);

    const player = rules.physics.climber(PLAYER);
    expect(rules.physics.along(PLAYER)).toBe(floor);
    expect(player).toMatchObject({ down: true, first: null, second: null });
    expect(rules.physics.deadEnd(floor)).toBe(true);
  });

  it("leaves a Sherpa who lies with a bone broken where he lies when the player goes elsewhere", () => {
    const { god, rules, sherpa } = aClimb();
    god.injure(undefined, sherpa, 52);

    god.teleport(39.3);

    expect(rules.physics.along(sherpa)).toBe(52);
    expect(rules.physics.along(PLAYER)).toBe(39.3);
  });
});
