import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
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
    { name: "pc", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
});
