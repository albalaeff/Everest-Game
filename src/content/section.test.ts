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

  it("is drawn at 1/time.compression of life: its rise within 1% of the ratio, its width within 5%", () => {
    const compression = knowledge.number("time.compression");
    const width = terrain.point(terrain.length).x - terrain.point(0).x;

    expect(Math.abs(scale.compression / compression - 1)).toBeLessThan(0.01);
    expect(Math.abs(width / (section.length / compression) - 1)).toBeLessThan(0.05);
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

  it("fixes a rope along every ladder, in order, and from the shoulder up in one line of shared anchors", () => {
    const { ropes, ladders } = section.layout;
    const shoulder = ladders.find((ladder) => ladder.id === "shoulder-foot");
    const line = ropes.filter((rope) => rope.from >= (shoulder?.from ?? Infinity));

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
      expect(physics.climber(id)).toMatchObject({ y: 0, falling: false, ladder: null });
      expect(physics.climber(id).x).toBeLessThan(20);
    }
    expect(physics.ropes).toEqual(section.layout.ropes.map((rope) => rope.id));
    expect(physics.ladders).toEqual(section.layout.ladders.map((ladder) => ladder.id));
  });

  it("lays the seracs where the collapses killed, between 5,600 and 5,800 m, past the crevasses", () => {
    const kinds = section.hazards.zones.map((zone) => zone.kind);
    const seracs = section.hazards.zones.filter((zone) => zone.kind === "serac");
    const crevasses = section.hazards.zones.filter((zone) => zone.kind === "crevasse");
    const highestStart = Math.max(...section.layout.climbers.map((climber) => climber.along));

    expect(kinds).toEqual(["crevasse", "crevasse", "serac", "serac", "avalanche"]);
    for (const zone of seracs) {
      expect(altitudeAlong(zone.from)).toBeGreaterThan(5600);
      expect(altitudeAlong(zone.to)).toBeLessThan(5800);
      expect(crevasses.every((crevasse) => crevasse.to < zone.from)).toBe(true);
    }
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

    expect(start).toMatchObject({ x: 10, y: 0 });
    expect(later.x).toBeGreaterThan(21);
    expect(later.y).toBeGreaterThan(0.5);
  });

  it("sets every climber of the layout off in a body of their own, in the layout's order", () => {
    expect(section.bodies.map((body) => body.id)).toEqual(
      section.layout.climbers.map(({ id }) => id),
    );
    expect(() => Body.start(section.bodies)).not.toThrow();
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

  it("refuses a camp off the ground, and a destination that isn't a camp", () => {
    const offTheGround = [...icefall.camps.slice(0, 1), { id: "camp-1", from: 470, to: 480 }];
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
