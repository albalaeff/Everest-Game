import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { WALKING, along, atRest, openTheGame } from "./climb";

/**
 * Pemba, the climbers' Sherpa (#212): alone, the player climbs with him and no teammate. He waits
 * at Base Camp until they set off, then leads, a few metres ahead; he speaks in a bubble over his
 * head, his name on it, and the first thing he says is the hour and that they go now.
 */

/** Pemba's bubble on the page. */
const bubble = (page: Page) => page.locator("#sherpa");

test("alone, the player sets off with Pemba ahead of them, who says the hour and that they go now", async ({
  page,
}) => {
  await openTheGame(page);

  await expect(bubble(page)).toBeVisible({ timeout: 15_000 });
  await expect(bubble(page)).toHaveAttribute("data-cue", "set-off");
  await expect(bubble(page).locator('[data-text="who"]')).toHaveText("Pemba");
  await expect(bubble(page).locator('[data-text="said"]')).toContainText(
    "03:00. Good. The Icefall sleeps while it's cold, so we go now.",
  );
  expect(await along(page, "pemba")).toBeGreaterThan(await along(page, "player"));
});

test("Pemba speaks from over his head: the bubble's tail at his place on the screen", async ({
  page,
}) => {
  await openTheGame(page);
  await expect(bubble(page)).toBeVisible({ timeout: 15_000 });
  await expect(bubble(page)).toHaveAttribute("data-edge", "on");

  const [x = 0, y = 0] = await page.evaluate(() => {
    const pemba = window.everest.climber("pemba");
    return window.everest.screenAt(pemba.x, pemba.y + 2.1);
  });
  const box = await bubble(page).boundingBox();

  expect(box).not.toBeNull();
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - x)).toBeLessThan(24);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(y);
});

test("Pemba waits at Base Camp until the player sets off, then walks on ahead of them", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);
  const waiting = await atRest(page, "pemba");

  await page.keyboard.down("KeyD");
  await expect.poll(() => along(page, "pemba"), WALKING).toBeGreaterThan(waiting + 1);
  await page.keyboard.up("KeyD");
  const ahead = (await atRest(page, "pemba")) - (await atRest(page, "player"));

  expect(waiting).toBeCloseTo(14, 1);
  expect(ahead).toBeGreaterThan(2);
  expect(ahead).toBeLessThan(7);
});
