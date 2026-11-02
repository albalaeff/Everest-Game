import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const FOLDER = new URL("./", import.meta.url);

// tsconfig.core.json keeps the DOM, Node and timers out of the core; these are what the language
// itself offers, and the core may not use (docs/conventions/simulation-core.md).
const FORBIDDEN: [string, RegExp][] = [
  ["Math.random", /\bMath\.random\b/],
  ["the wall clock", /\bDate\b/],
  [
    "maths whose last digits differ between browsers",
    /\bMath\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot)\b/,
  ],
  ["the ** operator, which is Math.pow", /\*\*/],
];

/** The core's own files, without their comments. */
const sources = readdirSync(FOLDER)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => {
    const text = readFileSync(new URL(name, FOLDER), "utf8");
    return [name, text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")] as const;
  });

describe("The simulation core", () => {
  it("has files to check", () => {
    expect(sources.map(([name]) => name)).toContain("expedition.ts");
  });

  it.each(FORBIDDEN)("doesn't use %s", (_, pattern) => {
    expect(sources.filter(([, code]) => pattern.test(code)).map(([name]) => name)).toEqual([]);
  });

  it("imports nothing but itself: no dependency, and none of the modules above it", () => {
    const outside = sources.flatMap(([name, code]) =>
      [...code.matchAll(/\bfrom\s+"([^"]+)"/g)]
        .map((found) => found[1] ?? "")
        .filter((path) => !path.startsWith("./") || path.includes("/testing"))
        .map((path) => `${name}: ${path}`),
    );

    expect(outside).toEqual([]);
  });
});
