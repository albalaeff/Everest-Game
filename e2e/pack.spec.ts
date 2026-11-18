import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  choice,
  climberScreen,
  gearCheck,
  packScreen,
  readTheDisclaimer,
  seen,
  setOffChecked,
} from "./climb";

/**
 * The pack: at Base Camp, after Your climber, the player chooses what they carry up the route,
 * each thing drawn on its tile, and the pack's weight grows as they add to it. On the climb,
 * [Inventory] opens the same pack: a drink and a bar anywhere, and at a camp its store to take
 * from and leave in.
 */

/** The pack's card on the climb, and a tile of the pack on either screen. */
const inventory = (page: Page) => page.locator("#inventory");
const tile = (page: Page, list: "pack" | "inventory", item: string) =>
  page.locator(`#${list}-items [data-item="${item}"]`);

/** To the pack at Base Camp. */
const toThePack = async (page: Page): Promise<void> => {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await expect(packScreen(page)).toBeVisible();
};

test("the pack at Base Camp draws each thing, weighs what's packed, and sets the climber off with it", async ({
  page,
}) => {
  await toThePack(page);
  const screen = packScreen(page);

  // The guide's list to begin with: the jumar, two litres, two bars and a first-aid kit (#241); no
  // second tool, no oxygen, no rescue kit.
  await expect(tile(page, "pack", "jumar")).toHaveAttribute("data-packed", "yes");
  await expect(tile(page, "pack", "first-aid")).toHaveAttribute("data-packed", "yes");
  await expect(tile(page, "pack", "rescue-kit")).toHaveAttribute("data-packed", "no");
  await expect(tile(page, "pack", "ice-tool")).toHaveAttribute("data-packed", "no");
  await expect(tile(page, "pack", "water").locator("output")).toHaveText("2 L");
  await expect(tile(page, "pack", "water").locator('use[data-state="packed"]')).toHaveCount(2);
  await expect(tile(page, "pack", "water").locator('use[data-state="left"]')).toHaveCount(1);
  await expect(tile(page, "pack", "oxygen").locator('use[data-state="left"]')).toHaveCount(3);
  await expect(screen.locator("#pack-weight")).toHaveText("Pack 2.7 kg · you carry 10 kg in all");
  await expect(screen.locator("#pack-worn li")).toHaveCount(5);
  await expect(screen.getByRole("button", { name: "More: Jumar" })).toBeDisabled();

  await screen.getByRole("button", { name: "More: Second ice tool" }).click();
  await screen.getByRole("button", { name: "Less: Jumar" }).click();
  await screen.getByRole("button", { name: "More: Oxygen bottles" }).click();

  await expect(tile(page, "pack", "ice-tool")).toHaveAttribute("data-packed", "yes");
  await expect(tile(page, "pack", "ice-tool")).toContainText("0.55 kg");
  await expect(tile(page, "pack", "jumar")).toContainText("Left in the tent");
  await expect(screen.locator("#pack-weight")).toHaveText("Pack 6.8 kg · you carry 14.1 kg in all");

  // The rope, the screws and the pulleys to reach a partner down a crevasse (#241).
  await screen.getByRole("button", { name: "More: Rescue kit" }).click();
  await expect(tile(page, "pack", "rescue-kit")).toHaveAttribute("data-packed", "yes");
  await expect(tile(page, "pack", "rescue-kit")).toContainText("1.17 kg");

  await screen.getByRole("button", { name: "Next: the gear check" }).click();
  await expect(gearCheck(page)).toBeVisible();
  await gearCheck(page).getByRole("button", { name: "Set off" }).click();

  await expect
    .poll(async () => (await seen(page, "player"))?.gear)
    .toEqual({
      jumar: false,
      tools: 2,
      firstAid: true,
      rescueKit: true,
    });
});

test("on the climb the pack opens on I: a drink anywhere, and Base Camp's store to take from", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story: the key");
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await setOffChecked(page);
  await expect.poll(() => seen(page, "player")).not.toBeNull();

  await expect(inventory(page)).toBeHidden();
  await page.keyboard.press("KeyI");
  await expect(inventory(page)).toBeVisible();
  await expect(inventory(page)).toContainText("At Base Camp: take from its store");
  await expect(tile(page, "inventory", "water").locator("output")).toHaveText("2 L");

  await inventory(page).getByRole("button", { name: "Drink" }).click();
  await expect(tile(page, "inventory", "water").locator("output")).toHaveText("1.5 L");
  await expect(tile(page, "inventory", "water").locator('use[data-state="opened"]')).toHaveCount(1);

  await inventory(page).getByRole("button", { name: "More: Second ice tool" }).click();
  await expect(tile(page, "inventory", "ice-tool")).toHaveAttribute("data-packed", "yes");
  await expect
    .poll(async () => (await seen(page, "player"))?.gear)
    .toEqual({
      jumar: true,
      tools: 2,
      firstAid: true,
      rescueKit: false,
    });

  await page.keyboard.press("Escape");
  await expect(inventory(page)).toBeHidden();
});

test("the pack's card on a phone opens from its button, each tile a finger wide", async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, "a phone's story");
  // Sideways, as the climb asks of a phone.
  await page.setViewportSize({ width: 800, height: 360 });
  await readTheDisclaimer(page);
  await choice(page, "Alone").tap();
  await climberScreen(page).getByRole("button", { name: "Climb" }).tap();
  await setOffChecked(page);
  await expect.poll(() => seen(page, "player")).not.toBeNull();

  await page.locator("[data-control='inventory']").tap();
  await expect(inventory(page)).toBeVisible();
  const drink = inventory(page).getByRole("button", { name: "Drink" });
  const box = await drink.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await drink.tap();
  await expect(tile(page, "inventory", "water").locator("output")).toHaveText("1.5 L");
});
