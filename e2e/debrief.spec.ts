import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { climberScreen, climbFrom, openTheGame, savedPlayer, seen } from "./climb";

/**
 * The end of the climb (#194): the sun clock on the HUD counts down to the sun on the ice from the
 * 03:00 start; and a climber who walks the ramp of blue ice down to the maze's big crevasse
 * unclipped slips, slides over its lip and dies, the notice says so with the debrief, and
 * [Start over] sets off a new climb.
 */

/** The notice at the end of the climb. */
const notice = (page: Page) => page.locator("#camp");

test.describe("on a screen of 630 by 360", () => {
  test.use({ viewport: { width: 630, height: 360 } });

  test("the sun clock counts down to the sun on the ice from the 03:00 start", async ({ page }) => {
    await openTheGame(page);

    await expect(page.locator("#readout-sun")).toHaveText(/^in 2 h 5\d min$|^in 3 h 00 min$/, {
      timeout: 15_000,
    });
    await expect(page.locator("#readout-sun-box")).toHaveAttribute("data-state", "cold");
  });

  test("an unclipped slip on the ice ramp kills the climber, the debrief says why, and [Start over] sets off anew", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // On the ramp of blue ice down to the big crevasse's lip at 340 m along, unclipped.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 334;
    });
    await expect.poll(async () => (await seen(page, "player"))?.x ?? 0).toBeGreaterThan(148);

    await page.keyboard.down("KeyD");
    await expect
      .poll(async () => (await seen(page, "player"))?.falling, { timeout: 30_000 })
      .toBe(true);
    await page.keyboard.up("KeyD");

    await expect(notice(page)).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("#camp-title")).toHaveText("You died");
    await expect(notice(page).locator('[data-text="verdict"]')).toContainText(
      "no rope to hold you",
    );
    await expect(notice(page).locator("dl dt")).toHaveCount(8);
    await notice(page).getByRole("button", { name: "Start over" }).click();
    // The page opens anew on its disclaimer, and past it straight on Your climber: no start menu.
    await page.getByRole("button", { name: "I understand" }).click({ timeout: 20_000 });

    await expect(climberScreen(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#start")).toBeHidden();
  });
});
