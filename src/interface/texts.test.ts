import { describe, expect, it } from "vitest";

import { Texts } from "./texts";

const texts = new Texts<string>({
  took: "Base Camp to Camp 1: {time}.",
  duration: "{hours} h {minutes} min",
  plain: "Continue",
});

describe("Texts", () => {
  it("says a text with its fills filled in, numbers too", () => {
    const time = texts.say("duration", { hours: 4, minutes: 50 });

    expect(time).toBe("4 h 50 min");
    expect(texts.say("took", { time })).toBe("Base Camp to Camp 1: 4 h 50 min.");
  });

  it("writes a number as English does, the thousands marked, until the language switch (#89)", () => {
    const peak = new Texts({ peak: "A {peak} m peak first" });

    expect(peak.say("peak", { peak: 7000 })).toBe("A 7,000 m peak first");
  });

  it("says a text with no fills as it is", () => {
    expect(texts.say("plain")).toBe("Continue");
  });

  it("refuses a name it has no text for", () => {
    expect(() => texts.say("missing")).toThrow(RangeError);
  });
});
