import type { Page } from "@playwright/test";

/** Opens the game past its disclaimer, as a player who has read it. */
export async function openTheGame(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
}
