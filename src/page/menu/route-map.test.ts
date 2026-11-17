import { describe, expect, it } from "vitest";

import route from "../../../content/facts/route.json";
import { KnowledgeBase } from "../../content/knowledge-base";
import { Elevation } from "./elevation";
import { RouteMap } from "./route-map";

describe("RouteMap", () => {
  const knowledge = new KnowledgeBase([route]);
  const elevation = new Elevation(knowledge.number("route.summit-altitude"));
  const map = new RouteMap(knowledge, elevation);

  it("goes from Base Camp to the summit through every camp and landmark, in the route's order", () => {
    expect(map.places.map(({ id }) => id)).toEqual([
      "base-camp",
      "camp-1",
      "camp-2",
      "camp-3",
      "south-col",
      "balcony",
      "south-summit",
      "hillary-step",
      "summit",
    ]);
    expect(map.way.points[0]).toEqual(map.place("base-camp").at);
    expect(map.way.points.at(-1)).toEqual(map.place("summit").at);
  });

  it("stands each place at the knowledge base's altitude, to the picture's scale", () => {
    for (const place of map.places) {
      expect(place.altitude).toBe(knowledge.number(`route.${place.id}-altitude`));
      // The rope lies a couple of pixels under the ridge's crest: some 13 m on the mountain.
      expect(Math.abs(elevation.altitude(place.at.y) - place.altitude)).toBeLessThan(15);
    }
  });

  it("climbs from each place to the next, and tops out at the summit", () => {
    const altitudes = map.places.map(({ altitude }) => altitude);
    const shares = map.places.map(({ share }) => share);

    expect(altitudes).toEqual([...altitudes].sort((one, other) => one - other));
    expect(shares).toEqual([...shares].sort((one, other) => one - other));
    expect(shares[0]).toBe(0);
    expect(shares.at(-1)).toBe(1);
    expect(Math.min(...map.way.points.map(({ y }) => y))).toBe(map.place("summit").at.y);
  });

  it("follows the Southeast Ridge from the South Col up, just under its crest", () => {
    const ridge = map.stretch("south-col", "summit");

    expect(ridge.points).toHaveLength(map.ridge.points.length);
    expect(ridge.points[0]).toEqual(map.place("south-col").at);
    for (const [index, point] of ridge.reversed().points.entries()) {
      const crest = map.ridge.points[index];
      expect(point.x).toBe(crest?.x);
      expect(point.y - (crest?.y ?? 0)).toBeCloseTo(2.2);
    }
  });

  it("makes the South Summit a summit: the ridge dips before the Hillary Step", () => {
    const notch = map.stretch("south-summit", "hillary-step").points;
    const lowest = Math.max(...notch.map(({ y }) => y));

    expect(lowest).toBeGreaterThan(map.place("south-summit").at.y);
  });

  it("draws the rope as one smooth line from Base Camp", () => {
    const { x, y } = map.place("base-camp").at;

    expect(map.path.startsWith(`M${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}C`)).toBe(
      true,
    );
    expect(map.path.match(/M/g)).toHaveLength(1);
  });

  it("knows no place the route doesn't have", () => {
    expect(() => map.place("camp-5")).toThrow(RangeError);
  });
});
