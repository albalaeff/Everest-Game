import { devices, test } from "@playwright/test";
import type { BrowserContextOptions, Page } from "@playwright/test";

import { openTheGame } from "./climb";

/**
 * A temporary probe for #154, out before the merge: on CI's runner, how many frames Chromium
 * draws, how often the page's main thread is free, and how long a tap takes, as the page is and
 * with each of its costs taken out in turn. Its own config runs it: `npx playwright test --config
 * probe.config.ts` (the job `probe`).
 */

interface Variant {
  /** Chromium's flags, beside the config's. */
  readonly flags?: readonly string[];
  /** Chromium's new headless mode instead of the headless shell. */
  readonly channel?: string;
  /** A style over the page's. */
  readonly style?: string;
  /** Device pixels per CSS pixel, instead of the device's. */
  readonly scale?: number;
  /** The graphics level kept on the device. */
  readonly quality?: string;
  /** WebGL drawn without antialias. */
  readonly noAntialias?: boolean;
  /** Pages drawing at once, each in a context of its own, as a room's story has them. */
  readonly pages?: number;
}

const NO_BLUR = "* { backdrop-filter: none !important; }";

const ANGLE = ["--use-angle=swiftshader"];

const VARIANTS: Record<string, Variant> = {
  "as the page is": {},
  "no backdrop blur": { style: NO_BLUR },
  "the canvas not shown": { style: "#slope canvas { display: none !important; }" },
  "no antialias": { noAntialias: true },
  "1 device pixel a CSS pixel": { scale: 1 },
  "graphics Low": { quality: "low" },
  "GPU compositing off": { flags: ["--disable-gpu-compositing"] },
  "new headless": { channel: "chromium" },
  "ANGLE on SwiftShader": { flags: ANGLE },
  "ANGLE on SwiftShader, graphics Low": { flags: ANGLE, quality: "low" },
  "two pages at once": { pages: 2 },
  "two pages, ANGLE on SwiftShader": { pages: 2, flags: ANGLE },
};

interface Busy {
  readonly frames: number;
  readonly tasks: number;
}

/** Frames drawn and main-thread tasks run in three seconds. */
async function busy(page: Page): Promise<Busy> {
  return page.evaluate(
    () =>
      new Promise<Busy>((resolve) => {
        const channel = new MessageChannel();
        let tasks = 0;
        let frames = 0;
        const end = performance.now() + 3000;
        const counting = (): void => {
          frames += 1;
          if (performance.now() < end) {
            requestAnimationFrame(counting);
          }
        };
        requestAnimationFrame(counting);
        channel.port1.onmessage = () => {
          tasks += 1;
          if (performance.now() < end) {
            channel.port2.postMessage(0);
          } else {
            resolve({ frames, tasks });
          }
        };
        channel.port2.postMessage(0);
      }),
  );
}

async function renderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "?";
    return `${name}, ${navigator.hardwareConcurrency} cores`;
  });
}

for (const [label, variant] of Object.entries(VARIANTS)) {
  test(`probe: ${label}`, async ({ playwright, baseURL, hasTouch, browserName }) => {
    test.skip(browserName !== "chromium");
    const browser = await playwright.chromium.launch({
      args: ["--enable-unsafe-swiftshader", ...(variant.flags ?? [])],
      ...(variant.channel === undefined ? {} : { channel: variant.channel }),
    });
    const device = hasTouch ? devices["Pixel 7"] : devices["Desktop Chrome"];
    const options: BrowserContextOptions = {
      ...device,
      ...(hasTouch ? { viewport: { width: 640, height: 360 } } : {}),
      ...(variant.scale === undefined ? {} : { deviceScaleFactor: variant.scale }),
      ...(baseURL === undefined ? {} : { baseURL }),
    };
    const pages: Page[] = [];
    for (let count = 0; count < (variant.pages ?? 1); count += 1) {
      const context = await browser.newContext(options);
      if (variant.quality !== undefined) {
        await context.addInitScript((level) => {
          localStorage.setItem("everest.graphics", level);
        }, variant.quality);
      }
      if (variant.noAntialias === true) {
        await context.addInitScript(() => {
          const prototype = HTMLCanvasElement.prototype;
          const original = Reflect.get(prototype, "getContext") as (...args: unknown[]) => unknown;
          Object.defineProperty(prototype, "getContext", {
            value: function (this: HTMLCanvasElement, kind: string, attributes?: object) {
              return original.call(this, kind, { ...attributes, antialias: false });
            },
          });
        });
      }
      const page = await context.newPage();
      await openTheGame(page);
      if (variant.style !== undefined) {
        await page.addStyleTag({ content: variant.style });
      }
      if (hasTouch) {
        await page.locator("#slope").tap({ position: { x: 400, y: 130 } });
      }
      pages.push(page);
    }
    const [first] = pages;
    if (first === undefined) {
      throw new Error("no page");
    }
    await first.waitForTimeout(1000);
    const found = await Promise.all(pages.map(busy));
    const radio = first.locator('[data-control="radio"]');
    const start = Date.now();
    for (let round = 0; round < 3; round += 1) {
      await (hasTouch ? radio.tap() : radio.click());
    }
    const tap = (Date.now() - start) / 3;
    const frames = found.map(({ frames }) => (frames / 3).toFixed(1)).join(" and ");
    const tasks = found.map(({ tasks }) => Math.round(tasks / 3)).join(" and ");
    console.log(
      `PROBE ${test.info().project.name} | ${label} | ${frames} frames/s | ${tasks} tasks/s | ${tap.toFixed(0)} ms a tap | ${await renderer(first)}`,
    );
    await browser.close();
  });
}
