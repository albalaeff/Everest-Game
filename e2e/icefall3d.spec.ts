import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { WALKING, along, choice, climberScreen, readTheDisclaimer, setOffChecked } from "./climb";

/**
 * The Icefall in 3D, through the climber's own eyes (#311): with `?3d` in the address the climb
 * alone is drawn in three dimensions, on the same simulation, and walked with the same keys. A
 * PC's for now: the phones' sticks and drags come with their own issue.
 */

test.beforeEach(({ hasTouch }) => {
  test.skip(hasTouch, "the 3D picture is a PC's until the phones' issue");
});

// A small screen, which a machine with no graphics card draws sooner.
test.use({ viewport: { width: 640, height: 360 } });

/** A machine with no graphics card draws the whole glacier in software: seconds a frame. */
const DRAWN = { timeout: 120_000 };

/** What the 3D picture says it drew, in `#slope`'s data attributes. */
async function drawn(page: Page): Promise<Record<string, string | undefined>> {
  return page.evaluate(() => {
    const { view, frames, triangles, facing } =
      document.querySelector<HTMLElement>("#slope")?.dataset ?? {};
    return { view, frames, triangles, facing };
  });
}

/** Opens the game on a new climb alone in 3D, and waits for the level to be built and drawn. */
async function openTheIcefallIn3d(page: Page): Promise<void> {
  await readTheDisclaimer(page, "/?3d");
  await choice(page, "Alone").click();
  await climberScreen(page).getByRole("button", { name: "Climb" }).click();
  await setOffChecked(page);
  await expect.poll(async () => Number((await drawn(page)).frames ?? 0), DRAWN).toBeGreaterThan(2);
}

test.describe("the Icefall in 3D", () => {
  test.setTimeout(240_000);

  test("is drawn in three dimensions, within a laptop's budget of triangles", async ({ page }) => {
    await openTheIcefallIn3d(page);
    const picture = await drawn(page);
    expect(picture.view).toBe("3d");
    expect(Number(picture.triangles)).toBeGreaterThan(200_000);
    expect(Number(picture.triangles)).toBeLessThan(900_000);
    // The middle of the screen is the glacier ahead, not an empty canvas.
    const [red = 0, green = 0, blue = 0] = await page.evaluate(() =>
      window.everest.pixelAt(320, 250),
    );
    expect(red + green + blue).toBeGreaterThan(0);
  });

  test("walks up the route on a push forward, and back down it on a push back", async ({
    page,
  }) => {
    await openTheIcefallIn3d(page);
    const start = await along(page, "player");
    await page.keyboard.down("KeyW");
    await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(start + 1);
    await page.keyboard.up("KeyW");
    const ahead = await along(page, "player");
    await page.keyboard.down("KeyS");
    await expect.poll(() => along(page, "player"), WALKING).toBeLessThan(ahead - 0.5);
    await page.keyboard.up("KeyS");
  });

  test("turns the head with the keys to the sides, and the climber stays where they are", async ({
    page,
  }) => {
    await openTheIcefallIn3d(page);
    const start = await along(page, "player");
    const before = (await drawn(page)).facing;
    await page.keyboard.down("KeyA");
    await expect.poll(async () => (await drawn(page)).facing, DRAWN).not.toBe(before);
    await page.keyboard.up("KeyA");
    expect(await along(page, "player")).toBeCloseTo(start, 1);
  });
});
