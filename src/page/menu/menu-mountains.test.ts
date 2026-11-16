import { describe, expect, it } from "vitest";

import route from "../../../content/facts/route.json";
import { KnowledgeBase } from "../../content/knowledge-base";
import { Elevation } from "./elevation";
import { MenuMountains } from "./menu-mountains";
import { RouteMap } from "./route-map";

describe("MenuMountains", () => {
  const knowledge = new KnowledgeBase([route]);
  const elevation = new Elevation(knowledge.number("route.summit-altitude"));
  const map = new RouteMap(knowledge, elevation);
  const mountains = new MenuMountains(map, elevation);
  const { lines, faces } = mountains;

  it("stands Everest's summit above every other top of the picture", () => {
    const tops = [
      lines.northRidge,
      lines.lhotseSky,
      lines.nuptseCrest,
      lines.nuptseRight,
      lines.shoulderLeft,
      lines.lingtrenSky,
      lines.changtseSky,
      lines.tibetSky,
      lines.southSky,
    ].flatMap((ridge) => ridge.points.map(({ y }) => y));

    expect(lines.summit).toEqual(Elevation.SUMMIT);
    expect(Math.min(...tops)).toBe(lines.summit.y);
  });

  it("draws Lhotse and Nuptse lower than Everest by as much as they are", () => {
    expect(elevation.altitude(lines.lhotse.y)).toBeCloseTo(8516);
    expect(elevation.altitude(Math.min(...lines.nuptseCrest.points.map(({ y }) => y)))).toBeCloseTo(
      7861,
    );
    expect(lines.lhotse.x).toBeGreaterThan(map.place("south-col").at.x);
  });

  it("lays the rope along Everest's skyline above the South Col", () => {
    expect(faces.everest.outline.points).toEqual(expect.arrayContaining([...map.ridge.points]));
    for (const place of ["balcony", "south-summit", "hillary-step"]) {
      const { at } = map.place(place);
      expect(faces.everest.contains({ x: at.x, y: at.y + 2 })).toBe(true);
      expect(faces.everest.contains({ x: at.x, y: at.y - 6 })).toBe(false);
    }
  });

  it("stands the camps where they are: on the Icefall's top, in the Cwm and on the Lhotse Face", () => {
    expect(faces.cwm.contains(map.place("camp-2").at)).toBe(true);
    expect(faces.lhotse.contains(map.place("camp-3").at)).toBe(true);
    expect(faces.icefall.contains(map.stretch("base-camp", "camp-1").at(60))).toBe(true);
    const { at } = map.place("camp-1");
    expect(lines.cwmLeft.points[0]?.y).toBeGreaterThan(at.y - 12);
    expect(lines.cwmLeft.points[0]?.y).toBeLessThan(at.y + 12);
  });

  it("parts Everest into its North Face and its Southwest Face along the West Ridge", () => {
    expect(faces.north.contains({ x: 700, y: 330 })).toBe(true);
    expect(faces.southwest.contains({ x: 700, y: 330 })).toBe(false);
    expect(faces.southwest.contains({ x: 950, y: 330 })).toBe(true);
  });

  it("closes every face, from the farthest to the nearest, and reaches both sides", () => {
    expect(faces.all[0]).toBe(faces.tibet);
    expect(faces.all.at(-1)).toBe(faces.near);
    for (const face of faces.all) {
      expect(face.path.endsWith("Z")).toBe(true);
    }
    const reach = faces.near.outline.points.map(({ x }) => x);
    expect(Math.min(...reach)).toBe(Elevation.LEFT);
    expect(Math.max(...reach)).toBe(Elevation.RIGHT);
  });

  it("paints each coat on a face of the picture, and something on every coat", () => {
    for (const coat of [...mountains.behind, ...mountains.front]) {
      expect(coat.shapes.length).toBeGreaterThan(0);
      if (coat.face !== null) {
        expect(faces.all).toContain(coat.face);
      }
      for (const shape of coat.shapes) {
        expect(shape.path).not.toBe("");
        expect(shape.fill ?? shape.stroke).toBeDefined();
      }
    }
  });

  it("keeps the first light for the dawn: the summits' glow and the ridges' rims", () => {
    const dawn = [...mountains.behind, ...mountains.front].filter((coat) => coat.dawn);

    expect(dawn.length).toBeGreaterThanOrEqual(5);
    expect(dawn.some((coat) => coat.face === faces.north)).toBe(true);
    expect(mountains.front.at(-1)?.dawn).toBe(true);
  });

  it("paints the same mountains every time", () => {
    const again = new MenuMountains(new RouteMap(knowledge, elevation), elevation);

    expect(again.behind).toEqual(mountains.behind);
    expect(again.front).toEqual(mountains.front);
  });
});
