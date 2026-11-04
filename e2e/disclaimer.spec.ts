import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { choice } from "./climb";

function disclaimer(page: Page): Locator {
  return page.getByRole("dialog", { name: "Before you climb" });
}

function understand(page: Page): Locator {
  return page.getByRole("button", { name: "I understand" });
}

function received(page: Page): Locator {
  return page.locator("#received li");
}

test("the game opens on what it trains and what it doesn't, and says it's a beta", async ({
  page,
}) => {
  await page.goto("/");

  await expect(disclaimer(page)).toBeVisible();
  await expect(disclaimer(page)).toContainText("It does not replace a mountaineering course");
  await expect(disclaimer(page)).toContainText("learn them with an instructor");
  await expect(disclaimer(page).getByText("Beta: not reviewed by an expert")).toBeVisible();
  await expect(understand(page)).toBeFocused();
});

test("a player's keys and clicks do nothing until they've read it", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");

  await page.keyboard.press("KeyE");
  await page.mouse.click(400, 130);
  await expect(received(page)).toHaveCount(0);
  await understand(page).click();
  await choice(page, "Alone").click();
  await page.keyboard.press("KeyE");

  await expect(disclaimer(page)).toBeHidden();
  await expect(received(page)).toHaveText(["clip first"]);
});

test("Enter on a PC is [I understand], and then [Alone]", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");
  await expect(disclaimer(page)).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(choice(page, "Alone")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("KeyE");

  await expect(disclaimer(page)).toBeHidden();
  await expect(received(page)).toHaveText(["clip first"]);
});

test("a player's taps do nothing until they've read it", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a phone's story");
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/");

  await page.touchscreen.tap(400, 130);
  await expect(received(page)).toHaveCount(0);
  await understand(page).tap();
  await choice(page, "Alone").tap();
  await page.locator("#slope").tap({ position: { x: 400, y: 130 } });

  await expect(disclaimer(page)).toBeHidden();
  await expect(received(page)).toHaveText(["tool ice-axe 20.37 4.78"]);
});

test("the climb shows no beta mark and no build", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/^build \S+$/)).toBeVisible();

  await understand(page).click();
  await choice(page, "Alone").click();

  await expect(page.getByText("Beta: not reviewed by an expert")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Everest" })).toBeHidden();
  await expect(page.getByText(/^build \S+$/)).toBeHidden();
  await expect(page.locator("#readouts")).toBeVisible();
});

test.describe("held upright", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("a phone shows the disclaimer before asking to be turned sideways", async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "a phone's story");
    await page.goto("/");

    await expect(disclaimer(page)).toBeVisible();
    await expect(page.getByText("Turn your phone sideways to climb")).toBeHidden();
    await understand(page).tap();
    await choice(page, "Alone").tap();

    await expect(page.getByText("Turn your phone sideways to climb")).toBeVisible();
  });
});

test.describe("on a screen of 640 by 360", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("the disclaimer scrolls to its button, and the page doesn't", async ({ page }) => {
    await page.goto("/");

    await understand(page).scrollIntoViewIfNeeded();
    await expect(understand(page)).toBeInViewport({ ratio: 1 });
    const scrolled = await page.evaluate(() => document.documentElement.scrollTop);

    expect(scrolled).toBe(0);
  });
});
