import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  SURE_FOOTED,
  WALKING,
  along,
  calm,
  climbFrom,
  clipTo,
  openTheGame,
  savedClimber,
  savedPlayer,
  seen,
  stage,
} from "./climb";

/**
 * The coach (#192): a tip at a time, in the player's own controls, where the route first needs it.
 * The climb sets off with the walk's tip, a keyboard's keys on a PC and the thumb's on a phone,
 * and walking a few metres takes it away; at the first rope it says how to clip to it and what
 * the carabiner and the jumar are, until the player has; whenever the jumar holds them back, to
 * hold Space; and at the end of a rope, the changeover a step at a time (#247).
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

/** The coach's arrow on the slope (#233). */
const arrow = (page: Page) => page.locator("#pointer");

/** The coach's mark on a changeover's anchor (#247). */
const mark = (page: Page) => page.locator("#mark");

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
    await expect(coach(page)).toContainText("R first, then E");
    // What each end of the cowstails is, in the order they go on, each with its key (#247).
    const gear = coach(page).locator(".coach__gear li");
    await expect(gear).toHaveCount(2);
    await expect(gear.nth(0)).toHaveAttribute("data-gear", "carabiner");
    await expect(gear.nth(0)).toContainText("runs freely along the rope");
    await expect(gear.nth(1)).toContainText("grips the rope");
    await expect(coach(page).locator(".coach__gear [data-device='pc'] kbd")).toHaveText([
      "R",
      "E",
      "Space",
    ]);
    await expect(gear.nth(0)).toHaveAttribute("data-state", "now");
    await clipTo(page, "KeyR", "second", "approach");
    // One cowstail on isn't clipped in: the tip stays until the jumar's is on too (#233), and the
    // jumar's line is the one to read now.
    await expect(coach(page)).toHaveAttribute("data-tip", "clip");
    await expect(gear.nth(1)).toHaveAttribute("data-state", "now");
    await clipTo(page, "KeyE", "first", "approach");
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
    await expect(arrow(page).locator("[data-device='pc']")).toHaveText("R Carabiner on, here");
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

  test("whenever the jumar holds the climber back, the coach says to hold Space, and sliding it takes the tip away (#247)", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await climbFrom(page, (climb) => {
      savedPlayer(climb).along = 24;
      calm(climb);
      stage(climb, null, null);
    });
    await clipTo(page, "KeyR", "second", "approach");
    await clipTo(page, "KeyE", "first", "approach");

    // On up the rope without Space: the jumar grips where it is.
    await page.keyboard.down("KeyD");
    await expect(coach(page)).toHaveAttribute("data-tip", "jumar", WALKING);
    await expect(coach(page)).toContainText("hold Space as you go");
    await expect(arrow(page)).toHaveAttribute("data-says", "jumar");
    await expect(arrow(page)).toHaveAttribute("data-way", "right");
    const held = await along(page, "player");
    await page.keyboard.down("Space");
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(held + 0.5);
    await expect(coach(page)).not.toHaveAttribute("data-tip", "jumar", { timeout: 10_000 });
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyD");
  });

  test("held at the end of the first rope, the coach takes the changeover a step at a time: each ticked off, the arrow on the next, the anchor ringed (#247)", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    test.setTimeout(120_000);
    await climbFrom(page, (climb) => {
      // A few metres short of the approach rope's end, and Pemba past the block's wall ahead,
      // so he doesn't pass them on the rope.
      savedPlayer(climb).along = 30.4;
      savedClimber(climb, "pemba").along = 36.8;
      calm(climb);
      stage(climb, null, null);
      climb.random = [...SURE_FOOTED];
    });
    await clipTo(page, "KeyR", "second", "approach");
    await clipTo(page, "KeyE", "first", "approach");
    await page.keyboard.down("Space");
    await page.keyboard.down("KeyD");
    await expect(coach(page)).toHaveAttribute("data-tip", "anchor", WALKING);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("Space");

    const steps = coach(page).locator(".coach__steps li");
    await expect(steps).toHaveCount(4);
    await expect(steps.locator("[data-device='pc']")).toHaveText([
      "R Unclip the carabiner",
      "R Clip the carabiner to the next rope",
      "E Unclip the jumar",
      "E Clip the jumar to the next rope",
    ]);
    // The anchor ringed and named on the slope, which of the round things on the rope it is: the
    // mark is a point, its name what shows.
    const named = mark(page).locator(".mark__name");
    await expect(named).toBeVisible();
    await expect(named).toHaveText("Anchor");
    const changeover = [
      ["carabiner-off", "off-second", "KeyR", "second", null],
      ["carabiner-on", "clip-second", "KeyR", "second", "block"],
      ["jumar-off", "off-first", "KeyE", "first", null],
      ["jumar-on", "clip-first", "KeyE", "first", "block"],
    ] as const;
    for (const [step, says, key, cowstail, rope] of changeover) {
      await expect(coach(page).locator(".coach__steps [aria-current='step']")).toHaveAttribute(
        "data-step",
        step,
      );
      await expect(arrow(page)).toHaveAttribute("data-says", says);
      await clipTo(page, key, cowstail, rope);
    }
    // Both on the next rope: the changeover is over, and its card, ring and arrow go.
    await expect(coach(page)).not.toHaveAttribute("data-tip", "anchor", { timeout: 10_000 });
    await expect(named).toBeHidden();
    await expect(arrow(page)).not.toHaveAttribute("data-says", /off|clip/u);
  });
});
