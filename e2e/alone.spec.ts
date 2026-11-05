import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  WALKING,
  along,
  atRest,
  choice,
  openTheGame,
  readTheDisclaimer,
  savedClimb,
} from "./climb";

/**
 * A climb alone, saved on the device as it goes (src/saves): a reload, or a visit tomorrow, goes
 * on from where the climber was, unless the player starts over.
 */

/** The step of the climb saved on the device, or -1 for none. */
async function savedStep(page: Page): Promise<number> {
  return (await savedClimb(page))?.step ?? -1;
}

test("a climb alone goes on after a reload where the climber was, and [Start over] starts anew", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(10.5);
  await page.keyboard.up("KeyD");
  const left = await atRest(page, "player");
  // Saved every ten seconds of play: twenty steps a second.
  await expect.poll(() => savedStep(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(200);

  await readTheDisclaimer(page);
  await choice(page, "Alone").click();

  await expect.poll(() => along(page, "player")).toBeCloseTo(left, 1);
  await readTheDisclaimer(page);
  await choice(page, "Start over").click();
  await expect.poll(() => along(page, "player")).toBeCloseTo(10, 2);
});

test("a first climb offers no [Start over]: there's nothing to start over from", async ({
  page,
}) => {
  await readTheDisclaimer(page);

  await expect(choice(page, "Alone")).toBeVisible();
  await expect(choice(page, "Start over")).toBeHidden();
});
