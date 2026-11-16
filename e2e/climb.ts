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
  /** Which cowstail's carabiner is going onto a rope now, the hands at it (#197). */
  readonly clipping: "first" | "second" | null;
  readonly ladder: string | null;
  /** Whether they hang on their rope after a fall, to climb back up it (#190). */
  readonly hanging: boolean;
  /** Each fall that's over (#190), and how it went. */
  readonly falls: readonly { readonly held?: boolean; readonly broke?: boolean }[];
  readonly dead: boolean;
  /** What they carry of the gear the slope's techniques need: their pack's. */
  readonly gear: { readonly jumar: boolean; readonly tools: number };
  /** Whether a crampon they didn't check has come loose (#196). */
  readonly cramponLoose: boolean;
  /** Whether they're on the ice on their tools, and whether the pick they hang from bites
   * poorly; whether they're lowering themselves down a face on its rope. */
  readonly onIce: boolean;
  readonly pickPoor: boolean;
  readonly lowering: boolean;
  /** Whether they're hauling, a partner out or a fallen ladder back up (#209, #228). */
  readonly hauling: boolean;
  /** Which way along the slope they face, up the route (1) or back down it (-1), and whether
   * they've turned to face the player (#235). */
  readonly facing: 1 | -1;
  readonly towardViewer: boolean;
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
  /** The expedition's chance: the four words of its generator (src/simulation/seeded-random.ts). */
  random: number[];
  rules: {
    "mountain-clock": { steps: number };
    body: { climbers: { readonly id: string; readonly mass: number; readonly fitness: number }[] };
    "slope-physics": {
      climbers: SavedClimber[];
      /** Each ladder, and where one staged to break for training breaks (#209). */
      ladders: { readonly id: string; breaks?: number }[];
    };
    /** What each climber's pack holds: a second ice tool is a second pick in the ice. */
    packs?: { climbers: { readonly id: string; items: Record<string, number> }[] };
    /** The stretches a gust or a lashed ladder's twist comes on, and those on their way (#197). */
    jolts?: {
      zones: unknown[];
      warnings: { zone: string; kind: string; began: number; comes: number }[];
    };
    /** The training events staged on the route (#209), and what has come down. */
    "objective-hazards": {
      events?: {
        readonly id: string;
        readonly kind: string;
        readonly from: number;
        readonly to: number;
        readonly lead: number;
      }[];
      strikes: { readonly zone: string; readonly climbers: readonly string[] }[];
    };
  };
}

/** The god mode as the stories use it, on `window.everest.god` with `?god` (src/page/god-mode.ts →
 * GodHooks, #245): its places, where the player and their Sherpa are, and its powers. */
export interface SeenGod {
  readonly places: readonly { readonly id: string; readonly along: number }[];
  readonly where: { readonly along: number; readonly sherpa: number | null };
  readonly state: { readonly immortal: boolean; readonly speed: number; readonly weather: string };
  teleport(where: string | number, who?: string): number;
  hour(time: string): void;
  weather(weather: string): void;
  speed(times: number): void;
  serac(): { readonly id: string; readonly from: number; readonly to: number };
  ladder(id?: string): string | null;
  jolt(kind?: string): boolean;
  slip(): void;
  immortal(on: boolean): void;
}

declare global {
  interface Window {
    /** What the page shows its stories (src/page/game-page.ts → PageHooks). */
    everest: {
      pixelAt(x: number, y: number): readonly number[];
      screenAt(x: number, y: number): readonly number[];
      climberAt(climber: string): readonly number[];
      climber(climber: string): SeenClimber;
      god?: SeenGod;
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

/** The pack at Base Camp, after Your climber: what the player carries up the route. */
export function packScreen(page: Page): Locator {
  return page.getByRole("dialog", { name: "Your pack at Base Camp" });
}

/** Keeps the route's pack, and goes on to the gear check. */
export async function keepThePack(page: Page): Promise<void> {
  await packScreen(page).getByRole("button", { name: "Next: the gear check" }).click();
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
  await keepThePack(page);
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

/** Opens the game with the god mode (#245) on a new climb alone, as `openTheGame` does, on a device
 * with no climb of the god mode's saved, and waits for its powers on the page. */
export async function openTheGameAsGod(page: Page): Promise<void> {
  await readTheDisclaimer(page, "/?god");
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await setOffChecked(page);
  await page.waitForFunction(() => "everest" in window && window.everest.god !== undefined);
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

/** The expedition's chance set so that none of its next 5,000 draws comes up below a thousandth
 * (src/simulation/seeded-random.ts): a step on a ladder, whose chance of slipping is a few in ten
 * thousand at most (#211), never slips, and a story on a ladder goes as it's told rather than end
 * in a fall one climb in a hundred. */
export const SURE_FOOTED = [0x13579bdf, 0xb12327d4, 0x2468ace0, 0x0badf00d];

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

/** A climber in a saved climb: the player, or Pemba (#247). */
export function savedClimber(climb: SavedClimb, id: string): SavedClimber {
  const found = climb.rules["slope-physics"].climbers.find((climber) => climber.id === id);
  if (found === undefined) {
    throw new Error(`The saved climb has no ${id}`);
  }
  return found;
}

/** The player's climber in a saved climb. */
export function savedPlayer(climb: SavedClimb): SavedClimber {
  return savedClimber(climb, "player");
}

/** Presses `key` until the player's `cowstail` is on `rope`, or off it for null (#247): never
 * while a carabiner is going on, which a press would drop (#197). */
export async function clipTo(
  page: Page,
  key: "KeyE" | "KeyR",
  cowstail: "first" | "second",
  rope: string | null,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const player = await seen(page, "player");
        if (player !== null && player[cowstail] !== rope && player.clipping === null) {
          await page.keyboard.press(key);
        }
        return (await seen(page, "player"))?.[cowstail];
      },
      { intervals: [1_000], timeout: 20_000 },
    )
    .toBe(rope);
}

/** Stages the climb's training events (#209) in place of those its seed staged: a serac collapse
 * on `from` to `to` metres along, cracking 3 m short of it, and no ladder breaking but `ladder`,
 * at `breaks` metres out from its near end. A story about something else stages none, as the seed
 * would put them anywhere: a collapse right behind its climber, one climb in three. */
export function stage(
  climb: SavedClimb,
  collapse: { readonly from: number; readonly to: number } | null,
  ladder: { readonly id: string; readonly breaks: number } | null,
): void {
  const hazards = climb.rules["objective-hazards"];
  hazards.events =
    collapse === null ? [] : [{ id: "serac-collapse", kind: "serac", ...collapse, lead: 3 }];
  for (const laid of climb.rules["slope-physics"].ladders) {
    delete laid.breaks;
    if (ladder !== null && laid.id === ladder.id) {
      laid.breaks = ladder.breaks;
    }
  }
}

/** No gust nor twist comes on the climb (#197): the jolts' stretches gone, so a story that cues
 * the expedition's next draw has it for the step it means. */
export function calm(climb: SavedClimb): void {
  if (climb.rules.jolts !== undefined) {
    climb.rules.jolts.zones = [];
  }
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
