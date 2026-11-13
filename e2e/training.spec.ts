import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { SAVING, SURE_FOOTED, climbFrom, savedClimb, savedPlayer, seen, stage } from "./climb";

/**
 * The training events (#209), as a player meets them: a serac cracks just ahead and comes down
 * across the route, and whoever stops at the crack is spared; a ladder creaks and breaks under a
 * climber clipped in, the rope holds them, and W climbs them out to the lip, where they wait for
 * the Icefall Doctors to lash it back. The stories stage each event where the climber stands.
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

test.describe("on a screen of 630 by 360", () => {
  test.use({ viewport: { width: 630, height: 360 } });

  test("a serac cracks just ahead: the climber who stops is spared, and the ice comes down across the route", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // On the Football Field, among the seracs, a collapse staged 4 m ahead.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 405;
      stage(climb, { from: 409, to: 417 }, null);
    });
    await expect.poll(async () => (await seen(page, "player"))?.x ?? 0).toBeGreaterThan(168);

    await page.keyboard.down("KeyD");
    await expect(coach(page)).toHaveAttribute("data-tip", "serac-crack", { timeout: 20_000 });
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(600);
    await page.keyboard.up("KeyA");

    await expect
      .poll(
        async () => {
          const climb = await savedClimb(page);
          return climb?.rules["objective-hazards"].strikes.map(({ zone }) => zone) ?? [];
        },
        { ...SAVING, timeout: 40_000 },
      )
      .toContain("serac-collapse");
    const player = await seen(page, "player");
    expect(player?.falls).toEqual([]);
    expect(player?.dead).toBe(false);
  });

  test("a ladder breaks under a climber clipped in: the rope holds them, the jumar clipped on climbs them out, and they wait at the lip", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // At the near lip of the big crevasse, its 8 m ladder staged to break a metre out, and no step
    // on it slipping before it does.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 340;
      stage(climb, null, { id: "big-crevasse", breaks: 1 });
      climb.random = [...SURE_FOOTED];
    });
    await expect.poll(async () => (await seen(page, "player"))?.x ?? 0).toBeGreaterThan(155);
    await expect
      .poll(
        async () => {
          const clipped = (await seen(page, "player"))?.second;
          if (clipped !== "big-crevasse") {
            await page.keyboard.press("KeyR");
          }
          return clipped;
        },
        { intervals: [500], timeout: 20_000 },
      )
      .toBe("big-crevasse");

    await page.keyboard.down("KeyD");
    await expect(coach(page)).toHaveAttribute("data-tip", "ladder-creak", { timeout: 30_000 });
    await expect
      .poll(async () => (await seen(page, "player"))?.hanging, { timeout: 30_000 })
      .toBe(true);
    await page.keyboard.up("KeyD");
    // On the carabiner alone, which climbs no rope: the coach says to clip the jumar on.
    await expect(coach(page)).toHaveAttribute("data-tip", "hanging-carabiner", {
      timeout: 20_000,
    });
    await page.keyboard.press("KeyE");
    await expect(coach(page)).toHaveAttribute("data-tip", "hanging", { timeout: 20_000 });

    await page.keyboard.down("KeyW");
    await expect
      .poll(async () => (await seen(page, "player"))?.falling, { timeout: 60_000 })
      .toBe(false);
    await page.keyboard.up("KeyW");
    const out = await seen(page, "player");

    expect(out?.ladder).toBeNull();
    expect(out?.x).toBeCloseTo(155.38, 0);
    expect(out?.falls).toMatchObject([{ held: true, broke: true }]);
    await expect(coach(page)).toHaveAttribute("data-tip", "ladder-broken", { timeout: 20_000 });
  });
});
