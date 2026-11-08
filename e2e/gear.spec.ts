import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  SAVING,
  SURE_FOOTED,
  choice,
  climbFrom,
  climberScreen,
  gearCheck,
  readTheDisclaimer,
  savedClimb,
  savedPlayer,
  seen,
} from "./climb";

/**
 * The gear check at Base Camp (#196): after Your climber, the player ticks what they check of
 * their kit before setting off, on a screen that says it's a game model, not instructions. A
 * check they skip catches up with them on the route: a crampon they didn't check comes loose on a
 * ladder an hour out, and the coach says how to refit it.
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

test("the gear check says it's a game model, and the climber sets off with what was ticked", async ({
  page,
}) => {
  await readTheDisclaimer(page);
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  const screen = gearCheck(page);

  await expect(screen).toBeVisible();
  await expect(screen).toContainText("A game model of the Icefall, not instructions");
  await expect(screen.getByRole("checkbox", { name: "Crampons fitted" })).not.toBeChecked();
  await screen.getByRole("checkbox", { name: "Fresh batteries in your headlamp" }).check();
  await screen.getByRole("checkbox", { name: "Both water bottles filled" }).check();
  await screen.getByRole("button", { name: "Set off" }).click();

  await expect(screen).toBeHidden();
  await expect.poll(async () => (await savedClimb(page)) !== null, SAVING).toBe(true);
  const climb = await savedClimb(page);
  expect(climb === null ? null : savedPlayer(climb).kit).toEqual({
    crampons: false,
    lamp: true,
    water: true,
  });
});

test("a crampon not checked comes loose on the first ladder an hour out, and the coach says to refit it", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  // At the foot of the ladder up the first block, 33 m along the ground, after more than an hour
  // on the move: a hundred seconds of play.
  await climbFrom(page, (climb) => {
    const player = savedPlayer(climb);
    player.along = 33;
    player.kit = { crampons: false, lamp: true, water: true };
    player.onTheMove = 120;
    climb.random = [...SURE_FOOTED];
  });

  await expect
    .poll(
      async () => {
        const clipped = (await seen(page, "player"))?.second;
        if (clipped !== "block") {
          await page.keyboard.press("KeyR");
        }
        return clipped;
      },
      { intervals: [500] },
    )
    .toBe("block");
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await expect.poll(async () => (await seen(page, "player"))?.cramponLoose).toBe(true);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyW");

  await expect(coach(page)).toHaveAttribute("data-tip", "crampon-loose", { timeout: 20_000 });
  await expect(coach(page)).toContainText("click just below your feet");
});

for (const [held, viewport] of [
  ["upright", { width: 360, height: 640 }],
  ["sideways", { width: 640, height: 360 }],
] as const) {
  test.describe(`a phone held ${held}`, () => {
    test.use({ viewport });

    test("lays the gear check out to fit, every box a target a finger can take", async ({
      page,
      hasTouch,
    }) => {
      test.skip(!hasTouch, "a phone's story");
      await readTheDisclaimer(page);
      await choice(page, "Alone").tap();
      await climberScreen(page).getByRole("button", { name: "Climb" }).tap();
      const screen = gearCheck(page);
      await expect(screen).toBeVisible();

      const fits = await screen.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth);
      const small = await screen.evaluate((dialog) =>
        [...dialog.querySelectorAll("button, label")]
          .filter((target) => target.getBoundingClientRect().height > 0)
          .filter((target) => target.getBoundingClientRect().height < 48)
          .map((target) => target.textContent),
      );
      expect(fits).toBe(true);
      expect(small).toEqual([]);
      await screen.getByText("Both water bottles filled").tap();
      await expect(
        screen.getByRole("checkbox", { name: "Both water bottles filled" }),
      ).toBeChecked();
      // Scrolled to its end, as a thumb does: Playwright leaves a button barely cut by the screen's
      // edge where it is, and upright the screen is about a phone's height (PR #201).
      await screen.evaluate((dialog) => {
        dialog.scrollTop = dialog.scrollHeight;
      });
      await expect(screen.getByRole("button", { name: "Set off" })).toBeInViewport({ ratio: 1 });
    });
  });
}
