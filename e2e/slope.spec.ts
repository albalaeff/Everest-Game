import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { openTheGame } from "./climb";

/**
 * The slope as the page draws it. Playwright can't read a WebGL canvas, so the scene writes what
 * it draws into `#slope`'s data attributes, and `window.everest.pixelAt` reads a pixel back.
 */

/** What the scene says of itself in `#slope`'s data attributes. */
async function drawn(page: Page, what: string): Promise<string> {
  return (await page.locator("#slope").getAttribute(`data-${what}`)) ?? "";
}

async function number(page: Page, what: string): Promise<number> {
  return Number(await drawn(page, what));
}

/** A pair of metres, as `data-camera` and `data-climber` give them. */
async function pair(page: Page, what: string): Promise<[number, number]> {
  const [x, y] = (await drawn(page, what)).split(" ").map(Number);
  return [x ?? Number.NaN, y ?? Number.NaN];
}

/** Red, green, blue and alpha at a point of the canvas. */
async function pixel(page: Page, x: number, y: number): Promise<readonly number[]> {
  return page.evaluate((point) => window.everest.pixelAt(point.x, point.y), { x, y });
}

async function brightness(page: Page, x: number, y: number): Promise<number> {
  const [red = 0, green = 0, blue = 0] = await pixel(page, x, y);
  return (red + green + blue) / 3;
}

/** How many of the points are darker than `below`: a snowflake may be over one of them. */
async function darkAmong(page: Page, points: readonly [number, number][], below: number) {
  let dark = 0;
  for (const [x, y] of points) {
    if ((await brightness(page, x, y)) < below) {
      dark += 1;
    }
  }
  return dark;
}

function graphics(page: Page): Locator {
  return page.locator("#graphics");
}

async function waitForFrames(page: Page, atLeast: number): Promise<void> {
  await expect.poll(() => number(page, "frames"), { timeout: 15_000 }).toBeGreaterThan(atLeast);
}

declare global {
  interface Window {
    everest: { pixelAt(x: number, y: number): readonly number[] };
  }
}

test.describe("on a screen of 630 by 360", () => {
  // 630 wide puts the camera's anchor at a whole pixel, 210: a third from the left.
  test.use({ viewport: { width: 630, height: 360 } });

  test("the slope is drawn in a canvas that fills the screen, frame after frame", async ({
    page,
  }) => {
    await openTheGame(page);

    const canvas = page.locator("#slope canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).toMatchObject({ x: 0, y: 0, width: 630, height: 360 });
    await waitForFrames(page, 10);
    await expect(page.locator("#fps")).toHaveText(/^\d+ fps$/, { timeout: 15_000 });
  });

  test("the sky is dark above, and the snow bright under the climber's feet", async ({ page }) => {
    await openTheGame(page);
    await waitForFrames(page, 1);

    const sky: [number, number][] = [
      [500, 8],
      [540, 8],
      [580, 8],
    ];
    expect(await darkAmong(page, sky, 90)).toBeGreaterThanOrEqual(2);
    expect(await brightness(page, 210, 260)).toBeGreaterThan(200);
  });

  test("every climber in the expedition is drawn, and the camera starts on the player", async ({
    page,
  }) => {
    await openTheGame(page);
    await waitForFrames(page, 1);

    expect(await drawn(page, "climbers")).toBe("2");
    expect(await pair(page, "climber")).toEqual([10, 0]);
    expect(await pair(page, "camera")).toEqual([10, 0]);
  });

  test("the camera follows the climber as they walk, and settles on them", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);
    await waitForFrames(page, 1);

    await page.keyboard.down("KeyD");
    await expect.poll(async () => (await pair(page, "climber"))[0]).toBeGreaterThan(10.5);
    await page.keyboard.up("KeyD");

    const [climberX] = await pair(page, "climber");
    expect(climberX).toBeGreaterThan(10.5);
    await expect
      .poll(async () => {
        const [cameraX] = await pair(page, "camera");
        return Math.abs(cameraX - climberX);
      })
      .toBeLessThan(0.05);
  });

  test("a click lands on the slope where the camera shows it, to the centimetre", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);
    await waitForFrames(page, 1);

    // The anchor is 12 m below the top of the screen; 90 px to the right of it is 5 m. Below the
    // climber's feet, the click is the crampons'.
    await page.mouse.click(210, 0);
    await page.mouse.click(300, 216);
    await page.mouse.click(201, 234);

    await expect(page.locator("#received li")).toHaveText([
      "tool crampons 9.5 -1",
      "tool ice-axe 15 0",
      "tool ice-axe 10 12",
    ]);
  });
});

test.describe("the graphics setting", () => {
  test("starts on High on a PC: every layer and all the snow", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);
    await waitForFrames(page, 1);

    await expect(graphics(page)).toHaveText("Graphics: High");
    expect(await drawn(page, "layers")).toBe("7");
    expect(await drawn(page, "flakes")).toBe("300");
  });

  test("starts on Medium on a phone: fewer layers and less snow", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    await waitForFrames(page, 1);

    await expect(graphics(page)).toHaveText("Graphics: Medium");
    expect(await drawn(page, "layers")).toBe("5");
    expect(await drawn(page, "flakes")).toBe("120");
  });

  test("steps through the levels at each press, and keeps the choice on the device", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);
    await waitForFrames(page, 1);

    await graphics(page).click();
    await expect(graphics(page)).toHaveText("Graphics: Low");
    await expect(page.locator("#slope")).toHaveAttribute("data-layers", "3");
    await expect(page.locator("#slope")).toHaveAttribute("data-flakes", "0");
    await graphics(page).click();
    await expect(graphics(page)).toHaveText("Graphics: Medium");
    await expect(page.locator("#slope")).toHaveAttribute("data-layers", "5");
    await expect(page.locator("#slope")).toHaveAttribute("data-flakes", "120");
    await openTheGame(page);

    await expect(graphics(page)).toHaveText("Graphics: Medium");
    await waitForFrames(page, 1);
    expect(await drawn(page, "layers")).toBe("5");
  });
});
