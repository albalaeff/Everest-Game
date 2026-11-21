import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { SlopeFacts } from "./slope-facts";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const { settings } = new SlopeFacts(knowledge);
const number = (id: string): number => knowledge.number(id);
const range = (id: string) => knowledge.range(id);
/** How many times faster than in life the game goes over the drawn ground: the clock runs
 * `time.compression` times faster than play, on ground drawn at 1/`route.drawn-scale`. */
const speedUp = number("time.compression") / number("route.drawn-scale");

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

  it("goes faster than in life over the drawn ground, as the clock runs faster than the drawing's scale", () => {
    expect(speedUp).toBeGreaterThan(1);
  });

  it("walks on the fitted power, no faster than the fitted fastest walk, both sped up, up to the Icefall's steepest", () => {
    expect(settings.walkingPower).toBe(number("technique.walking-power") * speedUp);
    expect(settings.fastestWalk).toBe(number("technique.fastest-walk") * speedUp);
    expect(settings.uphillCostShare).toBe(number("technique.uphill-cost-share"));
    expect(settings.steepest).toBe(range("route.icefall-steepness").max);
  });

  it("never slips on snow up to the slip-free steepness, and on the steepest at the fitted chance a metre, as in life (#208)", () => {
    const steepest = range("route.icefall-steepness").max;
    const slipFree = number("technique.slip-free-steepness");
    const chance = number("technique.slip-steep");

    expect(settings.slipChance).toEqual([
      [-steepest, chance],
      [-slipFree, 0],
      [slipFree, 0],
      [steepest, chance],
    ]);
    expect(slipFree).toBeGreaterThan(range("route.icefall-steepness").min);
    expect(slipFree).toBeLessThan(steepest);
  });

  it("crosses and climbs a ladder at the fitted speeds sped up, and comes down it slower than up, slipping at one chance a metre", () => {
    const up = number("technique.ladder-speed-up") * speedUp;

    expect(settings.ladderSpeed).toEqual([
      [-SlopeFacts.WALL, up * (1 - number("technique.ladder-down-slower"))],
      [0, number("technique.ladder-speed-across") * speedUp],
      [SlopeFacts.WALL, up],
    ]);
    expect(settings.ladderSlipChance).toEqual([[0, number("technique.ladder-slip")]]);
  });

  it("costs a metre down a ladder the middle of what the sources measured of a metre up it (#256)", () => {
    const { min, max } = range("technique.ladder-down-cost");

    expect(settings.ladderDownCost).toBeCloseTo((min + max) / 2, 10);
    expect(settings.ladderDownCost).toBeGreaterThan(0.5);
    expect(settings.ladderDownCost).toBeLessThan(0.75);
  });

  it("slips on blue ice and a bouncing ladder at the fitted chances a metre, its bounce dying away sped up, and lands at life size", () => {
    const { footing } = settings;

    expect(footing.ice).toBe(number("technique.ice-slip"));
    expect(footing.iceSteep).toBe(number("technique.ice-slip-steep"));
    expect(footing.iceFriction).toBe(number("technique.ice-friction"));
    expect(footing.iceFriction).toBeLessThan(settings.friction);
    expect(footing.bounce).toEqual({
      excite: number("technique.ladder-bounce-excite"),
      damp: number("technique.ladder-bounce-damp") * speedUp,
      slip: number("technique.ladder-bounce-slip"),
      held: number("technique.ladder-bounce-held"),
    });
    expect(footing.bounce.held).toBeGreaterThan(0);
    expect(footing.bounce.held).toBeLessThan(1);
    expect(settings.lethalLanding).toBe(number("technique.lethal-landing"));
    expect(settings.climbBack).toBe(number("technique.climb-back-speed") * speedUp);
  });

  it("reaches, knocks and arrests by the records, at life size as the falls are", () => {
    expect(settings.cowstail).toBe(number("technique.cowstail-reach"));
    expect(settings.knock).toBe(number("technique.knock-speed"));
    expect(settings.arrestSpeed).toBe(number("technique.arrest-speed"));
    expect(settings.axeReach).toBe(number("technique.axe-reach"));
  });
});
