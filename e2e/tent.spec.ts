import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { WALKING, climbFrom, savedPlayer, seen } from "./climb";

/**
 * The camps' tents (#258): a button over the tent whose door the climber stands at takes them in,
 * the slope shows them through the door, and the tent's inside opens over it, cut open from end to
 * end, with a panel of what there is and the chores. The stove melts snow into the bottles; a
 * sleep alone passes the night at once; [Leave the tent] goes out again. Base Camp's kitchen never
 * runs out and has the guitar; Camp 1 has the gas and the meals carried up to it.
 */

/** A step from the door of Base Camp's nearer tent, 8.25 m along the ground, and from the door
 * of Camp 1's first, 660.375 m along (content/route/icefall.json). */
const AT_BASE_CAMP = 8.9;
const AT_CAMP_1 = 660.6;

/** The wait for the slope to show the climber through the door, a few seconds of play, in
 * frames a headless browser draws in software; and for a chore's minutes of the mountain. */
const THROUGH_THE_DOOR = { timeout: 30_000 };
const A_CHORE = { timeout: 90_000 };

const tent = (page: Page): Locator => page.getByRole("dialog", { name: "Your tent" });
const door = (page: Page): Locator => page.locator("#tent-door");
const picture = (page: Page): Locator => page.locator("#tent .tent-picture");
const chore = (page: Page, name: string): Locator => tent(page).locator(`[data-chore="${name}"]`);
const stock = (page: Page, name: string): Locator =>
  tent(page).locator(`[data-stock="${name}"] output`);

/** A press of one of the page's buttons, by a click or a tap: the button over a door follows
 * the camera, which a click waits to see still. */
async function press(target: Locator): Promise<void> {
  await target.dispatchEvent("click");
}

/** In at the door the climber stands at, through to the tent's inside. */
async function goIn(page: Page): Promise<void> {
  await expect(door(page)).toBeVisible(WALKING);
  await expect(door(page)).toContainText("Enter the tent");
  await press(door(page));
  await expect.poll(async () => (await seen(page, "player"))?.sheltered, WALKING).toBe(true);
  await expect(tent(page)).toBeVisible(THROUGH_THE_DOOR);
  await expect(door(page)).toBeHidden();
}

test.describe("at Base Camp", () => {
  test.beforeEach(async ({ page }) => {
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = AT_BASE_CAMP;
    });
    await expect.poll(() => seen(page, "player")).not.toBeNull();
  });

  test("the button over the tent's door takes the climber in, and the tent shows what there is and what to do", async ({
    page,
  }) => {
    await expect(tent(page)).toBeHidden();
    await goIn(page);

    await expect(page.locator("#slope")).toHaveAttribute("data-passage", "inside");
    await expect(tent(page).locator('[data-text="where"]')).toHaveText(/^Base Camp · 5,3\d\d m$/);
    await expect(tent(page).locator('[data-text="clock"]')).toHaveText(/^0[34]:\d\d$/);
    await expect(tent(page).locator('[data-text="feel"]')).toHaveText(/^You feel .+\.$/);
    await expect(stock(page, "water")).toHaveText("2 of 3 L");
    await expect(stock(page, "gas")).toHaveText("plenty");
    await expect(stock(page, "meals")).toHaveText("plenty");
    await expect(stock(page, "bars")).toHaveText("2");
    await expect(tent(page).locator(".tent-chores button")).toHaveCount(5);
    await expect(chore(page, "melt")).toContainText("12 min, 38 g of gas: 1 L of water");
    await expect(chore(page, "cook")).toContainText("600 kcal");
    await expect(chore(page, "sleep")).toContainText("Until the alarm at 02:00");
    await expect(chore(page, "guitar")).toBeEnabled();

    // The picture: the tent, the person in it with a face, the stove, the pack and the guitar.
    for (const part of [".tent-room-wall", ".dw-face", ".dw-eye", ".tent-stove", ".tent-pack"]) {
      await expect(picture(page).locator(part).first()).toBeAttached();
    }
    await expect(picture(page)).toHaveAttribute("data-ground", "rubble");
    await expect(picture(page).locator(".tent-guitar-rest")).toBeVisible();
    await expect(picture(page).locator('.tent-props [data-bottle="0"]')).toBeVisible();
  });

  test("the stove melts snow into the bottles, a drink empties them, and the way out closes the tent", async ({
    page,
  }) => {
    test.slow();
    await goIn(page);

    await press(chore(page, "melt"));
    await expect(chore(page, "melt")).toHaveAttribute("data-state", "doing");
    await expect(chore(page, "melt")).toContainText(/^Melt snow\d+ min left\. Stop$/);
    await expect(picture(page)).toHaveAttribute("data-act", "melt", WALKING);
    await expect(picture(page)).toHaveAttribute("data-flame", "on");
    await expect(picture(page)).toHaveAttribute("data-door", "open");

    // Twelve of the mountain's minutes: a litre more, and the bottles are full.
    await expect(stock(page, "water")).toHaveText("3 of 3 L", A_CHORE);
    await expect(chore(page, "melt")).toBeDisabled();
    await expect(chore(page, "melt")).toContainText("Your bottles are full");
    await expect(picture(page)).toHaveAttribute("data-flame", "off", WALKING);

    await press(tent(page).getByRole("button", { name: "Drink" }));
    await expect(stock(page, "water")).toHaveText("2.5 of 3 L");
    await expect(chore(page, "melt")).toBeEnabled();

    await press(tent(page).getByRole("button", { name: "Leave the tent" }));
    await expect.poll(async () => (await seen(page, "player"))?.sheltered, WALKING).toBe(false);
    await expect(tent(page)).toBeHidden(THROUGH_THE_DOOR);
    await expect(page.locator("#slope")).toHaveAttribute(
      "data-passage",
      "outside",
      THROUGH_THE_DOOR,
    );
    await expect(door(page)).toBeVisible(WALKING);
  });

  test("a sleep alone passes the night at once: the alarm rings at 02:00, and the tent says how long it was", async ({
    page,
  }) => {
    await goIn(page);

    await press(chore(page, "sleep"));

    await expect(tent(page).locator('[data-text="clock"]')).toHaveText(/^02:0\d$/, WALKING);
    // 23 hours less the minutes since 03:00, said at once; the picture shows them into the bag,
    // asleep for a moment, and up again with a stretch.
    await expect(tent(page).locator('[data-text="advice"]')).toHaveText(
      /^You slept 22 h \d+ min\.$/,
    );
    await expect(picture(page)).toHaveAttribute("data-asleep", "yes", WALKING);
    await expect(picture(page)).toHaveAttribute("data-asleep", "no", THROUGH_THE_DOOR);
    await expect(tent(page).locator('[data-text="feel"]')).not.toContainText("sleepy");
  });

  test("[Pack] opens the pack's card over the tent, with Base Camp's store", async ({ page }) => {
    await goIn(page);

    await press(tent(page).getByRole("button", { name: "Pack" }));

    const inventory = page.locator("#inventory");
    await expect(inventory).toBeVisible();
    await expect(inventory).toContainText("At Base Camp: take from its store");
    await inventory.getByRole("button", { name: "Close" }).dispatchEvent("click");
    await expect(inventory).toBeHidden();
    await expect(tent(page)).toBeVisible();
  });
});

test("Camp 1's tent stands on snow, with the gas and the meals carried up, and no guitar", async ({
  page,
}) => {
  await climbFrom(page, (climb) => {
    savedPlayer(climb).along = AT_CAMP_1;
  });
  // The arrival's notice first: the climber is in the camp.
  const arrival = page.getByRole("dialog", { name: "Camp 1" });
  await expect(arrival).toBeVisible(WALKING);
  await press(arrival.getByRole("button", { name: "Continue" }));
  await expect(arrival).toBeHidden();

  await goIn(page);

  await expect(tent(page).locator('[data-text="where"]')).toHaveText(/^Camp 1 · 5,8\d\d m$/);
  await expect(stock(page, "gas")).toHaveText("454 g");
  await expect(stock(page, "meals")).toHaveText("6");
  await expect(chore(page, "guitar")).toBeDisabled();
  await expect(chore(page, "guitar")).toContainText("The guitar stays at Base Camp");
  await expect(picture(page)).toHaveAttribute("data-ground", "snow");
  await expect(picture(page).locator(".tent-guitar-rest")).toBeHidden();
  await expect(picture(page).locator(".tent-duffel")).toBeHidden();
});
