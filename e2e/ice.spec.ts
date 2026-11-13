import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { SURE_FOOTED, WALKING, climbFrom, savedPlayer, seen } from "./climb";
import type { SavedClimb } from "./climb";

/**
 * The Icefall's steps of ice with no ladder (route.icefall-ice-steps): the coach says how at the
 * foot of the first, and the player climbs it on their tools, a pick clicked in above their head
 * at a time and the last over its lip, clipped to its rope, the jumar sliding up it. At the crux, a
 * pick swung into its band of brittle ice bites poorly, and the coach warns of it. Going back
 * down, the rope down a step lowers the player down it. A click places the pick: PC stories.
 */

/** The coach's card on the page. */
const coach = (page: Page) => page.locator("#coach");

/** Where the Popcorn's step is in content/route/icefall.json: its face across, its lip's height,
 * and along the ground a little short of its foot, and between its lip and the anchor back from
 * it. */
const STEP = { x: 57.875, lip: 13.5, before: 83.6, onTop: 87.5 };
/** The crux: its face across, its ledge's height and along the ground on the ledge, and its band
 * of brittle ice, 1.9 to 2.3 m up it. */
const CRUX = { x: 214.5, ledge: 39, onTheLedge: 516.5, brittle: 40.95 };

/** The climb from `along`, the player with a second ice tool in their pack, so no swing comes
 * off with no pick in the ice, and its chance set so that no step slips: the story goes as told. */
const from =
  (along: number) =>
  (climb: SavedClimb): void => {
    savedPlayer(climb).along = along;
    climb.random = [...SURE_FOOTED];
    for (const pack of climb.rules.packs?.climbers ?? []) {
      if (pack.id === "player") {
        pack.items["ice-tool"] = 1;
      }
    }
  };

/** Clicks a point of the slope, in its metres. */
async function clickSlope(page: Page, x: number, y: number): Promise<void> {
  const [left = 0, top = 0] = await page.evaluate(
    ([at, up]) => window.everest.screenAt(at ?? 0, up ?? 0),
    [x, y],
  );
  await page.mouse.click(left, top);
}

test("climbs the Popcorn's step of ice on the tools, the coach saying how, a pick at a time over its lip", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story: a click places the pick");
  await climbFrom(page, from(STEP.before));

  // Up to the foot of the ice, where there's no ladder: the coach says how.
  await page.keyboard.down("KeyD");
  await expect(coach(page)).toHaveAttribute("data-tip", "ice-wall", WALKING);
  await page.keyboard.up("KeyD");
  await expect(coach(page)).toContainText("no ladder");
  await page.keyboard.press("KeyR");
  await page.keyboard.press("KeyE");
  await page.keyboard.down("Space");
  await page.keyboard.down("KeyW");

  // A pick in above the head, the feet up under it, the next; the last over the lip.
  await expect
    .poll(
      async () => {
        const player = await seen(page, "player");
        if (player === null || player.y >= STEP.lip) {
          return player?.y ?? 0;
        }
        const overTheLip = player.y + 1.9 >= STEP.lip;
        await clickSlope(
          page,
          overTheLip ? STEP.x + 0.3 : STEP.x,
          overTheLip ? STEP.lip : player.y + 1.9,
        );
        return player.y;
      },
      { intervals: [1_500], timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(STEP.lip);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("Space");

  const player = await seen(page, "player");
  expect(player).toMatchObject({ onIce: false, falling: false, dead: false });
  expect(player?.second).toBe("popcorn-wall");
  await expect(coach(page)).not.toHaveAttribute("data-tip", "ice-wall");
});

test("warns of a pick swung into the crux's brittle ice: it bites poorly", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story: a click places the pick");
  await climbFrom(page, from(CRUX.onTheLedge));
  await page.keyboard.down("KeyD");
  await expect.poll(async () => (await seen(page, "player"))?.x ?? 0, WALKING).toBe(CRUX.x);
  await page.keyboard.up("KeyD");

  await clickSlope(page, CRUX.x, CRUX.brittle);

  await expect.poll(async () => (await seen(page, "player"))?.pickPoor, WALKING).toBe(true);
  await expect(coach(page)).toHaveAttribute("data-tip", "pick-poor", WALKING);
  await expect(coach(page)).toHaveAttribute("data-kind", "warning");
});

test("lowers the player going back down the Popcorn's step on its rope: they stop at the edge, and S takes them down", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await climbFrom(page, from(STEP.onTop));
  await page.keyboard.press("KeyR");
  await page.keyboard.press("KeyE");
  await page.keyboard.down("Space");

  // Back to the edge: clipped to the rope down it, they stop there, and the coach says how.
  await page.keyboard.down("KeyA");
  await expect(coach(page)).toHaveAttribute("data-tip", "rappel", WALKING);
  await page.keyboard.up("KeyA");
  expect(await seen(page, "player")).toMatchObject({ x: STEP.x, y: STEP.lip, falling: false });

  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await seen(page, "player"))?.lowering, WALKING).toBe(true);
  await expect
    .poll(async () => (await seen(page, "player"))?.y ?? STEP.lip, WALKING)
    .toBeLessThan(STEP.lip - 2);
  await page.keyboard.up("KeyS");
  await page.keyboard.up("Space");

  const player = await seen(page, "player");
  expect(player?.falls).toEqual([]);
});
