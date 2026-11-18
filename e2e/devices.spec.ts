import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { SURE_FOOTED, WALKING, climbFrom, openTheGame, savedPlayer, seen, stage } from "./climb";

/**
 * The devices a climber carries (#260): a handheld radio to Base Camp, a GPS watch, a pocket wind
 * meter and a satellite tracker, in one card that [Devices] opens, and [Radio] at the radio. The
 * player sets off alone from Base Camp at night, in clear weather, and uses each where they stand.
 */

// A small screen held sideways, which a slow machine draws sooner.
test.use({ viewport: { width: 640, height: 360 } });

const panel = (page: Page): Locator => page.getByRole("dialog", { name: "Devices" });
const reading = (page: Page, device: string, name: string): Locator =>
  panel(page).locator(`[data-device="${device}"] [data-read="${name}"]`);

/** The keys of the menu's controls the stories use on a PC. */
const KEYS: Readonly<Record<string, string>> = {
  radio: "KeyQ",
  devices: "KeyG",
  inventory: "KeyI",
};

/** Uses one of the menu's controls: its button under a finger on a phone, its key on a PC, where
 * a window this small has a card over part of the menu. */
async function press(page: Page, control: string, hasTouch: boolean): Promise<void> {
  if (hasTouch) {
    await page.locator(`[data-control="${control}"]`).tap();
  } else {
    await page.keyboard.press(KEYS[control] ?? control);
  }
}

/** Goes to a device by its tab. */
async function show(page: Page, device: string): Promise<void> {
  await panel(page).getByRole("tab", { name: device, exact: true }).click();
}

// One climb for the four of them: each story's way to the slope costs CI's runners more than the
// devices do.
test("a climber uses each device where they stand: the radio, the watch, the meter, the tracker", async ({
  page,
  hasTouch,
}) => {
  test.slow();
  await openTheGame(page);
  // The radio's own button, on a PC too: a click opens what its key does.
  const radio = page.locator('[data-control="radio"]');
  await (hasTouch ? radio.tap() : radio.click());

  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("tab", { name: "Radio" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(reading(page, "radio", "contact")).toHaveText("Base Camp in range");
  const log = panel(page).locator(".radio__log");

  // Base Camp answers from what the mountain is doing: the place, and a clear night's sun.
  await panel(page).getByRole("button", { name: "Report position" }).click();
  await expect(log).toContainText(/Base Camp, I'm at the moraine, 5,\d{3} m\./);
  await expect(log).toContainText(/Copy: the moraine, 5,\d{3} m, at 0\d:\d\d\./, WALKING);
  await panel(page).getByRole("button", { name: "Conditions?" }).click();
  await expect(log).toContainText("Clear over the Icefall", WALKING);
  await expect(log).toContainText(/The sun reaches the ice in \d h \d\d min\./);
  // Each phrase went to the game as the player's action.
  await expect(page.locator("#received")).toContainText("radio base-camp conditions");

  // The tracker next, so its messages leave while the other two are read: off as it sets off.
  await show(page, "Tracker");
  const tracker = panel(page).locator('[data-device="tracker"]');
  await expect(reading(page, "tracker", "state")).toHaveText("Tracking off");
  await expect(reading(page, "tracker", "battery")).toHaveText("100%");
  await tracker.getByRole("button", { name: "Start tracking" }).click();
  await expect(reading(page, "tracker", "state")).toHaveText(
    "Tracking · a point every 10 min",
    WALKING,
  );
  await expect(reading(page, "tracker", "points")).toHaveText("1");
  await expect(tracker.getByRole("button", { name: "Stop tracking" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await tracker.getByRole("button", { name: "Send check-in" }).click();
  // A press isn't an SOS: the button is held, as the real one sits under a cover.
  const sos = tracker.getByRole("button", { name: /^SOS/ });
  await sos.click();
  await expect(reading(page, "tracker", "status")).not.toHaveText(/SOS/);
  await sos.dispatchEvent("pointerdown");
  await expect(reading(page, "tracker", "status")).toHaveText(/SOS (sending|sent)/, {
    timeout: 30_000,
  });

  // The watch: where they are, what's left, and the sun's hour; no pace yet, steps out of camp.
  await show(page, "GPS");
  await expect(reading(page, "gps", "where")).toHaveText("On the moraine");
  await expect(reading(page, "gps", "altitude")).toHaveText(/^5,\d{3} m$/);
  await expect(reading(page, "gps", "left-label")).toHaveText("To Camp 1");
  await expect(reading(page, "gps", "left")).toHaveText(/^\d\.\d km$/);
  await expect(reading(page, "gps", "sun")).toHaveText("06:00");
  await expect(reading(page, "gps", "arrival")).toHaveText("--");
  await expect(panel(page).locator(".watch__route")).toHaveAttribute("d", /^M[\d.]+ [\d.]+L/);

  // The meter: the still of a clear night.
  await show(page, "Wind");
  await expect(reading(page, "wind", "now")).toHaveText(/^[345]$/);
  await expect(reading(page, "wind", "name")).toHaveText("Calm");

  // Back at the tracker, the check-in and the SOS have left: a few of the mountain's minutes.
  await show(page, "Tracker");
  await expect(reading(page, "tracker", "status")).toHaveText(
    "SOS sent: Base Camp has your position",
    { timeout: 30_000 },
  );
  await expect(reading(page, "tracker", "check-ins")).toHaveText("1");
  await expect(sos).toBeDisabled();

  // The pack takes the devices' place, and gives it back; the same control closes them.
  await press(page, "inventory", hasTouch);
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#inventory")).toBeVisible();
  await press(page, "devices", hasTouch);
  await expect(page.locator("#inventory")).toBeHidden();
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('[data-control="devices"]')).toHaveAttribute("aria-expanded", "true");
  await press(page, "devices", hasTouch);
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('[data-control="devices"]')).toHaveAttribute("aria-expanded", "false");
});

test("the keys open the devices, go between them, and close them", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "a PC's story");
  await openTheGame(page);
  const tab = (name: string) => panel(page).getByRole("tab", { name, exact: true });

  await page.keyboard.press("KeyG");
  await expect(panel(page)).toBeVisible();
  await expect(tab("Radio")).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(tab("GPS")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Tracker")).toHaveAttribute("aria-selected", "true");

  // Down to the tracker's first button, and Enter presses it.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(reading(page, "tracker", "state")).toHaveText(/^Tracking · /, WALKING);

  // Q goes to the radio, and Q again puts it away; G brings back the device used last.
  await page.keyboard.press("KeyQ");
  await expect(tab("Radio")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("KeyQ");
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press("KeyG");
  await expect(tab("Radio")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
});

test("hanging in a crevasse, the radio has no contact, the watch no fix and the tracker no sky", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "a PC's story: the fall is staged with its keys");
  // The fall alone takes most of the default minute on CI's two cores (e2e/training.spec.ts).
  test.slow();
  // At the near lip of the big crevasse, its ladder staged to break a metre out, and no step on
  // it slipping before it does; Pemba across it.
  await climbFrom(page, (climb) => {
    savedPlayer(climb).along = 319.75;
    const pemba = climb.rules["slope-physics"].climbers.find(({ id }) => id === "pemba");
    if (pemba !== undefined) {
      pemba.along = 383;
    }
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
  await expect
    .poll(async () => (await seen(page, "player"))?.hanging, { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.up("KeyD");

  // Ice between the radio and Base Camp: the call for help, the last of its phrases, gets static.
  await page.keyboard.press("KeyQ");
  await expect(reading(page, "radio", "contact")).toHaveText(
    "No contact: ice between you and Base Camp",
  );
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  const log = panel(page).locator(".radio__log");
  await expect(log).toContainText("Base Camp, I need help at the maze.");
  await expect(log).toContainText("Only static. Nothing gets out from down here.", WALKING);

  await page.keyboard.press("ArrowRight");
  await expect(reading(page, "gps", "where")).toHaveText("No fix: no sky down here");
  // The last fix stays on the screen: the lip they fell from.
  await expect(reading(page, "gps", "altitude")).toHaveText(/^5,\d{3} m$/);
  await expect(panel(page).locator(".watch__dot")).toHaveAttribute("cx", /^\d/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(reading(page, "tracker", "status")).toHaveText("No sky: nothing leaves from here");
});
