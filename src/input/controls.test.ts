import { describe, expect, it } from "vitest";

import texts from "../../content/controls.json";
import { CONTROLS, STEERING_KEYS, TOOL_BUTTONS } from "./controls";

describe("The controls table", () => {
  const keys = [
    ...CONTROLS.flatMap((control) => control.keys),
    ...Object.values(STEERING_KEYS).flat(),
  ];

  it("gives no key to two actions", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives no gamepad button to two actions", () => {
    const buttons = [
      ...CONTROLS.map((control) => control.gamepadButton),
      ...TOOL_BUTTONS.map((row) => row.button),
    ];

    expect(new Set(buttons).size).toBe(buttons.length);
  });

  it("keeps Ctrl out: Ctrl+W closes the browser's tab, and a page can't stop it", () => {
    expect(keys.filter((key) => key.startsWith("Control"))).toEqual([]);
  });

  it("names each button in Russian and English", () => {
    for (const { name } of CONTROLS) {
      expect(texts.en[name]).not.toBe("");
      expect(texts.ru[name]).not.toBe("");
    }
  });

  it("has a text in both languages for everything the other has", () => {
    expect(Object.keys(texts.ru).sort()).toEqual(Object.keys(texts.en).sort());
  });
});
