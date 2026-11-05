import { expect, test } from "@playwright/test";
import type { Browser, Locator, Page } from "@playwright/test";

import { along, atRest, choice, readTheDisclaimer } from "./climb";

/**
 * Rooms, on the room server `npm run room` serves on this machine (playwright.config.ts): each
 * player in a browser of their own, as two people on two devices. The first in a room climbs as
 * `player`, 10 m along the flat; the second as `teammate`, at 12 m.
 */

const JOINED = /^You have joined room ([A-HJ-NP-Z2-9]{5})$/;

function notice(page: Page): Locator {
  return page.locator("#room span");
}

/** Someone else, on a device of their own. */
async function anotherPlayer(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  return context.newPage();
}

/** Opens a new room, and says its code. */
async function openARoom(page: Page): Promise<string> {
  await readTheDisclaimer(page);
  await choice(page, "Together: a new room").click();
  await expect(notice(page)).toHaveText(JOINED);
  const [, code = ""] = JOINED.exec((await notice(page).textContent()) ?? "") ?? [];
  return code;
}

test("a new room's link brings a friend in; each sees the other climb, and the friend's climber stands once they leave", async ({
  page,
  browser,
  baseURL,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  const code = await openARoom(page);
  const link = page.url();
  expect(new URL(link).searchParams.get("room")).toBe(code);
  const friend = await anotherPlayer(browser, baseURL);

  await readTheDisclaimer(friend, link);

  await expect(notice(friend)).toHaveText(`You have joined room ${code}`);
  // The friend's first frame, as long as e2e/slope.spec.ts waits for one: a second browser starts
  // its WebGL in software beside the first's, which on CI can take more than an expect's 5 s.
  await expect(friend.locator("#slope")).toHaveAttribute("data-climber", "12.00 0.00", {
    timeout: 15_000,
  });
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(friend, "player")).toBeGreaterThan(10.5);
  await page.keyboard.up("KeyD");
  await friend.keyboard.down("KeyD");
  await expect.poll(() => along(page, "teammate")).toBeGreaterThan(12.3);
  await friend.context().close();
  await atRest(page, "teammate");
});

test("a room's code typed at the start joins it, and a third player finds it full", async ({
  page,
  browser,
  baseURL,
}) => {
  const host = await anotherPlayer(browser, baseURL);
  const code = await openARoom(host);

  await readTheDisclaimer(page);
  await page.locator("#start input").fill(code.toLowerCase());
  await choice(page, "Join").click();

  await expect(notice(page)).toHaveText(`You have joined room ${code}`);
  expect(new URL(page.url()).searchParams.get("room")).toBe(code);
  const third = await anotherPlayer(browser, baseURL);
  await readTheDisclaimer(third, `/?room=${code}`);
  await expect(notice(third)).toHaveText(`Room ${code} is full`);
  await expect(third.getByRole("button", { name: "Back" })).toBeVisible();
  await host.context().close();
  await third.context().close();
});

test("a code no room has is said so, with the way back to the start", async ({ page }) => {
  await readTheDisclaimer(page);
  const code = page.locator("#start input");

  await code.fill("K7PX0");
  await choice(page, "Join").click();
  await expect(code).toHaveJSProperty("validationMessage", "Room K7PX0 doesn't exist");
  await expect(notice(page)).toBeHidden();
  await code.fill("ZZZZZ");
  await choice(page, "Join").click();

  await expect(notice(page)).toHaveText("Room ZZZZZ doesn't exist");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("dialog", { name: "Before you climb" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("room")).toBe(false);
});

test("a player back in the room after a reload finds their climber where they left it", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  const code = await openARoom(page);
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(page, "player")).toBeGreaterThan(10.5);
  await page.keyboard.up("KeyD");
  const left = await atRest(page, "player");

  await readTheDisclaimer(page, page.url());

  await expect(notice(page)).toHaveText(`You have joined room ${code}`);
  await expect.poll(() => along(page, "player")).toBeCloseTo(left, 1);
});
