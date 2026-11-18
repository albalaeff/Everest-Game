import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  choice,
  climberScreen,
  openTheGameAsGod,
  packScreen,
  readTheDisclaimer,
  seen,
  setOffChecked,
} from "./climb";
import type { SeenClimber } from "./climb";

/**
 * A hard fall injures, and the rescue (#241). The god mode stages the injury, as it stages a
 * serac's collapse, and runs the long waits faster: Pemba splints the player's broken leg where
 * they lie and carries them down to Base Camp, where the climb ends; and a player who took a
 * rescue kit at Base Camp gets a rope down to Pemba on a crevasse's floor, splints his leg there,
 * hauls him out and takes him on their back.
 */

test.beforeEach(({ hasTouch }) => {
  test.skip(hasTouch, "the god mode stages the injury: a tester's tool, used on a PC");
});

// A small screen, which a slow machine draws sooner.
test.use({ viewport: { width: 640, height: 360 } });

const coach = (page: Page) => page.locator("#coach");
const notice = (page: Page) => page.locator("#camp");
/** Pemba's bubble, saying this line. */
const pemba = (page: Page, cue: string) => page.locator(`#sherpa[data-cue="${cue}"]`);

/** The climb run `times` as fast, by the god mode: the waits of a rescue are long. What happens
 * in a moment is looked for at the climb's own speed, where a slow machine can't miss it. */
const faster = (page: Page, times: number): Promise<void> =>
  page.evaluate((speed) => window.everest.god?.speed(speed), times);

/** How long a part of a rescue may take, the climb run faster on a machine that draws it slowly. */
const SOON = { timeout: 30_000 };
const IN_A_WHILE = { timeout: 120_000 };

/** A climber as the page shows them now. */
const now = async (page: Page, climber: string): Promise<SeenClimber> => {
  const view = await seen(page, climber);
  if (view === null) {
    throw new Error(`The page shows no ${climber}`);
  }
  return view;
};

/** The first crevasse: 12 m deep under its ladder, its floor 52 m along the ground, and its lip
 * on Base Camp's side, where the ladder starts, 39.5 m along. */
const CREVASSE = { floor: 52, byTheLip: 39.3 };

test("a broken leg ends the climb: Pemba splints it where the player lies and carries them down to Base Camp", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openTheGameAsGod(page);
  // On the first slope of the Popcorn, Pemba beside them.
  await page.evaluate(() => {
    window.everest.god?.teleport(24);
    window.everest.god?.injure();
  });

  await expect(coach(page)).toHaveAttribute("data-tip", "broken-leg", SOON);
  await expect(coach(page)).toContainText("Your leg is broken: don't try to stand.");
  // No key takes a step on it.
  const lies = (await now(page, "player")).x;
  await page.keyboard.down("KeyD");
  // Pemba, beside them, kneels to it at once.
  await expect.poll(async () => (await now(page, "pemba")).helping?.kind, SOON).toBe("aid");
  await page.keyboard.up("KeyD");
  expect((await now(page, "player")).x).toBe(lies);
  expect(await now(page, "player")).toMatchObject({ down: true, dead: false });

  // The splint on, he takes them on his back, and says so: at the climb's own speed, his words
  // for the work come as he does it.
  await expect
    .poll(async () => (await now(page, "player")).injuries[0]?.splinted, IN_A_WHILE)
    .toBe(true);
  await expect(pemba(page, "on-my-back")).toBeVisible(IN_A_WHILE);
  expect((await now(page, "player")).carriedBy).toBe("pemba");
  await expect(coach(page)).toHaveAttribute("data-tip", "carried", SOON);
  await faster(page, 20);

  // Set down among the tents, the climb is over.
  await expect(notice(page)).toBeVisible(IN_A_WHILE);
  await expect(page.locator("#camp-title")).toHaveText("Evacuated to Base Camp");
  await expect(notice(page).locator('[data-text="verdict"]')).toContainText(
    "it left you with a broken leg",
  );
  await expect(notice(page).locator('[data-text="debrief"]')).toContainText("Injuries");
  await expect(notice(page).getByRole("button", { name: "Start over" })).toBeVisible();
  expect(await now(page, "player")).toMatchObject({ down: true, carriedBy: null, dead: false });
  expect((await now(page, "player")).x).toBeLessThan(8);
});

test("a player with a rescue kit gets a rope down to Pemba on a crevasse's floor, splints his leg, hauls him out and takes him on their back", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await readTheDisclaimer(page, "/?god");
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  // Base Camp's store has a rescue kit to take; the first-aid kit is in the pack already.
  const pack = packScreen(page);
  await expect(pack.locator('#pack-items [data-item="first-aid"]')).toHaveAttribute(
    "data-packed",
    "yes",
  );
  await pack.getByRole("button", { name: "More: Rescue kit" }).click();
  await expect(pack.locator('#pack-items [data-item="rescue-kit"]')).toHaveAttribute(
    "data-packed",
    "yes",
  );
  await setOffChecked(page);
  await page.waitForFunction(() => "everest" in window && window.everest.god !== undefined);
  await page.evaluate(({ floor, byTheLip }) => {
    window.everest.god?.injure(undefined, "pemba", floor);
    window.everest.god?.teleport(byTheLip);
  }, CREVASSE);
  const lip = await now(page, "player");

  // At the edge over him: two screws for an anchor, and the rope down.
  await expect(coach(page)).toHaveAttribute("data-tip", "casualty-anchor", SOON);
  await expect(coach(page)).toContainText("hold F: two ice screws for an anchor");
  await page.keyboard.down("KeyF");
  await expect.poll(async () => (await now(page, "player")).helping?.kind, SOON).toBe("anchor");
  await faster(page, 20);
  await expect(coach(page)).toHaveAttribute("data-tip", "casualty-rope-down", IN_A_WHILE);
  await page.keyboard.up("KeyF");
  await faster(page, 1);

  // Down it to him, held by it all the way, and first aid where he lies.
  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await now(page, "player")).onLine, SOON).not.toBeNull();
  expect(await now(page, "player")).toMatchObject({ first: null, second: null, lowering: true });
  await faster(page, 20);
  await expect
    .poll(async () => {
      const { onLine, y } = await now(page, "player");
      return onLine === null && y < lip.y - 11;
    }, IN_A_WHILE)
    .toBe(true);
  await page.keyboard.up("KeyS");
  await faster(page, 1);
  expect((await now(page, "player")).falls).toHaveLength(0);
  await expect(coach(page)).toHaveAttribute("data-tip", "casualty-aid", SOON);
  await page.keyboard.down("KeyF");
  await expect.poll(async () => (await now(page, "player")).helping?.kind, SOON).toBe("aid");
  await faster(page, 20);
  await expect
    .poll(async () => (await now(page, "pemba")).injuries[0]?.splinted, IN_A_WHILE)
    .toBe(true);
  await page.keyboard.up("KeyF");
  await faster(page, 1);

  // Back up the rope, clipped in at the edge, and the haul from its anchor.
  await expect(coach(page)).toHaveAttribute("data-tip", "casualty-rope-up", SOON);
  await page.keyboard.down("KeyW");
  await expect.poll(async () => (await now(page, "player")).onLine, SOON).not.toBeNull();
  await faster(page, 20);
  await expect
    .poll(async () => {
      const { onLine, y } = await now(page, "player");
      return onLine === null && y > lip.y - 0.1;
    }, IN_A_WHILE)
    .toBe(true);
  await page.keyboard.up("KeyW");
  await faster(page, 1);
  await expect(coach(page)).toHaveAttribute("data-tip", "casualty-haul", SOON);
  await expect(coach(page)).toContainText("clip in to the fixed rope first, with R");
  await page.keyboard.down("KeyR");
  await expect.poll(async () => (await now(page, "player")).second, SOON).not.toBeNull();
  await page.keyboard.up("KeyR");
  await page.keyboard.down("KeyF");
  await expect.poll(async () => (await now(page, "pemba")).hauled, SOON).toBe(true);
  expect(await now(page, "player")).toMatchObject({
    hauling: true,
    helping: { kind: "line-haul" },
  });

  // Out at the edge, the same hold takes him onto their back, and no longer hold puts him down.
  await faster(page, 20);
  await expect.poll(async () => (await now(page, "player")).carrying, IN_A_WHILE).toBe("pemba");
  await expect(coach(page)).toHaveAttribute("data-tip", "carrying", SOON);
  await faster(page, 1);
  expect(await now(page, "pemba")).toMatchObject({ carriedBy: "player", hauled: false });
  expect((await now(page, "player")).carrying).toBe("pemba");
  await page.keyboard.up("KeyF");

  // Away from the crevasse with him, and down off their back where they stand. Facing the
  // crevasse, the key back turns them first, and held again walks (#235).
  await page.keyboard.down("KeyA");
  await expect
    .poll(async () => {
      const { towardViewer, x } = await now(page, "player");
      return towardViewer || x < lip.x - 0.3;
    }, SOON)
    .toBe(true);
  if ((await now(page, "player")).towardViewer) {
    await page.keyboard.up("KeyA");
    await page.keyboard.down("KeyA");
  }
  await expect.poll(async () => (await now(page, "player")).x, SOON).toBeLessThan(lip.x - 1);
  await page.keyboard.up("KeyA");
  // He is where they are, every step of the way.
  const both = await page.evaluate(() => [
    window.everest.climber("player"),
    window.everest.climber("pemba"),
  ]);
  expect(both[1]).toMatchObject({ x: both[0]?.x, y: both[0]?.y });
  await page.keyboard.down("KeyF");
  await expect.poll(async () => (await now(page, "player")).carrying, SOON).toBeNull();
  await page.keyboard.up("KeyF");
  expect(await now(page, "pemba")).toMatchObject({ carriedBy: null, down: true, dead: false });
});
