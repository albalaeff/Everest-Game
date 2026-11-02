import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const FOLDER = new URL("./", import.meta.url);
const STAND_INS = new URL("testing/", FOLDER);

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
  ["text handling that differs by device", /\blocaleCompare\b|\btoLocale\w+\b|\bIntl\b/],
];

/** The core's own files, in every folder of it, without their comments. */
const sources = readdirSync(FOLDER, { encoding: "utf8", recursive: true })
  .map((name) => new URL(name, FOLDER))
  .filter(({ href }) => href.endsWith(".ts") && !href.endsWith(".test.ts"))
  .filter(({ href }) => !href.startsWith(STAND_INS.href))
  .map((file) => {
    const text = readFileSync(file, "utf8");
    return [file, text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")] as const;
  });

describe("The simulation core", () => {
  it("has files to check", () => {
    expect(sources.map(([file]) => file.href)).toContain(new URL("expedition.ts", FOLDER).href);
  });

  it.each(FORBIDDEN)("doesn't use %s", (_, pattern) => {
    const users = sources.filter(([, code]) => pattern.test(code));

    expect(users.map(([file]) => file.pathname)).toEqual([]);
  });

  it("imports nothing but itself: no dependency, and none of the modules above it", () => {
    const outside = sources.flatMap(([file, code]) =>
      [...code.matchAll(/\b(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g)]
        .map((found) => found[1] ?? "")
        .filter((path) => {
          const target = new URL(path, file).href;
          return (
            !path.startsWith(".") ||
            !target.startsWith(FOLDER.href) ||
            target.startsWith(STAND_INS.href)
          );
        })
        .map((path) => `${file.pathname}: ${path}`),
    );

    expect(outside).toEqual([]);
  });
});
