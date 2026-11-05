import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

import {
  SECOND_BROWSER,
  WALKING,
  along,
  atRest,
  choice,
  openARoom,
  readTheDisclaimer,
  roomNotice as notice,
} from "./climb";

/**
 * Rooms, on the room server `npm run room` serves on this machine (playwright.config.ts): each
 * player in a browser of their own, as two people on two devices. The first in a room climbs as
 * `player`, 10 m along the flat; the second as `teammate`, at 12 m. Two or three browsers draw the
 * slope at once, each frame in software, and a step goes from one to another over two of their
 * frames: on a small screen, those come fast enough (playwright.config.ts, #154).
 */
test.use({ viewport: { width: 640, height: 360 } });

/** Someone else, on a device of their own. */
async function anotherPlayer(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  return context.newPage();
}

test("a new room's link brings a friend in; each sees the other climb, and the friend's climber stands once they leave", async ({
  page,
  browser,
  baseURL,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  // The friend's first frame, two walks and the friend's stop, each as long as CI may take.
  test.setTimeout(150_000);
  const code = await openARoom(page);
  const link = page.url();
  expect(new URL(link).searchParams.get("room")).toBe(code);
  const friend = await anotherPlayer(browser, baseURL);

  await readTheDisclaimer(friend, link);

  await expect(notice(friend)).toHaveText(`You have joined room ${code}`);
  await expect(friend.locator("#slope")).toHaveAttribute(
    "data-climber",
    "12.00 0.00",
    SECOND_BROWSER,
  );
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(friend, "player"), WALKING).toBeGreaterThan(10.5);
  await page.keyboard.up("KeyD");
  await friend.keyboard.down("KeyD");
  await expect.poll(() => along(page, "teammate"), WALKING).toBeGreaterThan(12.3);
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
  await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(10.5);
  await page.keyboard.up("KeyD");
  const left = await atRest(page, "player");

  await readTheDisclaimer(page, page.url());

  await expect(notice(page)).toHaveText(`You have joined room ${code}`);
  await expect.poll(() => along(page, "player")).toBeCloseTo(left, 1);
});
