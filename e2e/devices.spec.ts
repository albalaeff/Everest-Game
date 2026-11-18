import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  SURE_FOOTED,
  WALKING,
  along,
  climbFrom,
  inHand,
  openTheGame,
  savedPlayer,
  seen,
  stage,
} from "./climb";

/**
 * The devices a climber carries (#260): a handheld radio to Base Camp, a GPS watch, a pocket
 * weather meter and a satellite tracker, in one card that [Devices] opens, and [Radio] at the
 * radio. The player sets off alone from Base Camp at night, in clear weather, and uses each where
 * they stand.
 */

// A small screen held sideways, which a slow machine draws sooner.
test.use({ viewport: { width: 640, height: 360 } });

const panel = (page: Page): Locator => page.getByRole("dialog", { name: "Devices" });
const reading = (page: Page, device: string, name: string): Locator =>
  panel(page).locator(`[data-device="${device}"] [data-read="${name}"]`);

/** Goes to a device by its tab. */
async function show(page: Page, device: string): Promise<void> {
  await panel(page).getByRole("tab", { name: device, exact: true }).click();
}

// One climb for the four of them, and a few looks at each: a story's way to the slope, and every
// look at the page, cost CI's runners more than the devices do. What a tracker's messages do
// once they've left is the rule's own tests' (src/simulation/devices.test.ts).
test("a climber uses each device where they stand: the radio, the watch, the meter, the tracker", async ({
  page,
  hasTouch,
}) => {
  test.slow();
  await openTheGame(page);
  // The radio's own button, on a PC too: a click opens what its key does.
  const radio = page.locator('[data-control="radio"]');
  await (hasTouch ? radio.tap() : radio.click());
  await expect(reading(page, "radio", "contact")).toHaveText("Base Camp in range");

  // Base Camp answers from what the mountain is doing: a clear night, well under freezing at
  // its weather station, the sun hours away.
  await panel(page).getByRole("button", { name: "Conditions?" }).click();
  await expect(panel(page).locator(".radio__log")).toContainText(
    /Clear over the Icefall.*It's −\d+\.\d °C here at Base Camp\. The sun reaches the ice in \d h \d\d min\./,
    WALKING,
  );
  // The phrase went to the game as the player's action.
  await expect(page.locator("#received")).toContainText("radio base-camp conditions");

  // The tracker: off as it sets off, and its first point as it starts tracking.
  await show(page, "Tracker");
  const tracker = panel(page).locator('[data-device="tracker"]');
  await expect(reading(page, "tracker", "state")).toHaveText("Tracking off");
  await tracker.getByRole("button", { name: "Start tracking" }).click();
  await expect(reading(page, "tracker", "points")).toHaveText("1", WALKING);
  // A press isn't an SOS: the button is held, as the real one sits under a cover.
  const sos = tracker.getByRole("button", { name: /^SOS/ });
  await sos.click();
  await expect(reading(page, "tracker", "status")).not.toHaveText(/SOS/);
  await sos.dispatchEvent("pointerdown");
  await expect(reading(page, "tracker", "status")).toHaveText(/SOS (sending|sent)/, {
    timeout: 30_000,
  });
  await expect(sos).toBeDisabled();

  // The watch: where they are, what's left, and the sun's hour; no pace yet, still in camp.
  await show(page, "GPS");
  await expect(reading(page, "gps", "where")).toHaveText("On the moraine");
  await expect(reading(page, "gps", "left")).toHaveText(/^\d\.\d km$/);
  await expect(reading(page, "gps", "sun")).toHaveText("06:00");
  await expect(reading(page, "gps", "arrival")).toHaveText("--");

  // The weather meter: the still of a clear night, around −10 °C, which the little wind there is
  // makes feel like −14 on bare skin.
  await show(page, "Weather");
  await expect(reading(page, "wind", "name")).toHaveText("Calm");
  await expect(reading(page, "wind", "now")).toHaveText(/^[345]$/);
  await expect(reading(page, "wind", "air")).toHaveText(/^−1[01]\.\d °C$/);
  await expect(reading(page, "wind", "chill")).toHaveText(/^−1[3-5] °C$/);
  await expect(reading(page, "wind", "risk")).toHaveText(
    "Frostbite risk: moderate. Keep your face and hands covered.",
  );
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

  // The pack takes the devices' place, and gives it back; Esc puts them away.
  await page.keyboard.press("KeyI");
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#inventory")).toBeVisible();
  await page.keyboard.press("KeyG");
  await expect(page.locator("#inventory")).toBeHidden();
  await expect(panel(page)).toBeVisible();
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

test("the climber takes out the device the card shows, holds it walking, and puts it away as the card closes (#271)", async ({
  page,
}) => {
  test.slow();
  await openTheGame(page);
  await expect.poll(() => inHand(page, "player"), WALKING).toBeNull();

  // The card's device comes out into the hand: an action of the game's, as a phrase is.
  await page.keyboard.press("KeyG");
  await expect(panel(page)).toBeVisible();
  await expect.poll(() => inHand(page, "player"), WALKING).toBe("radio");
  await expect(page.locator("#received")).toContainText("device radio");
  // Another tab, another device: the first goes back for it.
  await show(page, "GPS");
  await expect.poll(() => inHand(page, "player"), WALKING).toBe("gps");

  // They walk on with it in the hand.
  const from = await along(page, "player");
  await page.keyboard.down("KeyD");
  await expect.poll(() => along(page, "player"), WALKING).toBeGreaterThan(from + 1);
  await page.keyboard.up("KeyD");
  expect(await inHand(page, "player")).toBe("gps");

  // The card closes, and the hand is empty.
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect.poll(() => inHand(page, "player"), WALKING).toBeNull();
  await expect(page.locator("#received")).toContainText("device none");
});
