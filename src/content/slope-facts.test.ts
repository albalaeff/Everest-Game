import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { SlopeFacts } from "./slope-facts";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const { settings } = new SlopeFacts(knowledge);
const number = (id: string): number => knowledge.number(id);
const range = (id: string) => knowledge.range(id);

describe("SlopeFacts: the slope physics' numbers from the knowledge base", () => {
  it("takes gravity and the snow's friction from their facts", () => {
    const friction = range("technique.snow-friction");

    expect(settings.gravity).toBe(number("technique.gravity"));
    expect(settings.friction).toBeGreaterThanOrEqual(friction.min);
    expect(settings.friction).toBeLessThanOrEqual(friction.max);
    expect(settings.friction).toBe(number("technique.snow-friction"));
  });

  it("stops a slide by itself only on ground gentler than about 19°, as the self-arrest question says", () => {
    const degrees = (Math.atan(settings.friction) * 180) / Math.PI;

    expect(Math.round(degrees)).toBe(19);
  });

  it("costs each gradient's steps what Minetti et al. measured, and costs uphill more than down", () => {
    const { min, max } = range("technique.walking-cost-gradients");
    const [steepDown, least, level, , steepUp] = settings.walkingCost;

    expect(steepDown).toEqual([min, number("technique.walking-cost-steep-down")]);
    expect(least).toEqual([
      number("technique.walking-cost-least-gradient"),
      number("technique.walking-cost-least"),
    ]);
    expect(level).toEqual([0, number("technique.walking-cost-level")]);
    expect(steepUp).toEqual([max, number("technique.walking-cost-steep-up")]);
    expect(min).toBe(-max);
    expect(number("technique.walking-cost-steep-down")).toBeLessThan(
      number("technique.walking-cost-steep-up") / 4,
    );
  });

  it("costs each metre of height the same from the gradient the muscles work at their efficiency, up", () => {
    const efficient = number("technique.walking-efficiency-gradient");
    const { max } = range("technique.walking-cost-gradients");
    const sine = (gradient: number): number => gradient / Math.sqrt(1 + gradient * gradient);
    const [gradient, cost] = settings.walkingCost[3] ?? [0, 0];

    expect(gradient).toBe(efficient);
    expect(cost / sine(efficient)).toBeCloseTo(
      number("technique.walking-cost-steep-up") / sine(max),
      12,
    );
    expect(settings.walkingCost).toHaveLength(5);
  });

  it("walks on the fitted power, no faster than the fitted fastest walk, up to the Icefall's steepest", () => {
    expect(settings.walkingPower).toBe(number("technique.walking-power"));
    expect(settings.fastestWalk).toBe(number("technique.fastest-walk"));
    expect(settings.steepest).toBe(range("route.icefall-steepness").max);
  });

  it("slips nowhere up to the slip-free steepness, and at the fitted chance on the steepest", () => {
    const steepest = range("route.icefall-steepness").max;
    const slipFree = number("technique.slip-free-steepness");
    const chance = number("technique.slip-chance-steep");

    expect(settings.slipChance).toEqual([
      [-steepest, chance],
      [-slipFree, 0],
      [slipFree, 0],
      [steepest, chance],
    ]);
    expect(slipFree).toBeGreaterThan(range("route.icefall-steepness").min);
    expect(slipFree).toBeLessThan(steepest);
  });

  it("crosses, climbs and comes down a ladder at the fitted speeds, slipping at one chance", () => {
    expect(settings.ladderSpeed).toEqual([
      [-SlopeFacts.WALL, number("technique.ladder-speed-down")],
      [0, number("technique.ladder-speed-across")],
      [SlopeFacts.WALL, number("technique.ladder-speed-up")],
    ]);
    expect(settings.ladderSlipChance).toEqual([[0, number("technique.ladder-slip-chance")]]);
  });

  it("reaches, knocks and arrests by the records", () => {
    expect(settings.cowstail).toBe(number("technique.cowstail-reach"));
    expect(settings.knock).toBe(number("technique.knock-speed"));
    expect(settings.arrestSpeed).toBe(number("technique.arrest-speed"));
    expect(settings.axeReach).toBe(number("technique.axe-reach"));
  });
});
