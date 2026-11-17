import { describe, expect, it } from "vitest";

import godTexts from "../../content/god.json";
import { GOD_TEXTS } from "./god-panel";

describe("GodPanel's words", () => {
  it("has every word of the god mode's panel in English and Russian, and none it doesn't say (#245)", () => {
    expect(Object.keys(godTexts.en).sort()).toEqual([...GOD_TEXTS].sort());
    expect(Object.keys(godTexts.ru).sort()).toEqual([...GOD_TEXTS].sort());
  });
});
