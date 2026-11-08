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
  /** Whether a crampon they didn't check has come loose (#196). */
  readonly cramponLoose: boolean;
}

/** A climber on the slope as the device saves them (src/physics → ClimberSave), as far as the
 * stories read and edit them: where they stand, and their technique as they set off. */
export interface SavedClimber {
  readonly id: string;
  along: number;
  readonly technique: number;
  /** What they checked at Base Camp, and the play's seconds they've been on the move (#196). */
  kit?: { crampons: boolean; lamp: boolean; water: boolean };
  onTheMove?: number;
}

/** A climb as the device saves it (src/simulation → ExpeditionSave), as far as the stories read
 * and edit it: the steps played, where the clock and each climber stand, and each climber's body
 * and technique as they set off. */
export interface SavedClimb {
  step: number;
  rules: {
    "mountain-clock": { steps: number };
    body: { climbers: { readonly id: string; readonly mass: number; readonly fitness: number }[] };
    "slope-physics": { climbers: SavedClimber[] };
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

const JOINED = /^You have joined room ([A-HJ-NP-Z2-9]{5})$/;

/** What the page says of its room, beside the readouts. */
export function roomNotice(page: Page): Locator {
  return page.locator("#room span");
}

/** Opens a new room, and says its code. */
export async function openARoom(page: Page): Promise<string> {
  await readTheDisclaimer(page);
  await choice(page, "Together: a new room").click();
  await expect(roomNotice(page)).toHaveText(JOINED);
  const [, code = ""] = JOINED.exec((await roomNotice(page).textContent()) ?? "") ?? [];
  return code;
}

/** Your climber, before a new climb alone. */
export function climberScreen(page: Page): Locator {
  return page.getByRole("dialog", { name: "Your climber" });
}

/** The gear check at Base Camp, after Your climber (#196). */
export function gearCheck(page: Page): Locator {
  return page.getByRole("dialog", { name: "Gear check at Base Camp" });
}

/** The gear check's boxes, by their names: everything a climber checks before setting off. */
export const KIT = [
  "Crampons fitted and strapped tight",
  "Fresh batteries in your headlamp",
  "Both water bottles filled",
] as const;

/** Ticks every box of the gear check, and sets off: the climb as the route has it. */
export async function setOffChecked(page: Page): Promise<void> {
  const screen = gearCheck(page);
  for (const item of KIT) {
    await screen.getByRole("checkbox", { name: item }).check();
  }
  await screen.getByRole("button", { name: "Set off" }).click();
}

/** The answers Your climber kept on the device, or null for none. */
export async function keptClimber(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("everest.climber") ?? "null") as Record<string, unknown>,
  );
}

/** Opens the game on a new climb alone, on a device with none saved: the questions open on the
 * typical client, whom the route's numbers are fitted to, [Climb] takes them to the gear check,
 * and with everything checked they set off. */
export async function openTheGame(page: Page): Promise<void> {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await setOffChecked(page);
}

/** Opens the game again on the climb alone the device has saved: [Alone] goes on with it, with
 * no Your climber. */
export async function goOnWithTheClimb(page: Page): Promise<void> {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
}

/** The wait for a climber to walk a step or two, as `expect.poll` takes it: a second or two at
 * the Icefall's pace, 1.5 m/s on the flat, and the frames of a headless browser drawing in
 * software on CI, a second or two apart, which carry the keys to the climb and the climb to the
 * page. */
export const WALKING = { timeout: 20_000 };

/** The wait for the first frame of a second browser in a story, as an expect takes it: it starts
 * its WebGL in software beside the first's, and the other worker's two, and on CI it drew none in
 * 15 s (PR #158). */
export const SECOND_BROWSER = { timeout: 45_000 };

/** The wait for the climb to be saved on the device, as `expect.poll` takes it: the page saves a
 * new climb as it starts, and every ten seconds of play after, but on CI the first save took more
 * than an expect's 5 s to appear (PR #157), as the browser opened the scene in software beside
 * another story's browsers. */
export const SAVING = { timeout: 20_000 };

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
 * apart. A headless browser draws few frames, and a room's stop takes a step and back: on CI, the
 * stop of a friend whose browser closed took more than an expect's 5 s to reach the page (PR #158),
 * so the wait is a walk's. */
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
      { ...WALKING, intervals: [500] },
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
export function savedPlayer(climb: SavedClimb): SavedClimber {
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
  await expect.poll(async () => (await savedClimb(page)) !== null, SAVING).toBe(true);
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
