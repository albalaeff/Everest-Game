import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { WALKING, along, atRest, openTheGame, seen } from "./climb";

/**
 * One climb, as the page names what the game receives: the same by keys and by touch. The climber
 * starts 10 m along the flat, under the camera's anchor, a third of the screen from the left and
 * 60% down: 18 px a metre on a screen 360 high (e2e/slope.spec.ts).
 */
const THE_CLIMB = [
  "tool ice-axe 20.37 4.78",
  "tool crampons 20.37 -0.78",
  "tool ice-axe 9.26 4.78",
  "pace faster",
  "walk right",
  "pace steady",
  "walk stop",
  "pace rest-step",
  "walk up",
  "pace steady",
  "walk stop",
  "clip first",
  "clip second",
  "jumar true",
  "jumar false",
  "oxygen up",
  "oxygen down",
  "check-self",
  "panel radio",
  "panel devices",
  "panel inventory",
  "set-up-tent",
  "view farther",
  "view closer",
];

function received(page: Page): Locator {
  return page.locator("#received li");
}

function button(page: Page, name: string): Locator {
  return page.locator(`[data-control="${name}"]`);
}

/** A box on the screen, in CSS pixels from its top left corner. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The boxes of what `selector` matches, in one round trip to the page. A round trip to a headless
 * browser waits for a frame of its picture, drawn in software, and on CI's runners that's up to a
 * third of a second (PR #157); Playwright's `boundingBox` takes several.
 */
async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate(
    (found) =>
      [...document.querySelectorAll(found)].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    selector,
  );
}

/**
 * A thumb on a button: a real touch at its middle, where it's drawn. Playwright's tap first waits
 * for frames in which the button stands still and checks what's under the touch, a dozen round
 * trips, and eleven such taps took a story past its minute on CI. A button never moves, and what
 * the touch does says whether it landed.
 */
async function tapButton(page: Page, name: string): Promise<void> {
  const [box] = await boxesOf(page, `[data-control="${name}"]`);
  if (box === undefined) {
    throw new Error(`There's no ${name} button on the page`);
  }
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** The newest action comes first on the page. */
async function expectReceived(page: Page, actions: readonly string[]): Promise<void> {
  await expect(received(page)).toHaveText([...actions].reverse());
}

/**
 * A finger on the slope, through the locator, which waits for the page to settle: a touch sent as
 * it loads can land scaled by 640/980, Chromium's phone layout from before the viewport tag.
 */
async function tap(page: Page, x: number, y: number): Promise<void> {
  await page.locator("#slope").tap({ position: { x, y } });
}

/** A thumb's drag: Playwright's touchscreen only taps, so its Pointer Events are made by hand. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const slope = page.locator("#slope");
  const thumb = { pointerId: 7, pointerType: "touch", isPrimary: true };
  const [fromX, fromY] = from;
  const [toX, toY] = to;
  await slope.dispatchEvent("pointerdown", { ...thumb, clientX: fromX, clientY: fromY });
  await slope.dispatchEvent("pointermove", { ...thumb, clientX: toX, clientY: toY });
  await slope.dispatchEvent("pointerup", { ...thumb, clientX: toX, clientY: toY });
}

test.describe("on a screen of 640 by 360", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("a player climbs by keys and the mouse", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);

    await page.mouse.click(400, 130);
    await page.mouse.click(400, 230);
    await page.mouse.click(200, 130);
    await page.keyboard.down("Shift");
    await page.keyboard.down("KeyD");
    await page.keyboard.up("Shift");
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyC");
    await page.keyboard.down("KeyW");
    await page.keyboard.up("KeyC");
    await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyE");
    await page.keyboard.press("KeyR");
    await page.keyboard.press("Space");
    await page.keyboard.press("Equal");
    await page.keyboard.press("Minus");
    await page.keyboard.press("Tab");
    await page.keyboard.press("KeyQ");
    await page.keyboard.press("KeyG");
    await page.keyboard.press("KeyI");
    await page.keyboard.press("KeyT");
    await page.keyboard.press("KeyZ");
    await page.keyboard.press("KeyX");

    await expectReceived(page, THE_CLIMB);
  });

  test("a player climbs the same way by touch", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    // Fifteen touches, over a hundred round trips: half a minute on CI's slowest runners.
    test.slow();
    await openTheGame(page);

    await tap(page, 400, 130);
    await tap(page, 400, 230);
    await tap(page, 200, 130);
    await drag(page, [100, 250], [160, 250]);
    await drag(page, [100, 250], [100, 230]);
    await tapButton(page, "clip-first");
    await tapButton(page, "clip-second");
    await tapButton(page, "jumar");
    await tapButton(page, "oxygen-up");
    await tapButton(page, "oxygen-down");
    await tapButton(page, "check-self");
    await tapButton(page, "radio");
    await tapButton(page, "devices");
    await tapButton(page, "inventory");
    await tapButton(page, "set-up-tent");
    await tapButton(page, "view-farther");
    await tapButton(page, "view-closer");

    await expectReceived(page, THE_CLIMB);
  });

  test("A turns the climber to face the player, and A again walks them back", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);
    const slope = page.locator("#slope");
    const from = await atRest(page, "player");
    await expect(slope).toHaveAttribute("data-facing", "side");

    await page.keyboard.press("KeyA");
    await expect(slope).toHaveAttribute("data-facing", "viewer");
    expect(await seen(page, "player")).toMatchObject({ facing: 1, towardViewer: true });
    expect(await atRest(page, "player")).toBeCloseTo(from, 1);

    await page.keyboard.down("KeyA");
    await expect.poll(() => along(page, "player"), WALKING).toBeLessThan(from - 0.3);
    await page.keyboard.up("KeyA");
    await expect(slope).toHaveAttribute("data-facing", "side");
    expect(await seen(page, "player")).toMatchObject({ facing: -1, towardViewer: false });
    await expectReceived(page, ["turn viewer", "walk stop", "walk left", "walk stop"]);
  });

  test("a thumb pushed back turns the climber to face the player, and pushed back again walks them", async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    const slope = page.locator("#slope");
    await expect(slope).toHaveAttribute("data-facing", "side");

    await drag(page, [100, 250], [40, 250]);
    await expect(slope).toHaveAttribute("data-facing", "viewer");
    expect(await seen(page, "player")).toMatchObject({ facing: 1, towardViewer: true });

    await drag(page, [100, 250], [40, 250]);
    await expect(slope).toHaveAttribute("data-facing", "side");
    expect(await seen(page, "player")).toMatchObject({ facing: -1, towardViewer: false });
    // Pushed all the way, the joystick hurries too: the pace goes with each push.
    await expectReceived(page, [
      "pace faster",
      "turn viewer",
      "pace steady",
      "walk stop",
      "pace faster",
      "walk left",
      "pace steady",
      "walk stop",
    ]);
  });

  test("a player walks and holds the jumar at once", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    await tap(page, 400, 130);
    const thumb = { pointerId: 7, pointerType: "touch", isPrimary: true };
    const other = { pointerId: 8, pointerType: "touch", isPrimary: false };
    const slope = page.locator("#slope");
    const jumar = button(page, "jumar");

    await slope.dispatchEvent("pointerdown", { ...thumb, clientX: 100, clientY: 250 });
    await slope.dispatchEvent("pointermove", { ...thumb, clientX: 140, clientY: 250 });
    await jumar.dispatchEvent("pointerdown", other);
    await expect(jumar).toHaveClass(/action-button--pressed/);
    await slope.dispatchEvent("pointerup", { ...thumb, clientX: 140, clientY: 250 });
    await jumar.dispatchEvent("pointerup", other);

    await expect(jumar).not.toHaveClass(/action-button--pressed/);
    await expectReceived(page, [
      "tool ice-axe 20.37 4.78",
      "walk right",
      "jumar true",
      "walk stop",
      "jumar false",
    ]);
  });

  test("a phone's joystick shows where the thumb lands, and goes", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    const slope = page.locator("#slope");
    const thumb = { pointerId: 7, pointerType: "touch", clientX: 100, clientY: 250 };

    await expect(page.locator("#joystick")).toBeHidden();
    await slope.dispatchEvent("pointerdown", thumb);
    await expect(page.locator("#joystick")).toBeVisible();
    await slope.dispatchEvent("pointerup", thumb);

    await expect(page.locator("#joystick")).toBeHidden();
  });

  test("a phone's buttons are at least a fingertip, and all on the screen", async ({
    page,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    await tap(page, 400, 130);

    const buttons = await page.locator(".action-button").all();

    expect(buttons).toHaveLength(13);
    // All in one go: each check waits for a frame, and CI's frames are seconds apart.
    await Promise.all(buttons.map((found) => expect(found).toBeInViewport({ ratio: 1 })));
    for (const box of await boxesOf(page, ".action-button")) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  });

  test("the right thumb's buttons are about a centimetre wide", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    await tap(page, 400, 130);

    for (const name of [
      "clip-first",
      "clip-second",
      "jumar",
      "haul",
      "oxygen-up",
      "oxygen-down",
      "view-farther",
      "view-closer",
    ]) {
      const [box] = await boxesOf(page, `[data-control="${name}"]`);
      expect(box?.width).toBeGreaterThanOrEqual(64);
      expect(box?.height).toBeGreaterThanOrEqual(64);
    }
  });

  test("nothing scrolls or zooms under the fingers", async ({ page }) => {
    await openTheGame(page);

    await expect(page.locator("#slope")).toHaveCSS("touch-action", "none");
    await expect(button(page, "radio")).toHaveCSS("touch-action", "none");
  });
});

test("a PC shows each button with its key, and no thumb buttons", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);

  await expect(button(page, "radio")).toHaveText("Radio Q");
  await expect(button(page, "check-self")).toHaveText("Check yourself Tab");
  await expect(button(page, "view-farther")).toHaveText("- Z");
  await expect(button(page, "view-closer")).toHaveText("+ X");
  await expect(button(page, "clip-first")).toBeHidden();
  await expect(button(page, "jumar")).toBeHidden();
});

test("a click on a PC's button does what its key does", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);

  await button(page, "radio").click();
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyF");

  await expectReceived(page, [
    "panel radio",
    "jumar true",
    "jumar false",
    "haul true",
    "haul false",
  ]);
});

test("a laptop with a touch screen shows the thumb buttons after its first touch", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);

  await page.locator("#slope").dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: 900,
    clientY: 300,
  });

  await expect(button(page, "jumar")).toBeVisible();
});

test.describe("held upright", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("a phone asks to be turned sideways", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await openTheGame(page);
    await page.touchscreen.tap(180, 100);

    await expect(page.getByText("Turn your phone sideways to climb")).toBeVisible();
  });

  test("a narrow window on a PC doesn't", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "a PC's story");
    await openTheGame(page);

    await expect(page.getByText("Turn your phone sideways to climb")).toBeHidden();
  });
});

test("a phone in landscape says nothing about turning it", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a phone's story");
  await page.setViewportSize({ width: 640, height: 360 });
  await openTheGame(page);
  await tap(page, 400, 130);

  await expect(page.getByText("Turn your phone sideways to climb")).toBeHidden();
});
