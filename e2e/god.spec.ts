import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  WALKING,
  choice,
  climberScreen,
  openTheGameAsGod,
  readTheDisclaimer,
  savedClimb,
  seen,
} from "./climb";

/**
 * The god mode (#245): with `?god` in the address, a tester goes anywhere on the route and sets a
 * scenario up there, rather than walk from Base Camp for minutes, on a climb of the god mode's own.
 * A tester's tool, used on a PC; its panel is checked there.
 */

test.beforeEach(({ hasTouch }) => {
  test.skip(hasTouch, "a tester's tool, used on a PC");
});

/** The god mode's panel. */
const panel = (page: Page) => page.getByRole("dialog", { name: "God mode" });

/** How far along the ground the player is, as the god mode says, or NaN without it. */
async function along(page: Page): Promise<number> {
  return page.evaluate(() => window.everest.god?.where.along ?? Number.NaN);
}

/** Where a climber stands at a place of the god mode's. */
async function placeAlong(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (place) => window.everest.god?.places.find((each) => each.id === place)?.along ?? Number.NaN,
    id,
  );
}

test("goes to the crux from the panel's list, on their feet and clipped in a step short of its ice, Pemba beside them", async ({
  page,
}) => {
  await openTheGameAsGod(page);
  const crux = await placeAlong(page, "face:upper-icefall");

  await page.getByRole("button", { name: "God mode" }).click();
  await panel(page).getByLabel("Go to").selectOption("face:upper-icefall");
  await panel(page).locator('[data-form="place"]').getByRole("button", { name: "Go" }).click();

  expect(crux).toBeGreaterThan(500);
  await expect.poll(() => along(page), WALKING).toBeCloseTo(crux, 1);
  const player = await seen(page, "player");
  expect(player).toMatchObject({ dead: false, falling: false, ladder: null });
  expect(player?.first).not.toBeNull();
  await expect(panel(page)).toContainText(`You: ${String(crux)} m along`);
  // Pemba came with them, and goes on ahead to lead.
  const pemba = await page.evaluate(() => window.everest.god?.where.sherpa ?? Number.NaN);
  expect(pemba).toBeGreaterThanOrEqual(crux);
  expect(pemba).toBeLessThan(crux + 10);

  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(panel(page)).toBeHidden();
});

test("goes to metres along the ground, and to where a click on the slope lands", async ({
  page,
}) => {
  await openTheGameAsGod(page);
  await page.getByRole("button", { name: "God mode" }).click();

  await panel(page).getByLabel("Metres along").fill("250");
  await panel(page).locator('[data-form="metres"]').getByRole("button", { name: "Go" }).click();
  await expect.poll(() => along(page), WALKING).toBe(250);

  await panel(page).getByRole("button", { name: "Pick on the slope" }).click();
  const [x = 0, y = 0] = await page.evaluate(() => {
    const [at = 0, up = 0] = window.everest.climberAt("player");
    return window.everest.screenAt(at + 8, up + 1);
  });
  await page.mouse.click(x, y);
  await expect.poll(() => along(page), WALKING).toBeGreaterThan(256);
  expect(await along(page)).toBeLessThan(261);
});

test("sets the clock on to an hour and the weather from the panel", async ({ page }) => {
  await openTheGameAsGod(page);
  await page.getByRole("button", { name: "God mode" }).click();

  await panel(page).getByLabel("Clock").fill("13:00");
  await panel(page).locator('[data-form="clock"]').getByRole("button", { name: "Set" }).click();
  await panel(page).getByRole("button", { name: "Snow", exact: true }).click();

  await expect(page.locator("#readout-clock")).toHaveText(/^13:0\d$/);
  await expect(page.locator("#slope")).toHaveAttribute("data-weather", "snow");
  await expect(panel(page).getByRole("button", { name: "Snow", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("stages a serac collapse over the player by script: it cracks, comes down on them, and immortal, they're on their feet after", async ({
  page,
}) => {
  await openTheGameAsGod(page);
  await page.evaluate(() => {
    window.everest.god?.immortal(true);
    window.everest.god?.teleport(395);
  });

  const collapse = await page.evaluate(() => window.everest.god?.serac());

  expect(collapse?.from).toBeLessThan(395);
  expect(collapse?.to).toBeGreaterThan(395);
  await expect(page.locator("#coach")).toHaveAttribute("data-tip", "serac-crack", WALKING);
  await expect.poll(async () => (await seen(page, "player"))?.falls.length, WALKING).toBe(1);
  expect(await seen(page, "player")).toMatchObject({ dead: false });
});

test("keeps a climb of its own: the player's climb alone isn't touched, and the god mode's goes on where it was", async ({
  page,
}) => {
  await openTheGameAsGod(page);
  await page.evaluate(() => window.everest.god?.teleport("camp:camp-1"));
  await expect.poll(() => along(page), WALKING).toBeGreaterThan(650);

  expect(await savedClimb(page)).toBeNull();
  // Alone, without the god mode, there's no climb to go on with: a new one begins.
  await readTheDisclaimer(page, "/");
  await choice(page, "Alone").click();
  await expect(climberScreen(page)).toBeVisible();
  // With it, its own goes on at Camp 1.
  await readTheDisclaimer(page, "/?god");
  await choice(page, "Alone").click();
  await page.waitForFunction(() => "everest" in window && window.everest.god !== undefined);
  expect(await along(page)).toBeGreaterThan(650);
});
