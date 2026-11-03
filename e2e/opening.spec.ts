import { expect, test } from "@playwright/test";

test("a player opens the game and sees which build it is, on its disclaimer", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Everest");
  await expect(page.getByRole("heading", { name: "Everest" })).toBeVisible();
  await expect(page.getByText(/^build \S+$/)).toBeVisible();
});

test("the page fits the screen, with nothing to scroll sideways", async ({ page }) => {
  await page.goto("/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBe(0);
});
