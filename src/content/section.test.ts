import { describe, expect, it } from "vitest";

import icefall from "../../content/route/icefall.json";
import { SectionScale, SlopePhysics, Terrain } from "../physics";
import { Body, Expedition, MountainClock, SimulationClock } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Section } from "./section";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const section = new Section(knowledge);
const terrain = new Terrain(section.layout.terrain);
const scale = new SectionScale(terrain, section.layout.altitude);
const altitudeAlong = (along: number): number => scale.altitudeAt(terrain.point(along));
/** The part of the route a point along the ground is in. */
const partAt = (along: number): string | undefined =>
  section.parts.find(({ from, to }) => from <= along && along < to)?.id;

describe("Section: the Khumbu Icefall from content/route/icefall.json", () => {
  it("runs from Base Camp to Camp 1, at the knowledge base's altitudes", () => {
    expect(section.id).toBe("icefall");
    expect(section.camps.map((camp) => camp.id)).toEqual(["base-camp", "camp-1"]);
    expect(section.layout.altitude).toEqual({
      start: knowledge.number("route.base-camp-altitude"),
      end: knowledge.number("route.camp-1-altitude"),
    });
    expect(section.destination).toMatchObject({
      id: "camp-1",
      altitude: knowledge.number("route.camp-1-altitude"),
    });
    expect(section.hours).toEqual(knowledge.range("time.base-camp-to-camp-1"));
    expect(section.length).toBe(knowledge.number("route.icefall-length"));
  });

  it("is drawn at 1/route.drawn-scale of life: its rise within 1% of the scale, its width within 5%", () => {
    const drawnScale = knowledge.number("route.drawn-scale");
    const width = terrain.point(terrain.length).x - terrain.point(0).x;

    expect(Math.abs(scale.ratio / drawnScale - 1)).toBeLessThan(0.01);
    expect(Math.abs(width / (section.length / drawnScale) - 1)).toBeLessThan(0.05);
  });

  it("has as many ladders as the Icefall Doctors fix in a season, each with its ends at corners", () => {
    const ladders = knowledge.range("route.icefall-ladders");
    const corners = new Set(section.layout.terrain.map(([x, y]) => `${x} ${y}`));

    expect(section.layout.ladders.length).toBeGreaterThanOrEqual(ladders.min);
    expect(section.layout.ladders.length).toBeLessThanOrEqual(ladders.max);
    for (const ladder of section.layout.ladders) {
      for (const end of [ladder.from, ladder.to]) {
        const { x, y } = terrain.point(end);
        expect(corners.has(`${x} ${y}`)).toBe(true);
      }
    }
  });

  it("names its parts as the sources do, in their order, end to end from Base Camp's moraine", () => {
    expect(section.parts.map(({ id }) => id)).toEqual([
      "moraine",
      "popcorn",
      "maze",
      "football-field",
      "upper-icefall",
      "western-cwm",
    ]);
    for (const [index, part] of section.parts.entries()) {
      expect(part.from).toBe(section.parts[index - 1]?.to ?? 0);
    }
    expect(section.parts.at(-1)?.to).toBe(terrain.length);
    // The moraine ends at Crampon Point, where the first rope is fixed.
    expect(section.parts[0]?.to).toBe(section.layout.ropes[0]?.from);
  });

  it("lays the Football Field flat, where the altimeter reads route.football-field-altitude", () => {
    const field = section.parts.find(({ id }) => id === "football-field");
    const altitude = knowledge.number("route.football-field-altitude");
    const { from = 0, to = 0 } = field ?? {};
    const heights = Array.from(
      { length: to - from + 1 },
      (_, metre) => terrain.point(from + metre).y,
    );

    expect(to - from).toBeGreaterThan(20);
    expect(new Set(heights).size).toBe(1);
    expect(altitudeAlong(from)).toBeLessThan(altitude);
    expect(altitudeAlong(to)).toBeGreaterThan(altitude);
  });

  it("puts most of the ladders, and the longest, past the Popcorn, where the walls stand tallest at the top", () => {
    const { ladders } = section.layout;
    const length = ({ from, to }: { from: number; to: number }): number => {
      const [start, end] = [terrain.point(from), terrain.point(to)];
      return Math.hypot(end.x - start.x, end.y - start.y);
    };
    const longest = (part: string): number =>
      Math.max(...ladders.filter(({ from }) => partAt(from) === part).map(length));
    // Up a wall or down one: a ladder that rises or falls more than it goes across.
    const upright = ladders.filter(({ from, to }) => {
      const [start, end] = [terrain.point(from), terrain.point(to)];
      return Math.abs(end.y - start.y) > Math.abs(end.x - start.x);
    });

    expect(ladders.filter(({ from }) => partAt(from) !== "popcorn").length).toBeGreaterThan(
      ladders.length / 2,
    );
    expect(longest("maze")).toBeGreaterThan(longest("popcorn"));
    expect(Math.max(...upright.map(length))).toBe(longest("upper-icefall"));
    expect(ladders.filter(({ from }) => partAt(from) === "football-field")).toEqual([]);
  });

  it("fixes a rope along every ladder, in order, and from the maze up in one line of shared anchors", () => {
    const { ropes, ladders } = section.layout;
    const maze = ladders.find(({ from }) => partAt(from) === "maze");
    const line = ropes.filter((rope) => rope.from >= (maze?.from ?? Infinity));

    for (const ladder of ladders) {
      expect(ropes.some((rope) => rope.from <= ladder.from && rope.to >= ladder.to)).toBe(true);
    }
    for (const [index, rope] of ropes.entries()) {
      const before = ropes[index - 1];
      if (before !== undefined) {
        expect(rope.from).toBeGreaterThanOrEqual(before.to);
      }
    }
    expect(line.length).toBeGreaterThan(5);
    for (const [index, rope] of line.entries()) {
      const before = line[index - 1];
      if (before !== undefined) {
        expect(rope.from).toBe(before.to);
      }
    }
  });

  it("has a rope within a cowstail's reach at every ladder's foot, once the ropes have fallen into place", () => {
    for (const ladder of section.layout.ladders) {
      const layout = { ...section.layout, climbers: [{ id: "anna", along: ladder.from }] };
      const physics = new SlopePhysics(section.settings);
      const scenario = {
        seed: 1,
        climbers: ["anna"],
        start: { [SlopePhysics.NAME]: SlopePhysics.start(layout) },
      };
      const expedition = Expedition.start(scenario, [physics]);
      for (let step = 0; step < 5 * SimulationClock.STEPS_PER_SECOND; step += 1) {
        expedition.advance();
      }
      expedition.advance([{ kind: "clip", climber: "anna", cowstail: "second" }]);

      expect(`${ladder.id}: ${physics.climber("anna").second ?? "none"}`).not.toBe(
        `${ladder.id}: none`,
      );
    }
  });

  it("lays every rope and ladder on the ground, and the climbers standing at its foot", () => {
    const physics = new SlopePhysics(section.settings);
    const expedition = Expedition.start(section.scenario(1), [physics]);

    expect(expedition.scenario.climbers).toEqual([Section.PLAYER, "teammate"]);
    for (const id of expedition.scenario.climbers) {
      const { x, y } = physics.climber(id);
      expect(physics.climber(id)).toMatchObject({ falling: false, ladder: null });
      expect(x).toBeLessThan(20);
      expect(y).toBe(physics.terrain.height(x));
    }
    expect(physics.ropes).toEqual(section.layout.ropes.map((rope) => rope.id));
    expect(physics.ladders).toEqual(section.layout.ladders.map((ladder) => ladder.id));
  });

  it("lays the seracs where the collapses killed, between 5,600 and 5,800 m and over the Football Field, the snow bridges below and above them", () => {
    const { zones } = section.hazards;
    const seracs = zones.filter((zone) => zone.kind === "serac");
    const crevasses = zones.filter((zone) => zone.kind === "crevasse");
    const field = section.parts.find(({ id }) => id === "football-field");
    const highestStart = Math.max(...section.layout.climbers.map((climber) => climber.along));

    expect(zones.map(({ kind, from }) => `${kind} in the ${partAt(from) ?? "air"}`)).toEqual([
      "crevasse in the popcorn",
      "crevasse in the maze",
      "serac in the maze",
      "serac in the football-field",
      "serac in the upper-icefall",
      "avalanche in the western-cwm",
      "crevasse in the western-cwm",
    ]);
    for (const zone of seracs) {
      expect(altitudeAlong(zone.from)).toBeGreaterThan(5600);
      expect(altitudeAlong(zone.to)).toBeLessThan(5800);
      expect(crevasses.every(({ from, to }) => to <= zone.from || from >= zone.to)).toBe(true);
    }
    expect(
      seracs.some(({ from, to }) => from <= (field?.from ?? 0) && to >= (field?.to ?? 0)),
    ).toBe(true);
    for (const zone of section.hazards.zones) {
      expect(zone.from).toBeGreaterThan(highestStart);
      expect(zone.to).toBeLessThanOrEqual(terrain.length);
    }
  });

  it("puts the camps on the flat at each end, Camp 1 the arrival", () => {
    const [baseCamp, camp1] = section.camps;

    expect(baseCamp).toMatchObject({ from: 0 });
    expect(camp1?.to).toBe(terrain.length);
    for (const camp of section.camps) {
      expect(terrain.point(camp.from).y).toBe(terrain.point(camp.to).y);
    }
    expect(section.destination).toBe(camp1);
  });

  it("lays the file's snow on the ground, level over the camps, trodden flat round them and at the ladders' ends", () => {
    const physics = new SlopePhysics(section.settings);
    Expedition.start(section.scenario(1), [physics]);
    const snow = physics.terrain;
    const { trodden, ...file } = icefall.layout.snow;
    const level = [
      ...section.camps.map(({ from, to }) => ({
        from: Math.max(from - trodden, 0),
        to: Math.min(to + trodden, terrain.length),
      })),
      ...icefall.layout.ice,
    ];
    const lift = (x: number): number => snow.height(x) - terrain.height(x);

    expect(trodden).toBeGreaterThan(0);
    expect(section.layout.snow).toEqual({ ...file, level });
    for (const { from, to } of [...level, ...section.layout.ladders]) {
      for (const along of [from, (from + to) / 2, to]) {
        const [onSnow, onLine] = [snow.point(along), terrain.point(along)];
        expect(onSnow.x).toBeCloseTo(onLine.x, 9);
        expect(onSnow.y).toBeCloseTo(onLine.y, 9);
      }
    }
    // The climbers set off on it, as the line has them.
    for (const { along } of section.layout.climbers) {
      expect(snow.point(along)).toEqual(terrain.point(along));
    }
    // Between them it rises and falls by tens of centimetres.
    const open = Array.from({ length: 200 }, (_, index) => lift(64 + index * 0.12));
    expect(Math.max(...open) - Math.min(...open)).toBeGreaterThan(0.2);
    expect(Math.max(...open.map(Math.abs))).toBeLessThan(0.8);
  });

  it("bares blue ice where the file says, on walked ground, and down to the big crevasse's lip in the maze, where the rope runs (#190)", () => {
    const { ice = [], ladders, ropes } = section.layout;
    const big = ladders.find(({ id }) => id === "big-crevasse");

    expect(ice).toEqual(icefall.layout.ice);
    expect(ice.length).toBeGreaterThanOrEqual(3);
    for (const { from, to } of ice) {
      expect(partAt(from)).not.toBe("moraine");
      expect(ladders.every((ladder) => to <= ladder.from || from >= ladder.to)).toBe(true);
    }
    // A slip there slides into the crevasse: the rope runs over all of it.
    expect(ice.some(({ to }) => to === big?.from)).toBe(true);
    const ramp = ice.find(({ to }) => to === big?.from) ?? { from: 0, to: 0 };
    for (let along = ramp.from; along <= ramp.to; along += 0.5) {
      expect(ropes.some((rope) => rope.from <= along && along <= rope.to)).toBe(true);
    }
  });

  it("climbs three steps of ice with no ladder on the tools, the Popcorn's, the maze's under its towers and the crux above the Upper Icefall's last ladder, each on its rope from its foot to past its lip", () => {
    const physics = new SlopePhysics(section.settings);
    Expedition.start(section.scenario(1), [physics]);
    const steps = physics.bareFaces;
    const { ladders, ropes } = section.layout;
    const crux = steps.at(-1) ?? { foot: 0, top: 0 };
    const below = ladders.find(({ to }) => to <= crux.foot && to >= crux.foot - 3);

    expect(steps.map(({ foot }) => partAt(foot))).toEqual(["popcorn", "maze", "upper-icefall"]);
    for (const { foot, top } of steps) {
      // Up the route, a few metres high, as the Icefall's walls climbed on the rope are.
      const height = terrain.point(top).y - terrain.point(foot).y;
      expect(top).toBeGreaterThan(foot);
      expect(height).toBeGreaterThan(2);
      expect(height).toBeLessThan(4);
      expect(ropes.some((rope) => rope.from <= foot && rope.to > top)).toBe(true);
    }
    // The crux is above a ladder: up it to a ledge, and on up the ice.
    expect(below?.id).toBe("high-wall");
  });

  it("lays its brittle ice across the crux alone, a band a careful pick goes over", () => {
    const physics = new SlopePhysics(section.settings);
    Expedition.start(section.scenario(1), [physics]);
    const crux = physics.bareFaces.at(-1) ?? { foot: 0, top: 0 };
    const { brittle = [] } = section.layout;
    // A pick bites well from the shoulder to short of full stretch: a band thinner than that is
    // gone over by a pick placed just under it, then one just over it.
    const goneOver =
      knowledge.number("technique.pick-stretch") - knowledge.number("technique.pick-lock-off");

    expect(brittle.length).toBeGreaterThan(0);
    for (const { from, to } of brittle) {
      expect(from).toBeGreaterThan(crux.foot);
      expect(to).toBeLessThan(crux.top);
      expect(terrain.point(to).y - terrain.point(from).y).toBeLessThan(goneOver);
    }
  });

  it("refuses ice off the ground", () => {
    const layout = { ...icefall.layout, ice: [{ from: 680, to: 700 }] };

    expect(() => new Section(knowledge, { ...icefall, layout })).toThrow("ice");
  });

  it("keeps its snow below the slip-free steepness where the climbers walk, so its hummocks slow a climber and never throw them", () => {
    const physics = new SlopePhysics(section.settings);
    Expedition.start(section.scenario(1), [physics]);
    const { points } = physics.terrain;
    // The walls and the crevasses are crossed on their ladders, never walked.
    const crossed = section.layout.ladders.map(({ from, to }) => {
      const [start, end] = [terrain.point(from).x, terrain.point(to).x];
      return { left: Math.min(start, end), right: Math.max(start, end) };
    });
    const walked = (x: number, nextX: number): boolean =>
      !crossed.some(({ left, right }) => left <= x && nextX <= right);
    const degrees = points.flatMap(([x, y], index) => {
      const [nextX, nextY] = points[index + 1] ?? [x, y];
      return nextX > x && walked(x, nextX)
        ? [(Math.atan(Math.abs(nextY - y) / (nextX - x)) * 180) / Math.PI]
        : [];
    });

    expect(degrees.length).toBeGreaterThan(500);
    expect(Math.max(...degrees)).toBeLessThan(knowledge.number("technique.slip-free-steepness"));
  });

  it("opens its crevasses as cracks of the glacier: each narrower as it goes down, none of them alike, none deeper than the sources' deepest", () => {
    const across = section.layout.ladders.flatMap(({ from, to }) => {
      const [start, end] = [terrain.point(from), terrain.point(to)];
      return Math.abs(end.y - start.y) < Math.abs(end.x - start.x) ? [{ from, to }] : [];
    });
    const shapes = across.map(({ from, to }) => {
      const inside = section.layout.terrain.filter((_, index) => {
        const along = terrain.alongs[index] ?? 0;
        return along > from && along < to;
      });
      const lips = Math.min(terrain.point(from).y, terrain.point(to).y);
      const foot = Math.min(...inside.map(([, y]) => y));
      const width = (y: number): number => {
        const xs = inside.filter(([, depth]) => depth === y).map(([x]) => x);
        return Math.max(...xs) - Math.min(...xs);
      };
      return {
        top: Math.abs(terrain.point(to).x - terrain.point(from).x),
        foot: width(foot),
        depth: lips - foot,
        corners: inside.length,
      };
    });

    expect(across.length).toBeGreaterThanOrEqual(8);
    for (const { top, foot, depth, corners } of shapes) {
      expect(foot).toBeLessThan(top / 2);
      expect(corners).toBeGreaterThan(6);
      expect(depth).toBeGreaterThan(5);
    }
    expect(new Set(shapes.map(({ top, depth }) => `${top} ${depth}`)).size).toBe(shapes.length);
    // Crevasses over 45 m deep, the sources say: these are among the shallower.
    expect(Math.max(...shapes.map(({ depth }) => depth))).toBeLessThan(45);
  });

  it("stands every ladder up a wall or down one clear of the wall's face, which leans back from it", () => {
    const { ladders } = section.layout;
    for (const { id, from, to } of ladders) {
      const [start, end] = [terrain.point(from), terrain.point(to)];
      if (Math.abs(end.y - start.y) <= Math.abs(end.x - start.x)) {
        continue;
      }
      const up = end.y > start.y;
      const face = section.layout.terrain.filter((_, index) => {
        const along = terrain.alongs[index] ?? 0;
        return along > from && along < to;
      });
      for (const [x, y] of face) {
        const ladder = start.x + ((end.x - start.x) * (y - start.y)) / (end.y - start.y);
        // Up a wall the ice is to the ladder's right; down one, to its left.
        expect(`${id}: ${up ? x >= ladder : x <= ladder}`).toBe(`${id}: true`);
      }
    }
  });

  it("sets off at the sources' hour, on the section's date", () => {
    const clock = new MountainClock(1);
    const expedition = Expedition.start(section.scenario(1), [clock]);

    expedition.advance();

    expect(section.clock).toEqual({ date: icefall.date, time: "03:00" });
    expect(clock.start).toEqual(section.clock);
    expect(clock.day).toBe(0);
  });

  it("lets the player walk up from the start, onto the first slope", () => {
    const physics = new SlopePhysics(section.settings);
    const expedition = Expedition.start(section.scenario(1), [physics]);
    const start = physics.climber(Section.PLAYER);

    expedition.advance([{ kind: "walk", climber: Section.PLAYER, direction: "right" }]);
    for (let step = 1; step < 60 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }
    const later = physics.climber(Section.PLAYER);

    expect(start).toMatchObject({ x: 10, y: physics.terrain.height(10) });
    expect(later.x).toBeGreaterThan(21);
    expect(later.y).toBeGreaterThan(0.5);
  });

  it("sets every climber of the layout off in a body of their own, in the layout's order", () => {
    expect(section.bodies.map((body) => body.id)).toEqual(
      section.layout.climbers.map(({ id }) => id),
    );
    expect(() => Body.start(section.bodies)).not.toThrow();
  });

  it("sets the player off as their answers make them, at their mass, fitness and technique, the others as they were", () => {
    const player = { mass: 92, fitness: 0.8, technique: 0.6 };
    const { start } = section.scenario(1, player);
    const bodies = (start[Body.NAME] as { climbers: { id: string }[] }).climbers;
    const climbers = (start[SlopePhysics.NAME] as { climbers: { id: string }[] }).climbers;
    const of = (all: { id: string }[], id: string) => all.find((climber) => climber.id === id);

    expect(of(bodies, Section.PLAYER)).toMatchObject({ mass: 92, fitness: 0.8 });
    expect(of(climbers, Section.PLAYER)).toMatchObject({ technique: 0.6 });
    expect(of(bodies, "teammate")).toMatchObject({ mass: 68, fitness: 1 });
    expect(of(climbers, "teammate")).toMatchObject({ technique: 1 });
    expect(section.scenario(1)).toEqual(
      section.scenario(1, { mass: 75, fitness: 1, technique: 1 }),
    );
  });

  it("refuses a climber with no body", () => {
    const bodies = icefall.bodies.filter((body) => body.id !== "teammate");

    expect(() => new Section(knowledge, { ...icefall, bodies })).toThrow("teammate");
  });

  it("refuses a hazard it doesn't know", () => {
    const zones = [{ id: "rockfall", kind: "rockfall", from: 30, to: 40 }];
    const route = new Section(knowledge, { ...icefall, hazards: { weather: "clear", zones } });

    expect(() => route.scenario(1)).toThrow(RangeError);
  });

  it("refuses parts that leave the ground, or a stretch of it out of every part", () => {
    const last = icefall.parts.at(-1) ?? { id: "western-cwm", from: 0, to: 0 };
    const beyond = [...icefall.parts.slice(0, -1), { ...last, to: last.to + 10 }];
    const gap = icefall.parts.map((part, index) =>
      index === 1 ? { ...part, from: part.from + 1 } : part,
    );

    expect(() => new Section(knowledge, { ...icefall, parts: beyond })).toThrow("western-cwm");
    expect(() => new Section(knowledge, { ...icefall, parts: gap })).toThrow("popcorn");
  });

  it("refuses a camp off the ground, and a destination that isn't a camp", () => {
    const end = terrain.length;
    const offTheGround = [...icefall.camps.slice(0, 1), { id: "camp-1", from: end, to: end + 10 }];
    const elsewhere = { ...icefall, to: "camp-2" };

    expect(() => new Section(knowledge, { ...icefall, camps: offTheGround })).toThrow("camp-1");
    expect(() => new Section(knowledge, elsewhere)).toThrow("camp-2");
  });

  it("refuses a point of the data that isn't a pair", () => {
    const layout = {
      ...icefall.layout,
      terrain: [
        [0, 0],
        [20, 0, 1],
      ],
    };

    expect(() => new Section(knowledge, { ...icefall, layout })).toThrow(RangeError);
  });
});
