import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths: GitHub Pages serves the game under /Everest-Game/, and itch.io under its own.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
