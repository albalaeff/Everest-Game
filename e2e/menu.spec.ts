import { expect, test } from "@playwright/test";

import { choice, readTheDisclaimer } from "./climb";

/**
 * The main menu (#248): once the disclaimer is read, Everest before dawn with the South Col route
 * drawn on it, and the start's choices over it (src/page/start-menu.ts, src/page/menu/). The
 * picture is SVG, so the stories read it off the page.
 */

/** The route's places, from Base Camp up. */
const PLACES = [
  "Base Camp",
  "Camp 1",
  "Camp 2",
  "Camp 3",
  "South Col",
  "Balcony",
  "South Summit",
  "Hillary Step",
  "Summit",
];

test("the main menu shows the mountain and the route's places, each higher than the last", async ({
  page,
}) => {
  await readTheDisclaimer(page);
  const menu = page.locator("#start");

  await expect(menu.getByRole("heading", { name: "Everest" })).toBeVisible();
  await expect(menu.getByRole("img", { name: /South Col route/ })).toBeVisible();
  const names = await menu.locator(".menu-label[data-place]").allTextContents();
  for (const [index, place] of PLACES.entries()) {
    expect(names[index]).toContain(place);
  }
  const readings = await menu.locator(".menu-label__altitude").allTextContents();
  expect(readings).toHaveLength(PLACES.length);
  for (const reading of readings) {
    expect(reading).toMatch(/^\d,\d{3} m$/);
  }
  const metres = readings.map((reading) => Number(reading.replace(/\D/g, "")));
  expect(metres).toEqual([...metres].sort((one, other) => one - other));
});

test("the main menu offers the start's choices, [Alone] first, and fits the screen", async ({
  page,
}) => {
  await readTheDisclaimer(page);

  await expect(choice(page, "Alone")).toBeFocused();
  await expect(choice(page, "Together: a new room")).toBeVisible();
  await expect(choice(page, "Join")).toBeVisible();
  await expect(page.locator("#start")).toContainText("You and Pemba, your Sherpa");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("headlamps climb the rope before dawn, and the picture goes when a choice is made", async ({
  page,
}) => {
  await readTheDisclaimer(page);

  expect(await page.locator("#start .menu-lamp").count()).toBeGreaterThan(0);
  await choice(page, "Alone").click();
  await expect(page.locator("#start")).toBeHidden();
  await expect(page.locator("#start .menu-stage > *")).toHaveCount(0);
});

test("with motion reduced, the menu's picture holds still, its rope drawn", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await readTheDisclaimer(page);

  await expect(page.locator("#start .menu-rope")).toBeVisible();
  await expect(page.locator("#start .menu-lamp")).toHaveCount(0);
  const moving = await page.evaluate(
    () => document.querySelector("#start")?.getAnimations({ subtree: true }).length,
  );
  expect(moving).toBe(0);
});
