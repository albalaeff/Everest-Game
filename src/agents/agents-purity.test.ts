import { describe, expect, it } from "vitest";

import { ModuleCode } from "../simulation/testing/module-code";

const AGENTS = new URL("./", import.meta.url);
const PHYSICS = new URL("../physics/", import.meta.url);
const CORE = new URL("../simulation/", import.meta.url);
const code = new ModuleCode(AGENTS);

// The agents run inside the core's step, so they keep the core's rules for the same result
// everywhere (docs/conventions/agents.md).
describe("The agents", () => {
  it("have files to check", () => {
    expect(code.files.map(([file]) => file.href)).toContain(new URL("sherpa.ts", AGENTS).href);
  });

  it.each(ModuleCode.FORBIDDEN)("don't use %s", (_, pattern) => {
    expect(code.using(pattern)).toEqual([]);
  });

  it("import nothing but themselves, the slope physics and the core", () => {
    expect(code.importsOutside([AGENTS, PHYSICS, CORE])).toEqual([]);
  });
});
