import { describe, expect, it } from "vitest";

import { ModuleCode } from "./testing/module-code";

const CORE = new URL("./", import.meta.url);
const code = new ModuleCode(CORE);

describe("The simulation core", () => {
  it("has files to check", () => {
    expect(code.files.map(([file]) => file.href)).toContain(new URL("expedition.ts", CORE).href);
  });

  it.each(ModuleCode.FORBIDDEN)("doesn't use %s", (_, pattern) => {
    expect(code.using(pattern)).toEqual([]);
  });

  it("imports nothing but itself: no dependency, and none of the modules above it", () => {
    expect(code.importsOutside([CORE])).toEqual([]);
  });
});
