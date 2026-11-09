import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { SURE_FOOTED, WALKING, along, climbFrom, openTheGame, savedPlayer, seen } from "./climb";

/**
 * The Khumbu Icefall (#26), Base Camp to Camp 1: the climb sets off from Base Camp's tents at
 * 03:00, climbs the first ladder on its fixed rope, and arrives among Camp 1's tents, where a
 * notice says how long it took. The climber starts 10 m along the flat, under the camera's anchor,
 * a third of the screen from the left and 60% down: 18 px a metre on a screen 360 high
 * (e2e/slope.spec.ts).
 */

/** Red, green, blue and alpha at a point of the canvas. */
async function pixel(page: Page, x: number, y: number): Promise<readonly number[]> {
  return page.evaluate((point) => window.everest.pixelAt(point.x, point.y), { x, y });
}

/** How much redder than blue a point of the canvas is: the snow, the moraine at night and the sky
 * aren't, a tent is. */
async function warmth(page: Page, x: number, y: number): Promise<number> {
  const [red = 0, , blue = 0] = await pixel(page, x, y);
  return red - blue;
}

function notice(page: Page): Locator {
  return page.getByRole("dialog", { name: "Camp 1" });
}

/** How high up the slope the player's climber is, in metres. */
async function height(page: Page): Promise<number> {
  return (await seen(page, "player"))?.y ?? Number.NaN;
}

/** The camp's stretch begins 678.25 m along the ground, 270 m across the picture, on the flat; the
 * climb is saved a step short of it, 3 h 20 min of the mountain's time after setting off, about a
 * typical crossing's, 3 h 27 (#186): 6,667 steps at 36 times play. */
const CAMP_1_EDGE = 678.05;
const CAMP_1_X = 270;
const STEPS_TO_CAMP_1 = 6_667;

test.describe("on a screen of 630 by 360", () => {
  test.use({ viewport: { width: 630, height: 360 } });

  test("the climb sets off from Base Camp at 03:00, its tents behind the climber", async ({
    page,
  }) => {
    await openTheGame(page);

    // The readout says 03:00 for under two seconds of play, which an expect's polls, a second
    // apart, can miss: by then it may say a minute or two past.
    await expect(page.locator("#readout-clock")).toHaveText(/^03:0\d$/);
    await expect(page.locator("#readout-altitude")).toHaveText(/^5,3\d\d m$/);
    await expect(page.locator("#slope")).toHaveAttribute("data-tents", "6", { timeout: 15_000 });
    // A tent stands 3 m behind the climber: 54 px left of the anchor, a few pixels up its canvas.
    await expect.poll(() => warmth(page, 156, 208)).toBeGreaterThan(60);
    expect(await warmth(page, 210, 260)).toBeLessThan(20);
  });

  test("the first ladder, up a wall of ice, is climbed on its fixed rope by the keys", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // At the foot of the ladder up the first block, 33 m along the ground: 5 m up the slope.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 33;
      climb.random = [...SURE_FOOTED];
    });
    await expect.poll(() => height(page)).toBeCloseTo(5, 1);

    // The rope falls into place along the slope as the climb starts: R once it's within reach.
    await expect
      .poll(
        async () => {
          const clipped = (await seen(page, "player"))?.second;
          if (clipped !== "block") {
            await page.keyboard.press("KeyR");
          }
          return clipped;
        },
        { intervals: [500] },
      )
      .toBe("block");
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await expect.poll(async () => (await seen(page, "player"))?.ladder).toBe("block");
    // The block's top is 3 m up the ladder, 8 m up the slope.
    await expect.poll(() => height(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(8);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");

    const player = await seen(page, "player");
    expect(player?.ladder).toBeNull();
    expect(player?.second).toBe("block");
  });
});

test.describe("the arrival at Camp 1", () => {
  test.beforeEach(async ({ page }) => {
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = CAMP_1_EDGE;
      climb.step = STEPS_TO_CAMP_1;
      climb.rules["mountain-clock"].steps = STEPS_TO_CAMP_1;
    });
    await expect.poll(() => along(page, "player")).toBeCloseTo(CAMP_1_X - 0.2, 1);
    await expect(notice(page)).toBeHidden();
  });

  /** What the notice says, and [Continue] closing it. */
  async function expectTheNotice(page: Page): Promise<void> {
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText(/5,8\d\d m · 06:2\d/);
    await expect(notice(page)).toContainText(/Base Camp to Camp 1: 3 h 2\d min\./);
    await expect(notice(page)).toContainText("Climbers take 3 to 7 hours the first time.");
    // The debrief (#194): out after the sun, its verdict, and a line for each thing it counts,
    // the gear check's last (#196).
    await expect(notice(page).locator('[data-text="verdict"]')).toContainText("late");
    await expect(notice(page).locator("dl dt")).toHaveCount(9);
    await expect(notice(page).locator("dl dd").last()).toHaveText("everything checked");
    await notice(page).getByRole("button", { name: "Continue" }).click();
    await expect(notice(page)).toBeHidden();
  }

  test("a step into the camp by the keys brings the notice, and [Continue] closes it", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");

    await page.keyboard.down("KeyD");
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThanOrEqual(CAMP_1_X);
    await page.keyboard.up("KeyD");

    await expectTheNotice(page);
  });

  test("a step into the camp on the joystick brings the notice, and [Continue] closes it", async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "a phone's story");
    const slope = page.locator("#slope");
    const thumb = { pointerId: 7, pointerType: "touch", isPrimary: true };

    await slope.dispatchEvent("pointerdown", { ...thumb, clientX: 100, clientY: 250 });
    await slope.dispatchEvent("pointermove", { ...thumb, clientX: 160, clientY: 250 });
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThanOrEqual(CAMP_1_X);
    await slope.dispatchEvent("pointerup", { ...thumb, clientX: 160, clientY: 250 });

    await expectTheNotice(page);
  });
});
