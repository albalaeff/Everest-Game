import { defineConfig, devices } from "@playwright/test";

/** Headless Chromium has no GPU, and newer builds refuse WebGL in software unless asked: the
 * slope's stories need it drawn. */
const chromium = { args: ["--enable-unsafe-swiftshader"] };

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  // A headless browser draws WebGL in software, on a core or two of its own: more browsers at once
  // than this starve each other of frames, and a tap that waits for a stable frame times out.
  workers: 2,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
  },
  // The stories run against the build, as the preview publishes it.
  webServer: {
    command: "npm run build && npm run preview -- --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"], launchOptions: chromium } },
    { name: "android", use: { ...devices["Pixel 7"], launchOptions: chromium } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
});
