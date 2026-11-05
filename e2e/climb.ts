import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** A climber as the page's hooks show them (src/physics → ClimberView), as far as the stories
 * read it. */
export interface SeenClimber {
  readonly x: number;
  readonly y: number;
  readonly altitude: number;
  readonly falling: boolean;
  readonly first: string | null;
  readonly second: string | null;
  readonly ladder: string | null;
}

/** A climb as the device saves it (src/simulation → ExpeditionSave), as far as the stories edit
 * it: the steps played, and where the clock and each climber stand. */
export interface SavedClimb {
  step: number;
  rules: {
    "mountain-clock": { steps: number };
    "slope-physics": { climbers: { readonly id: string; along: number }[] };
  };
}

declare global {
  interface Window {
    /** What the page shows its stories (src/page/game-page.ts → PageHooks). */
    everest: {
      pixelAt(x: number, y: number): readonly number[];
      climberAt(climber: string): readonly number[];
      climber(climber: string): SeenClimber;
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

/** How far across the slope a climber of the expedition is, in metres, or NaN before the climb:
 * on the flat, how far along it. */
export async function along(page: Page, climber: string): Promise<number> {
  return page.evaluate(
    (id) => ("everest" in window ? (window.everest.climberAt(id)[0] ?? Number.NaN) : Number.NaN),
    climber,
  );
}

/** A climber of the expedition as the physics shows them, or null before the climb. */
export async function seen(page: Page, climber: string): Promise<SeenClimber | null> {
  return page.evaluate((id) => ("everest" in window ? window.everest.climber(id) : null), climber);
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

/** The climb saved on the device, or null for none. It never makes the database: an upgrade it
 * would start is abandoned, and the game makes its own. */
export async function savedClimb(page: Page): Promise<SavedClimb | null> {
  return page.evaluate(
    () =>
      new Promise<SavedClimb | null>((resolve) => {
        const opening = indexedDB.open("everest");
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
        };
        opening.onerror = () => {
          resolve(null);
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
              resolve((reading.result as SavedClimb | undefined) ?? null);
            };
            reading.onerror = () => {
              database.close();
              resolve(null);
            };
          } catch {
            database.close();
            resolve(null);
          }
        };
      }),
  );
}

/** Puts a climb on the device in the saved one's place. */
export async function storeClimb(page: Page, climb: SavedClimb): Promise<void> {
  await page.evaluate(
    (save) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("everest");
        opening.onerror = () => {
          reject(new Error("The device has no saved climb to replace"));
        };
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("expeditions", "readwrite");
          transaction.objectStore("expeditions").put(save, "solo");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error ?? new Error("The save failed"));
          };
        };
      }),
    climb,
  );
}

/** The player's climber in a saved climb. */
export function savedPlayer(climb: SavedClimb): { readonly id: string; along: number } {
  const player = climb.rules["slope-physics"].climbers.find((climber) => climber.id === "player");
  if (player === undefined) {
    throw new Error("The saved climb has no player");
  }
  return player;
}

/**
 * Opens the game on a climb alone that `edit` has changed on the device: a new climb, saved,
 * changed on the disclaimer, where no game runs to save over it, and gone on with. The stories
 * put the climber where their story begins, rather than walk them there for minutes.
 */
export async function climbFrom(page: Page, edit: (climb: SavedClimb) => void): Promise<void> {
  await openTheGame(page);
  await expect.poll(async () => (await savedClimb(page)) !== null).toBe(true);
  await page.goto("/");
  const climb = await savedClimb(page);
  if (climb === null) {
    throw new Error("The climb wasn't saved on the device");
  }
  edit(climb);
  await storeClimb(page, climb);
  await page.getByRole("button", { name: "I understand" }).click();
  await choice(page, "Alone").click();
}
