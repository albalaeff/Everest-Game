import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { SURE_FOOTED, climbFrom, savedPlayer } from "./climb";

/**
 * What jolts a climber (#197), as a player meets it: a gust on its way across the Icefall, which
 * the coach warns of, to stop and stay clipped, and Pemba calls too. The story stages the gust's
 * warning in the save, long enough to read, where the climber stands.
 */

/** The coach's card, and Pemba's bubble, on the page. */
const coach = (page: Page) => page.locator("#coach");
const bubble = (page: Page) => page.locator("#sherpa");

test("a gust on its way: the coach says to stop and stay clipped, and Pemba calls it", async ({
  page,
}) => {
  await climbFrom(page, (climb) => {
    savedPlayer(climb).along = 30;
    climb.random = [...SURE_FOOTED];
    const { jolts } = climb.rules;
    if (jolts !== undefined) {
      const { step } = climb;
      jolts.warnings = [{ zone: "icefall-wind", kind: "gust", began: step, comes: step + 100_000 }];
    }
  });

  await expect(coach(page)).toHaveAttribute("data-tip", "gust", { timeout: 20_000 });
  await expect(coach(page)).toHaveAttribute("data-kind", "warning");
  await expect(coach(page)).toContainText("A gust is coming");
  await expect(page.locator('#sherpa[data-cue="gust"]')).toBeVisible({ timeout: 15_000 });
  await expect(bubble(page).locator('[data-text="said"]')).toContainText(/Wind/);
});
