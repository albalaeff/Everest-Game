import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.ts"],
  extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      project: ["./tsconfig.json", "./tsconfig.node.json", "./tsconfig.worker.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    // A number reads as itself in a message: `${moment.step}` needs no String().
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    // `expect(() => expedition.advance(...))`: the shorthand's void is nobody's confusion.
    "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
  },
});
