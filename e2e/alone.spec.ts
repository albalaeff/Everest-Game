import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { along, atRest, choice, openTheGame, readTheDisclaimer } from "./climb";

/**
 * A climb alone, saved on the device as it goes (src/saves): a reload, or a visit tomorrow, goes
 * on from where the climber was, unless the player starts over.
 */

/** The step of the climb saved on the device, or -1 for none. It never makes the database: an
 * upgrade it would start is abandoned, and the game makes its own. */
async function savedStep(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const opening = indexedDB.open("everest");
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
        };
        opening.onerror = () => {
          resolve(-1);
        };
        opening.onsuccess = () => {
          const database = opening.result;
          try {
            const reading = database
              .transaction("expeditions")
              .objectStore("expeditions")
              .get("solo");
            reading.onsuccess = () => {
              database.close();
              resolve((reading.result as { readonly step?: number } | undefined)?.step ?? -1);
            };
            reading.onerror = () => {
              database.close();
              resolve(-1);
            };
          } catch {
            database.close();
            resolve(-1);
          }
        };
      }),
  );
}

test("a climb alone goes on after a reload where the climber was, and [Start over] starts anew", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(page, "player")).toBeGreaterThan(11);
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
