import { defineConfig } from "@playwright/test";

import config from "./playwright.config";

/** The temporary probe of #154 (e2e/probe.ts), on the stories' servers and projects. */
export default defineConfig({ ...config, testMatch: "probe.ts", workers: 1 });
