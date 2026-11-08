import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { WALKING, along, climbFrom, openTheGame, savedPlayer, seen } from "./climb";

/**
 * The coach (#192): a tip at a time, in the player's own controls, where the route first needs it.
 * The climb sets off with the walk's tip, a keyboard's keys on a PC and the thumb's on a phone,
 * and walking a few metres takes it away; at the first rope it says how to clip to it, until the
 * player does.
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

test.describe("on a screen of 630 by 360", () => {
  test.use({ viewport: { width: 630, height: 360 } });

  test("the climb sets off with the walk, in the device's own controls, and walking takes it away", async ({
    page,
    hasTouch,
  }) => {
    await openTheGame(page);

    await expect(coach(page)).toBeVisible({ timeout: 15_000 });
    await expect(coach(page)).toHaveAttribute("data-tip", "walk");
    await expect(coach(page)).toContainText(hasTouch ? "Drag your left thumb" : "Hold D to walk");
    if (hasTouch) {
      return;
    }
    await page.keyboard.down("KeyD");
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(13.5);
    await page.keyboard.up("KeyD");
    await expect(coach(page)).not.toHaveAttribute("data-tip", "walk", { timeout: 10_000 });
  });

  test("at the first rope the coach says how to clip to it, and clipping takes it away", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // On the first slope, a few metres up from Crampon Point, by the first rope.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 24;
    });

    await expect(coach(page)).toHaveAttribute("data-tip", "clip", { timeout: 20_000 });
    await expect(coach(page)).toContainText("press R");
    await expect
      .poll(
        async () => {
          if ((await seen(page, "player"))?.second === null) {
            await page.keyboard.press("KeyR");
          }
          return (await seen(page, "player"))?.second;
        },
        { intervals: [1_000], timeout: 20_000 },
      )
      .toBe("approach");
    await expect(coach(page)).not.toHaveAttribute("data-tip", "clip", { timeout: 10_000 });
  });
});
