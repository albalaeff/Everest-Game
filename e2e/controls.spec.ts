import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** One climb, as the page names what the game receives: the same by keys and by touch. */
const THE_CLIMB = [
  "tool ice-axe 0.8 0.5",
  "tool crampons 0.8 -0.5",
  "tool ice-axe -1.2 0.5",
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
  "panel inventory",
  "set-up-tent",
];

function received(page: Page): Locator {
  return page.locator("#received li");
}

function button(page: Page, name: string): Locator {
  return page.locator(`[data-control="${name}"]`);
}

/** The newest action comes first on the page. */
async function expectReceived(page: Page, actions: readonly string[]): Promise<void> {
  await expect(received(page)).toHaveText([...actions].reverse());
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
    await page.goto("/");

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
    await page.keyboard.press("KeyI");
    await page.keyboard.press("KeyT");

    await expectReceived(page, THE_CLIMB);
  });

  test("a player climbs the same way by touch", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await page.goto("/");

    await page.touchscreen.tap(400, 130);
    await page.touchscreen.tap(400, 230);
    await page.touchscreen.tap(200, 130);
    await drag(page, [100, 250], [160, 250]);
    await drag(page, [100, 250], [100, 230]);
    await button(page, "clip-first").tap();
    await button(page, "clip-second").tap();
    await button(page, "jumar").tap();
    await button(page, "oxygen-up").tap();
    await button(page, "oxygen-down").tap();
    await button(page, "check-self").tap();
    await button(page, "radio").tap();
    await button(page, "inventory").tap();
    await button(page, "set-up-tent").tap();

    await expectReceived(page, THE_CLIMB);
  });

  test("a player walks and holds the jumar at once", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await page.goto("/");
    await page.touchscreen.tap(400, 130);
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
      "tool ice-axe 0.8 0.5",
      "walk right",
      "jumar true",
      "walk stop",
      "jumar false",
    ]);
  });

  test("a phone's joystick shows where the thumb lands, and goes", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await page.goto("/");
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
    await page.goto("/");
    await page.touchscreen.tap(400, 130);

    const buttons = await page.locator(".action-button").all();

    expect(buttons).toHaveLength(9);
    for (const found of buttons) {
      await expect(found).toBeInViewport({ ratio: 1 });
      const box = await found.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }
  });

  test("the right thumb's buttons are about a centimetre wide", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "a phone's story");
    await page.goto("/");
    await page.touchscreen.tap(400, 130);

    for (const name of ["clip-first", "clip-second", "jumar", "oxygen-up", "oxygen-down"]) {
      const box = await button(page, name).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(64);
      expect(box?.height).toBeGreaterThanOrEqual(64);
    }
  });

  test("nothing scrolls or zooms under the fingers", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#slope")).toHaveCSS("touch-action", "none");
    await expect(button(page, "radio")).toHaveCSS("touch-action", "none");
  });
});

test("a PC shows each button with its key, and no thumb buttons", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");

  await expect(button(page, "radio")).toHaveText("Radio Q");
  await expect(button(page, "check-self")).toHaveText("Check yourself Tab");
  await expect(button(page, "clip-first")).toBeHidden();
  await expect(button(page, "jumar")).toBeHidden();
});

test("a click on a PC's button does what its key does", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");

  await button(page, "radio").click();
  await page.keyboard.press("Space");

  await expectReceived(page, ["panel radio", "jumar true", "jumar false"]);
});

test("a laptop with a touch screen shows the thumb buttons after its first touch", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story");
  await page.goto("/");

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
    await page.goto("/");
    await page.touchscreen.tap(180, 100);

    await expect(page.getByText("Turn your phone sideways to climb")).toBeVisible();
  });

  test("a narrow window on a PC doesn't", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "a PC's story");
    await page.goto("/");

    await expect(page.getByText("Turn your phone sideways to climb")).toBeHidden();
  });
});

test("a phone in landscape says nothing about turning it", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a phone's story");
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/");
  await page.touchscreen.tap(400, 130);

  await expect(page.getByText("Turn your phone sideways to climb")).toBeHidden();
});
