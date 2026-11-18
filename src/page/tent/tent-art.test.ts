import { describe, expect, it } from "vitest";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { KnowledgeBase } from "../../content/knowledge-base";
import { TentFacts } from "../../content/tent-facts";
import { DwellerHead } from "./dweller-head";
import { TentArt } from "./tent-art";

const { sizes } = new TentFacts(new KnowledgeBase(KNOWLEDGE_FILES));
const art = new TentArt(sizes);

describe("TentArt: the tent cut open from end to end (#258)", () => {
  it("draws the room as long and as high as the knowledge base has the tent, 300 px a metre", () => {
    const top = Math.min(...art.outline.map(([, y]) => y));

    expect((art.room.to - art.room.from) / TentArt.SCALE).toBeCloseTo(sizes.length * 0.96, 2);
    // The fly stands a hand's width over the tent's own peak.
    expect((TentArt.FLOOR - top) / TentArt.SCALE).toBeGreaterThanOrEqual(sizes.height);
    expect((TentArt.FLOOR - top) / TentArt.SCALE).toBeLessThan(sizes.height + 0.1);
    expect((art.end - TentArt.FROM) / TentArt.SCALE).toBeCloseTo(
      sizes.vestibule + sizes.length + sizes.tail,
      6,
    );
    expect(art.end).toBeLessThan(TentArt.VIEW.width);
  });

  it("stands the stove in the vestibule, outside the room, and the seat and the bag inside it", () => {
    expect(TentArt.STOVE).toBeGreaterThan(TentArt.FROM);
    expect(TentArt.STOVE).toBeLessThan(art.room.from);
    expect(art.room.from + TentArt.SEAT_IN).toBeLessThan(art.room.from + TentArt.BAG_IN);
    expect(art.room.from + TentArt.BAG_IN).toBeLessThan(art.room.to);
  });

  it("gives the fly's top over a point of the floor: highest in the middle, the ground outside", () => {
    const middle = (art.room.from + art.room.to) / 2;

    expect(art.roof(middle)).toBeLessThan(art.roof(art.room.from + 20));
    expect(art.roof(middle)).toBeLessThan(art.roof(art.room.to - 20));
    expect(art.roof(TentArt.FROM - 50)).toBe(TentArt.FLOOR);
  });

  it("draws what a tent has in it, and what the game shows or hides", () => {
    const markup = art.markup();

    for (const thing of [
      "tent-stove",
      "tent-pot",
      "tent-flame",
      "tent-boots",
      "tent-crampons",
      "tent-pack",
      "tent-bag",
      "tent-pillow",
      "tent-pad",
      "tent-lamp",
      "tent-loft",
      "tent-pocket",
      "tent-guitar-rest",
      "tent-radio",
      "tent-snow-sack",
      "tent-dweller",
      "tent-sleeper",
    ]) {
      expect(markup).toContain(`class="${thing}`);
    }
    expect(markup.match(/data-bottle=/gu)).toHaveLength(3);
    expect(markup.match(/data-meal=/gu)).toHaveLength(4);
    expect(markup.match(/data-gas=/gu)).toHaveLength(3);
    expect(markup.match(/data-oxygen=/gu)).toHaveLength(3);
  });

  it("draws a guitar with a body, a neck with frets, a head with six pegs and six strings", () => {
    const guitar = TentArt.guitar();

    expect(guitar).toContain("guitar-body");
    expect(guitar).toContain("guitar-frets");
    expect(guitar.match(/v-?6/gu)).toHaveLength(6);
    expect(guitar.split("guitar-strings")[1]?.match(/M-52/gu)).toHaveLength(6);
  });

  it("gives the sleeper in the other bag the same face as the person, its eyes shut", () => {
    const sleeper = art.markup().split('class="tent-sleeper-head"')[1] ?? "";

    expect(sleeper).toContain('id="dw-sleeper-face"');
    expect(sleeper).toContain(`d="${DwellerHead.lid(0, 0).edge}"`);
  });
});
