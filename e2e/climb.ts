import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    /** What the page shows its stories (src/page/game-page.ts → PageHooks). */
    everest: {
      pixelAt(x: number, y: number): readonly number[];
      climberAt(climber: string): readonly number[];
    };
  }
}

/** A button of the start, by its words. */
export function choice(page: Page, name: string): Locator {
  return page.locator("#start").getByRole("button", { name, exact: true });
}

/** Opens the game past its disclaimer, as a player who has read it. */
export async function readTheDisclaimer(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.getByRole("button", { name: "I understand" }).click();
}

/** Opens the game on a climb alone: a new one, or the one the device has saved. */
export async function openTheGame(page: Page): Promise<void> {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
}

/** How far along the slope a climber of the expedition is, in metres, or NaN before the climb. */
export async function along(page: Page, climber: string): Promise<number> {
  return page.evaluate(
    (id) => ("everest" in window ? (window.everest.climberAt(id)[0] ?? Number.NaN) : Number.NaN),
    climber,
  );
}

/** Where a climber comes to rest, once the stop has gone round: the same twice, half a second
 * apart. A headless browser draws few frames, and a room's stop takes a step and back. */
export async function atRest(page: Page, climber: string): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = await along(page, climber);
        const still = Math.abs(now - last) < 0.005;
        last = now;
        return still;
      },
      { intervals: [500] },
    )
    .toBe(true);
  return last;
}
