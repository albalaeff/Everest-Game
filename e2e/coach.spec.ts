import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { WALKING, along, climbFrom, openTheGame, savedPlayer, seen } from "./climb";

/**
 * The coach (#192): a tip at a time, in the player's own controls, where the route first needs it.
 * The climb sets off with the walk's tip, a keyboard's keys on a PC and the thumb's on a phone,
 * and walking a few metres takes it away; at the first rope it says how to clip to it, until the
 * player does.
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

/** The coach's arrow on the slope (#233). */
const arrow = (page: Page) => page.locator("#pointer");

/** How far the arrow's place on the screen is from the point of the rope `rope` nearest the
 * player, in CSS pixels, both read at one moment; or null while there's no arrow. */
async function offTheRope(page: Page, rope: readonly (readonly [number, number])[]) {
  return page.evaluate((line) => {
    const pointer = document.querySelector<HTMLElement>("#pointer");
    if (pointer === null || pointer.hidden) {
      return null;
    }
    const player = window.everest.climber("player");
    let nearest: readonly number[] = [0, 0];
    let least = Infinity;
    line.forEach(([x, y], index) => {
      const [toX, toY] = line[index + 1] ?? [x, y];
      const [dx, dy] = [toX - x, toY - y];
      const squared = dx * dx + dy * dy;
      const projected = squared === 0 ? 0 : ((player.x - x) * dx + (player.y - y) * dy) / squared;
      const share = Math.min(Math.max(projected, 0), 1);
      const point = [x + dx * share, y + dy * share] as const;
      const away = Math.hypot(point[0] - player.x, point[1] - player.y);
      if (away < least) {
        least = away;
        nearest = point;
      }
    });
    const [x = 0, y = 0] = window.everest.screenAt(nearest[0] ?? 0, nearest[1] ?? 0);
    const box = pointer.getBoundingClientRect();
    return Math.hypot(box.x - x, box.y - y);
  }, rope);
}

test.describe("on a screen of 630 by 360", () => {
  test.use({ viewport: { width: 630, height: 360 } });

  test("the climb sets off with the walk, in the device's own controls, and walking takes it away", async ({
    page,
    hasTouch,
  }) => {
    await openTheGame(page);

    await expect(coach(page)).toBeVisible({ timeout: 15_000 });
    await expect(coach(page)).toHaveAttribute("data-tip", "walk");
    await expect(coach(page)).toContainText(hasTouch ? "Drag your left thumb" : "Hold D to walk");
    // A tip of the tutorial, its keys as key caps; the thumb's words name none.
    await expect(coach(page)).toHaveAttribute("data-kind", "tip");
    await expect(coach(page).locator("[data-device='pc'] kbd")).toHaveText(["D", "C", "Shift"]);
    await expect(coach(page).locator("[data-device='touch'] kbd")).toHaveCount(0);
    if (hasTouch) {
      return;
    }
    await page.keyboard.down("KeyD");
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(13.5);
    await page.keyboard.up("KeyD");
    await expect(coach(page)).not.toHaveAttribute("data-tip", "walk", { timeout: 10_000 });
  });

  test("the walk's arrow points the way on, ahead of the climber, in the device's own controls (#233)", async ({
    page,
    hasTouch,
  }) => {
    await openTheGame(page);

    // The arrow's own box is its place, a point: its words are what shows.
    await expect(arrow(page)).toHaveAttribute("data-says", "walk", { timeout: 15_000 });
    await expect(arrow(page)).toHaveAttribute("data-way", "right");
    await expect(arrow(page)).toHaveAttribute("data-anchor", "tail");
    await expect(arrow(page)).toHaveAttribute("data-kind", "tip");
    const words = arrow(page).locator(`[data-device='${hasTouch ? "touch" : "pc"}']`);
    await expect(words).toBeVisible();
    await expect(words).toHaveText(hasTouch ? "Drag this way" : "Hold D");
    await expect(arrow(page).locator("[data-device='pc'] kbd")).toHaveText(["D"]);
    // Ahead of the climber on the screen, and it takes no click from the slope.
    const ahead = await page.evaluate(() => {
      const player = window.everest.climber("player");
      const [x = 0] = window.everest.screenAt(player.x, player.y);
      return (document.querySelector("#pointer")?.getBoundingClientRect().x ?? 0) - x;
    });
    expect(ahead).toBeGreaterThan(10);
    await expect(arrow(page)).toHaveCSS("pointer-events", "none");
  });

  test("at the first rope the coach says how to clip to it, and clipping both cowstails takes it away", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    // On the first slope, a few metres up from Crampon Point, by the first rope.
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 24;
    });

    await expect(coach(page)).toHaveAttribute("data-tip", "clip", { timeout: 20_000 });
    await expect(coach(page)).toContainText("press R");
    await expect
      .poll(
        async () => {
          if ((await seen(page, "player"))?.second === null) {
            await page.keyboard.press("KeyR");
          }
          return (await seen(page, "player"))?.second;
        },
        { intervals: [1_000], timeout: 20_000 },
      )
      .toBe("approach");
    // One cowstail on isn't clipped in: the tip stays until the jumar's is on too (#233).
    await expect(coach(page)).toHaveAttribute("data-tip", "clip");
    await expect
      .poll(
        async () => {
          if ((await seen(page, "player"))?.first === null) {
            await page.keyboard.press("KeyE");
          }
          return (await seen(page, "player"))?.first;
        },
        { intervals: [1_000], timeout: 20_000 },
      )
      .toBe("approach");
    await expect(coach(page)).not.toHaveAttribute("data-tip", "clip", { timeout: 10_000 });
  });

  test("at the first rope an arrow points onto the place on it to clip, the key beside it, and goes once both cowstails are on (#233)", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 24;
    });
    // The first rope, from Crampon Point up the first slope (content/route/icefall.json).
    const approach = [
      [20, 0],
      [32, 5],
    ] as const;

    await expect(arrow(page)).toHaveAttribute("data-says", "clip-second", { timeout: 20_000 });
    // Up from under the rope, so the climber standing by it stays in view.
    await expect(arrow(page)).toHaveAttribute("data-way", "up");
    await expect(arrow(page)).toHaveAttribute("data-anchor", "tip");
    await expect(arrow(page).locator("[data-device='pc']")).toHaveText("R Clip here");
    await expect(arrow(page).locator("[data-device='pc'] kbd")).toHaveText(["R"]);
    // On the rope: within a few pixels of its line where it lies nearest the climber.
    await expect.poll(() => offTheRope(page, approach), { timeout: 10_000 }).toBeLessThan(12);

    await page.keyboard.press("KeyR");
    await expect(arrow(page)).toHaveAttribute("data-says", "clip-first", { timeout: 20_000 });
    await expect(arrow(page).locator("[data-device='pc'] kbd")).toHaveText(["E"]);
    await page.keyboard.press("KeyE");
    await expect.poll(async () => (await seen(page, "player"))?.first, WALKING).toBe("approach");
    await expect(arrow(page)).not.toHaveAttribute("data-says", /clip/u, { timeout: 10_000 });
  });
});
