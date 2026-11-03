import { readFileSync, readdirSync } from "node:fs";

/**
 * A module's own code, in every folder of it but `testing/`, without its tests and its comments:
 * what the purity tests hold to the rules for the code that runs inside the simulation's step
 * (docs/conventions/simulation-core.md → The same result everywhere). It isn't game code: only
 * tests import it.
 */
export class ModuleCode {
  /** What the language itself offers, and the code of the step may not use. tsconfig.core.json
   * keeps the DOM, Node and timers out of it. */
  static readonly FORBIDDEN: readonly (readonly [string, RegExp])[] = [
    ["Math.random", /\bMath\.random\b/],
    ["the wall clock", /\bDate\b/],
    [
      "maths whose last digits differ between browsers",
      /\bMath\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot)\b/,
    ],
    ["the ** operator, which is Math.pow", /\*\*/],
    ["text handling that differs by device", /\blocaleCompare\b|\btoLocale\w+\b|\bIntl\b/],
  ];

  private readonly standIns: URL;
  /** Each file, with its code stripped of comments. */
  readonly files: readonly (readonly [URL, string])[];

  constructor(readonly folder: URL) {
    this.standIns = new URL("testing/", folder);
    this.files = readdirSync(folder, { encoding: "utf8", recursive: true })
      .map((name) => new URL(name, folder))
      .filter(({ href }) => href.endsWith(".ts") && !href.endsWith(".test.ts"))
      .filter(({ href }) => !href.startsWith(this.standIns.href))
      .map((file) => {
        const text = readFileSync(file, "utf8");
        return [file, text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")] as const;
      });
  }

  /** The files whose code `pattern` finds something in. */
  using(pattern: RegExp): string[] {
    return this.files.filter(([, code]) => pattern.test(code)).map(([file]) => file.pathname);
  }

  /** Each import of a dependency, or of a file outside `modules` or in a stand-in's folder. */
  importsOutside(modules: readonly URL[]): string[] {
    return this.files.flatMap(([file, code]) =>
      [...code.matchAll(/\b(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g)]
        .map((found) => found[1] ?? "")
        .filter((path) => {
          // With a slash, `../simulation`, which is its index, is inside the folder too.
          const target = `${new URL(path, file).href}/`;
          return (
            !path.startsWith(".") ||
            !modules.some((module) => target.startsWith(module.href)) ||
            modules.some((module) => target.startsWith(new URL("testing/", module).href))
          );
        })
        .map((path) => `${file.pathname}: ${path}`),
    );
  }
}
