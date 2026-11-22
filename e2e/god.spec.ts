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

// A small screen, which a slow machine draws sooner: the panel covers the player on it, and the
// slope 16 m ahead of them is clear of it.
test.use({ viewport: { width: 640, height: 360 } });

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

/** Where the player is drawn on the screen, once the camera has settled on them: two reads
 * running the same. */
async function settledOnThePlayer(page: Page): Promise<readonly number[]> {
  let last: readonly number[] = [];
  await expect
    .poll(async () => {
      const now = await page.evaluate(() => {
        const [x = 0, y = 0] = window.everest.climberAt("player");
        return window.everest.screenAt(x, y);
      });
      const same = now.every((value, at) => Math.abs(value - (last[at] ?? Number.NaN)) < 1);
      last = now;
      return same;
    }, WALKING)
    .toBe(true);
  return last;
}

test("the panel goes to a ladder from its list, to metres along the ground and to a click on the slope, keeps the player immortal, and sets the clock and the weather", async ({
  page,
}) => {
  // One climb for all of the panel, drawn on Low: setting off and each press wait for frames,
  // which a slow machine draws few of.
  test.slow();
  await page.addInitScript(() => {
    localStorage.setItem("everest.graphics", "low");
  });
  await openTheGameAsGod(page);
  const slot = await placeAlong(page, "ladder:slot");
  await page.getByRole("button", { name: "God mode" }).click();

  // Immortal first: a slow machine's minutes are the mountain's hours, and a death's notice would
  // cover the panel.
  await panel(page).getByLabel("Immortal").check();
  expect(await page.evaluate(() => window.everest.god?.state.immortal)).toBe(true);

  // The slot's ladder, from the list: on their feet, clipped in a step short of it, Pemba with them.
  await panel(page).getByLabel("Go to").selectOption("ladder:slot");
  await panel(page).locator('[data-form="place"]').getByRole("button", { name: "Go" }).click();
  expect(slot).toBe(260.625);
  await expect.poll(() => along(page), WALKING).toBe(slot);
  const player = await seen(page, "player");
  expect(player).toMatchObject({ dead: false, falling: false, ladder: null });
  expect(player?.first).not.toBeNull();
  await expect(panel(page)).toContainText("You: 260.6 m along");
  const pemba = await page.evaluate(() => window.everest.god?.where.sherpa ?? Number.NaN);
  expect(pemba).toBeGreaterThanOrEqual(slot);
  expect(pemba).toBeLessThan(slot + 40);

  // Metres along the ground, back by Base Camp, then a click on the moraine 16 m on up.
  await panel(page).getByLabel("Metres along").fill("12");
  await panel(page).locator('[data-form="metres"]').getByRole("button", { name: "Go" }).click();
  await expect.poll(() => along(page), WALKING).toBe(12);
  await settledOnThePlayer(page);
  await panel(page).getByRole("button", { name: "Pick on the slope" }).click();
  const [x = 0, y = 0] = await page.evaluate(() => {
    const [at = 0, up = 0] = window.everest.climberAt("player");
    return window.everest.screenAt(at + 16, up + 1);
  });
  await page.mouse.click(x, y);
  await expect.poll(() => along(page), WALKING).toBeGreaterThan(26);
  expect(await along(page)).toBeLessThan(30);

  // The clock set on to 13:00, and snow.
  await panel(page).getByLabel("Clock").fill("13:00");
  await panel(page).locator('[data-form="clock"]').getByRole("button", { name: "Set" }).click();
  await panel(page).getByRole("button", { name: "Snow", exact: true }).click();
  await expect(page.locator("#readout-clock")).toHaveText(/^13:\d\d$/);
  await expect(page.locator("#slope")).toHaveAttribute("data-weather", "snow");
  await expect(panel(page).getByRole("button", { name: "Snow", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(panel(page)).toBeHidden();
});

test("stages a serac collapse over the player by script: it cracks, comes down on them, and immortal, they're on their feet after", async ({
  page,
}) => {
  test.slow();
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
  test.slow();
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
