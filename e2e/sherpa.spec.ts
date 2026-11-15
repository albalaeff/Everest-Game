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

/** A line shows only as long as it takes to read, and a headless browser under load draws few
 * frames: so long the line's gone between two of a story's steps. */
const SPEAKING = { timeout: 15_000 };

/** Where Pemba's bubble is against the place over his head on the screen, both read at one
 * moment: its middle's distance from it across and its bottom's height above it, in CSS pixels,
 * whether that's over him, its tail within 24 px of it, and the edge it's at; or null while he
 * says nothing. */
async function overHisHead(page: Page): Promise<{
  readonly across: number;
  readonly above: number;
  readonly overHim: boolean;
  readonly edge: string | undefined;
} | null> {
  return page.evaluate(() => {
    const said = document.querySelector<HTMLElement>("#sherpa");
    if (said === null || said.hidden) {
      return null;
    }
    const box = said.getBoundingClientRect();
    const pemba = window.everest.climber("pemba");
    const [x = 0, y = 0] = window.everest.screenAt(pemba.x, pemba.y + 2.1);
    const across = Math.abs(box.x + box.width / 2 - x);
    const above = y - box.bottom;
    return { across, above, overHim: across < 24 && above > 0, edge: said.dataset.edge };
  });
}

test("alone, the player sets off with Pemba ahead of them, who says the hour and that they go now", async ({
  page,
}) => {
  await openTheGame(page);

  await expect(page.locator('#sherpa[data-cue="set-off"]')).toBeVisible(SPEAKING);
  await expect(bubble(page).locator('[data-text="who"]')).toHaveText("Pemba");
  // One of his lines for it, the climb's seed picks which (#218): the hour, and the cold.
  await expect(bubble(page).locator('[data-text="said"]')).toContainText(/^03:00\. .*\bcold\b/u);
  expect(await along(page, "pemba")).toBeGreaterThan(await along(page, "player"));
});

test("Pemba speaks from over his head: the bubble's tail at his place on the screen", async ({
  page,
}) => {
  await openTheGame(page);

  await expect.poll(() => overHisHead(page), SPEAKING).toMatchObject({ edge: "on", overHim: true });
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
