import { describe, expect, it } from "vitest";

import time from "../../content/facts/time.json";
import standIn from "../../content/route/stand-in.json";
import { SectionScale, SlopePhysics, Terrain } from "../physics";
import { Expedition, MountainClock } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { StandInRoute } from "./stand-in-route";

describe("StandInRoute", () => {
  it("lays the section out: the ropes and ladders on the ground, the climbers standing", () => {
    const route = new StandInRoute();
    const physics = new SlopePhysics(route.settings);
    const expedition = Expedition.start(route.scenario(1), [physics]);

    expect(expedition.scenario.climbers).toEqual([StandInRoute.PLAYER, "teammate"]);
    for (const id of expedition.scenario.climbers) {
      expect(physics.climber(id)).toMatchObject({ falling: false, ladder: null });
    }
    expect(physics.ropes).toEqual(["serac", "step", "slope"]);
    expect(physics.ladders).toEqual(["crevasse", "wall"]);
  });

  it("lets the player walk up from the start", () => {
    const route = new StandInRoute();
    const physics = new SlopePhysics(route.settings);
    const expedition = Expedition.start(route.scenario(1), [physics]);
    const start = physics.climber(StandInRoute.PLAYER);

    expedition.advance([{ kind: "walk", climber: StandInRoute.PLAYER, direction: "right" }]);
    for (let step = 1; step < 600; step += 1) {
      expedition.advance();
    }
    const later = physics.climber(StandInRoute.PLAYER);

    expect(start).toMatchObject({ x: 10, y: 0 });
    expect(later.x).toBeGreaterThan(25);
    expect(later.y).toBeGreaterThan(1);
  });

  it("has every ladder's ends at corners of the ground, so nobody walks off beside it", () => {
    const { layout } = new StandInRoute();
    const terrain = new Terrain(layout.terrain);
    const corners = new Set(layout.terrain.map(([x, y]) => `${x} ${y}`));

    for (const ladder of layout.ladders) {
      for (const end of [ladder.from, ladder.to]) {
        const { x, y } = terrain.point(end);
        expect(corners.has(`${x} ${y}`)).toBe(true);
      }
    }
  });

  it("has its ends at its made-up altitudes, drawn at the knowledge base's ratio", () => {
    const { layout } = new StandInRoute();
    const terrain = new Terrain(layout.terrain);
    const scale = new SectionScale(terrain, layout.altitude);

    expect(layout.altitude.end).toBeGreaterThan(layout.altitude.start);
    expect(scale.compression).toBeCloseTo(new KnowledgeBase([time]).number("time.compression"), 6);
  });

  it("starts the mountain's clock at its date and time", () => {
    const route = new StandInRoute();
    const clock = new MountainClock(1);
    const expedition = Expedition.start(route.scenario(1), [clock]);

    expedition.advance();

    expect(clock.start).toEqual(route.clock);
    expect(clock.day).toBe(0);
  });

  it("refuses a point of the data that isn't a pair", () => {
    const layout = {
      ...standIn.layout,
      terrain: [
        [0, 0],
        [20, 0, 1],
      ],
    };

    expect(() => new StandInRoute({ ...standIn, layout })).toThrow(RangeError);
  });
});
