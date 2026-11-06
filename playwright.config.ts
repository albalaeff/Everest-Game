import { defineConfig, devices } from "@playwright/test";

/** Headless Chromium has no GPU, and newer builds refuse WebGL in software unless asked: the
 * slope's stories need it drawn. */
const chromium = { args: ["--enable-unsafe-swiftshader"] };

const BASE_URL = "http://localhost:4173";

/** Without a GPU, each frame of the slope's canvas is drawn in software and read back on the
 * page's main thread, at a cost that grows with its layers and pixels, and every step of a story
 * waits for one: on CI's two cores, a PC's frame on High took a third of a second and a tap five
 * seconds (#154). So the stories draw on Low, as the device keeps it, but for the picture's own
 * (e2e/slope.spec.ts). */
const LOW_GRAPHICS = {
  cookies: [],
  origins: [{ origin: BASE_URL, localStorage: [{ name: "everest.graphics", value: "low" }] }],
};

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  // A headless browser draws WebGL in software, on a core or two of its own: more browsers at once
  // than this starve each other of frames, and a tap that waits for a stable frame times out.
  workers: 2,
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    storageState: LOW_GRAPHICS,
  },
  // The stories run against the build, as the preview publishes it, and the rooms' against the
  // room server as `wrangler dev` serves it on this machine (e2e/room.spec.ts).
  webServer: [
    {
      command: "npm run build && npm run preview -- --strictPort",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run room",
      url: "http://localhost:8787",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "pc", use: { ...devices["Desktop Chrome"], launchOptions: chromium } },
    { name: "android", use: { ...devices["Pixel 7"], launchOptions: chromium } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
});
