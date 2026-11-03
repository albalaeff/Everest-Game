import { describe, expect, it } from "vitest";

import { ModuleCode } from "../simulation/testing/module-code";

const PHYSICS = new URL("./", import.meta.url);
const CORE = new URL("../simulation/", import.meta.url);
const code = new ModuleCode(PHYSICS);

// The slope physics runs inside the core's step, so it keeps the core's rules for the same result
// everywhere (docs/conventions/slope-physics.md).
describe("The slope physics", () => {
  it("has files to check", () => {
    expect(code.files.map(([file]) => file.href)).toContain(
      new URL("slope-physics.ts", PHYSICS).href,
    );
  });

  it.each(ModuleCode.FORBIDDEN)("doesn't use %s", (_, pattern) => {
    expect(code.using(pattern)).toEqual([]);
  });

  it("imports nothing but itself and the core: no dependency, and none of the modules above", () => {
    expect(code.importsOutside([PHYSICS, CORE])).toEqual([]);
  });
});
