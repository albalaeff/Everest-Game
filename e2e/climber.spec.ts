import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  SAVING,
  choice,
  climberScreen,
  keptClimber,
  readTheDisclaimer,
  savedClimb,
  savedPlayer,
} from "./climb";

/**
 * Your climber (#145): before a new climb alone the player says who is climbing, their guide says
 * what it means in plain words, and the climber sets off as that body. The answers are kept for
 * the next new climb.
 */

/** What the guide says, as the player changes their answers. */
function guide(page: Page): Locator {
  return climberScreen(page).locator(".guide");
}

/** The player's body and technique as the climb saved on the device set them off. */
async function setOff(
  page: Page,
): Promise<{ mass: number; fitness: number; technique: number } | null> {
  const climb = await savedClimb(page);
  const body = climb?.rules.body.climbers.find(({ id }) => id === "player");
  if (climb === null || body === undefined) {
    return null;
  }
  return { mass: body.mass, fitness: body.fitness, technique: savedPlayer(climb).technique };
}

test("a heavy, untrained climber new to the mountains hears what it means, and sets off as that body", async ({
  page,
}) => {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  const screen = climberScreen(page);
  await expect(screen.getByLabel("Weight")).toHaveValue("75");
  await expect(guide(page)).toContainText("about as fit as most of our clients");

  await screen.getByLabel("Weight").fill("110");
  await screen.getByLabel("I avoid walking and exercise").check();
  await screen.getByLabel("None", { exact: true }).check();

  await expect(guide(page)).toContainText("far less fit than most of our clients");
  await expect(guide(page)).toContainText("never used crampons, a jumar or a ladder");
  await expect(guide(page)).not.toContainText(/\d\.\d/);
  await screen.getByRole("button", { name: "Climb" }).click();
  await expect(screen).toBeHidden();
  await expect.poll(() => setOff(page), SAVING).not.toBeNull();
  const body = await setOff(page);
  expect(body?.mass).toBe(110);
  expect(body?.fitness).toBeLessThan(0.7);
  expect(body?.technique).toBeLessThan(1);
});

test("the next new climb opens on the answers kept, to keep as they are or to edit", async ({
  page,
}) => {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  await climberScreen(page).getByLabel("Age").fill("62");
  await climberScreen(page).getByText("More about you").click();
  await climberScreen(page).getByLabel("Asthma").check();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await expect.poll(async () => (await savedClimb(page)) !== null, SAVING).toBe(true);

  await readTheDisclaimer(page);
  await choice(page, "Start over").click();

  const screen = climberScreen(page);
  await expect(screen.locator("dl")).toContainText("62");
  await expect(screen.locator("dl")).toContainText("Asthma");
  await expect(guide(page)).toContainText("Climbers over 59");
  await expect(screen.getByRole("button", { name: "Keep these answers" })).toBeFocused();
  await screen.getByRole("button", { name: "Edit climber" }).click();
  await expect(screen.getByLabel("Age")).toHaveValue("62");
  await expect(screen.getByLabel("Asthma")).toBeChecked();
});

test("a PC answers with the keys alone: the arrows change an answer, and Enter climbs", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "I understand" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choice(page, "Alone")).toBeFocused();
  await page.keyboard.press("Enter");
  const screen = climberScreen(page);
  await expect(screen.getByLabel("Age")).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(screen.getByLabel("Prefer not to say")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(screen.getByLabel("Female")).toBeChecked();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");

  await expect(screen).toBeHidden();
  expect(await keptClimber(page)).toMatchObject({ age: 39, sex: "female" });
});

for (const [held, viewport] of [
  ["upright", { width: 360, height: 640 }],
  ["sideways", { width: 640, height: 360 }],
] as const) {
  test.describe(`a phone held ${held}`, () => {
    test.use({ viewport });

    test("lays Your climber out to fit, every choice a target a finger can take", async ({
      page,
      hasTouch,
    }) => {
      test.skip(!hasTouch, "a phone's story");
      await readTheDisclaimer(page);
      await choice(page, "Alone").tap();
      const screen = climberScreen(page);
      await screen.getByText("More about you").tap();
      await expect(screen.getByLabel("Diabetes")).toBeVisible();

      const fits = await screen.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth);
      // A choice's whole row is its target, the box or the dot and its words.
      const small = await screen.evaluate((dialog) =>
        [...dialog.querySelectorAll('button, label, summary, input[type="number"]')]
          .filter((target) => target.getBoundingClientRect().height > 0)
          .filter((target) => target.getBoundingClientRect().height < 48)
          .map((target) => target.textContent),
      );
      expect(fits).toBe(true);
      expect(small).toEqual([]);
      await screen.getByRole("button", { name: "Climb" }).scrollIntoViewIfNeeded();
      await expect(screen.getByRole("button", { name: "Climb" })).toBeInViewport({ ratio: 1 });
    });
  });
}
