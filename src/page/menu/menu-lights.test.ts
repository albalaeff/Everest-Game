import { describe, expect, it } from "vitest";

import route from "../../../content/facts/route.json";
import { KnowledgeBase } from "../../content/knowledge-base";
import { Elevation } from "./elevation";
import { MenuLights } from "./menu-lights";
import { RouteMap } from "./route-map";

describe("MenuLights", () => {
  const knowledge = new KnowledgeBase([route]);
  const map = new RouteMap(knowledge, new Elevation(knowledge.number("route.summit-altitude")));
  const lights = new MenuLights(map);

  it("lights each camp's tents about the camp, most of them at Base Camp", () => {
    const near = (camp: string, reach: number): number =>
      lights.tents.filter(
        ({ at }) => Math.hypot(at.x - map.place(camp).at.x, at.y - map.place(camp).at.y) < reach,
      ).length;

    expect(near("base-camp", 35)).toBe(16);
    expect(near("camp-3", 12)).toBe(3);
    expect(near("south-col", 15)).toBe(5);
    expect(lights.tents).toHaveLength(34);
  });

  it("sends headlamps up the summit ridge and up the Icefall, where climbers are before dawn", () => {
    const [ridge, icefall] = lights.chains;

    expect(ridge?.way.points[0]).toEqual(map.place("south-col").at);
    expect(ridge?.way.points.at(-1)).toEqual(map.place("summit").at);
    expect(icefall?.way.points[0]).toEqual(map.place("base-camp").at);
    expect(icefall?.way.points.at(-1)).toEqual(map.place("camp-1").at);
    for (const chain of lights.chains) {
      expect(Math.max(...chain.ahead)).toBeLessThan(chain.seconds);
    }
  });
});
