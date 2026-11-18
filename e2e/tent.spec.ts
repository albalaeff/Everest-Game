import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { WALKING, climbFrom, inHand, savedPlayer, seen } from "./climb";

/**
 * The camps' tents (#258): a button over the tent whose door the climber stands at takes them in,
 * the slope shows them through the door, and the tent's inside opens over it, cut open from end to
 * end, with a panel of what there is and the chores. The stove burns while a chore of its is in
 * hand; [Devices] opens the devices' card over the tent, and the person takes up the one it shows
 * (#271); a sleep alone passes the night at once; [Leave the tent] goes out again. Base Camp's
 * kitchen never runs out and has the guitar; Camp 1 has the gas and the meals carried up to it.
 * The panel is in marks and few words (#264): each button and row says the whole in a sentence,
 * as its tooltip and its name to a screen reader, which is what the stories read.
 * Two stories, each through a whole visit: a story's start costs more of CI's time than its steps.
 */

/** A step from the door of Base Camp's nearer tent, 8.25 m along the ground, and from the door
 * of Camp 1's first, 660.375 m along (content/route/icefall.json). */
const AT_BASE_CAMP = 8.9;
const AT_CAMP_1 = 660.6;

/** The wait for the slope to show the climber through the door, a few seconds of play, in
 * frames a headless browser draws in software. */
const THROUGH_THE_DOOR = { timeout: 30_000 };

const tent = (page: Page): Locator => page.getByRole("dialog", { name: "Your tent" });
const door = (page: Page): Locator => page.locator("#tent-door");
const picture = (page: Page): Locator => page.locator("#tent .tent-picture");
const chore = (page: Page, name: string): Locator => tent(page).locator(`[data-chore="${name}"]`);
const stock = (page: Page, name: string): Locator =>
  tent(page).locator(`[data-stock="${name}"] output`);
const feel = (page: Page): Locator => tent(page).locator('[data-text="feel"]');
const note = (page: Page): Locator => tent(page).locator(".tent-note");

// A fault on one browser alone would otherwise show only as a wait that ran out: each story
// says the page's errors in CI's log.
test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    console.log(`Page error (${test.info().project.name}): ${error.stack ?? error.message}`);
  });
});

/** A press of one of the page's buttons, by a click or a tap: the button over a door follows
 * the camera, which a click waits to see still. */
async function press(target: Locator): Promise<void> {
  await target.dispatchEvent("click");
}

/** In at the door the climber stands at, through to the tent's inside. */
async function goIn(page: Page): Promise<void> {
  await expect(door(page)).toBeVisible(WALKING);
  await expect(door(page)).toContainText("Enter the tent");
  await press(door(page));
  await expect.poll(async () => (await seen(page, "player"))?.sheltered, WALKING).toBe(true);
  await expect(tent(page)).toBeVisible(THROUGH_THE_DOOR);
  await expect(door(page)).toBeHidden();
}

test("at Base Camp the button over a tent's door takes the climber in: the tent shows what there is, the stove burns, a night passes in a sleep, and the way out closes it", async ({
  page,
}) => {
  test.slow();
  await climbFrom(page, (climb) => {
    savedPlayer(climb).along = AT_BASE_CAMP;
  });
  await expect.poll(() => seen(page, "player")).not.toBeNull();
  await expect(tent(page)).toBeHidden();

  await goIn(page);

  // The panel: where and when, how they feel, what there is, and a button a chore, each a mark
  // and a word, with what it takes and gives as marks with numbers.
  await expect(page.locator("#slope")).toHaveAttribute("data-passage", "inside");
  await expect(tent(page).locator('[data-text="where"]')).toHaveText(/^Base Camp · 5,3\d\d m$/);
  await expect(tent(page).locator('[data-text="clock"]')).toHaveText(/^0[34]:\d\d$/);
  await expect(feel(page)).toHaveAttribute("aria-label", /^You feel .+\.$/);
  await expect(stock(page, "water")).toHaveText("2/3 L");
  await expect(tent(page).locator('[data-stock="water"]')).toHaveAttribute(
    "title",
    "Water: 2 of 3 L",
  );
  await expect(stock(page, "gas")).toHaveText("∞");
  await expect(stock(page, "meals")).toHaveText("∞");
  await expect(stock(page, "bars")).toHaveText("2");
  await expect(tent(page).locator(".tent-chores button")).toHaveCount(5);
  await expect(chore(page, "melt")).toHaveAttribute(
    "aria-label",
    "Melt snow: 12 min and 38 g of gas for 1 L of water",
  );
  await expect(chore(page, "melt").locator(".tent-chip")).toHaveText(["12 min", "38 g", "+1 L"]);
  await expect(chore(page, "cook")).toContainText("600 kcal");
  await expect(chore(page, "sleep")).toHaveAttribute(
    "aria-label",
    "Sleep until the alarm at 02:00",
  );
  await expect(chore(page, "guitar")).toBeEnabled();
  await expect(note(page)).toBeHidden();

  // The picture: the tent, the person in it with a face, the stove, the pack and the guitar.
  for (const part of [".tent-room-wall", ".dw-head", ".dw-eye", ".tent-stove", ".tent-pack"]) {
    await expect(picture(page).locator(part).first()).toBeAttached();
  }
  await expect(picture(page)).toHaveAttribute("data-ground", "rubble");
  await expect(picture(page).locator(".tent-guitar-rest")).toBeVisible();
  await expect(picture(page).locator('.tent-props [data-bottle="0"]')).toBeVisible();

  // The stove: lit with the door open for its fumes, and out again when the chore is stopped.
  // The litre it melts is the core's story (src/content/tent.story.test.ts).
  // What a press does shows on the next frames, which WebKit draws in software slowly on CI.
  await press(chore(page, "melt"));
  await expect(chore(page, "melt")).toHaveAttribute("data-state", "doing", WALKING);
  await expect(chore(page, "melt")).toHaveAttribute(
    "aria-label",
    /^Melt snow: \d+ min left\. Press to stop$/,
  );
  await expect(chore(page, "melt")).toContainText("Stop");
  await expect(note(page)).toHaveText("Door open for the fumes");
  // They light the stove first, then stir the pot with the spoon in the fist (#269).
  await expect(picture(page)).toHaveAttribute("data-doing", "melt", WALKING);
  await expect(picture(page)).toHaveAttribute("data-act", "melt", WALKING);
  await expect(picture(page)).toHaveAttribute("data-holds", /stirrer|snow/, WALKING);
  await expect(picture(page)).toHaveAttribute("data-flame", "on");
  await expect(picture(page)).toHaveAttribute("data-door", "open");
  await press(chore(page, "melt"));
  await expect(chore(page, "melt")).toHaveAttribute("data-state", "ready", WALKING);
  await expect(note(page)).toBeHidden();
  await expect(picture(page)).toHaveAttribute("data-flame", "off", WALKING);

  // A drink is the pack's, and [Pack] opens its card over the tent, with the camp's store.
  await press(tent(page).getByRole("button", { name: "Drink" }));
  await expect(stock(page, "water")).toHaveText("1.5/3 L", WALKING);
  await press(tent(page).getByRole("button", { name: "Pack" }));
  const inventory = page.locator("#inventory");
  await expect(inventory).toBeVisible();
  await expect(inventory).toContainText("At Base Camp: take from its store");
  await inventory.getByRole("button", { name: "Close" }).dispatchEvent("click");
  await expect(inventory).toBeHidden();

  // [Devices] opens their card over the tent (#271), and the person takes up the one it shows:
  // the radio from where it lies on the pad, a phrase talked into it, then the weather meter
  // out of the chest pocket and held out at the door, which opens for it; and back as it closes.
  const devices = page.getByRole("dialog", { name: "Devices" });
  await press(tent(page).getByRole("button", { name: /^Your devices/ }));
  await expect(devices).toBeVisible();
  await expect.poll(() => inHand(page, "player"), WALKING).toBe("radio");
  await expect(picture(page)).toHaveAttribute("data-act", "radio", THROUGH_THE_DOOR);
  await expect(picture(page)).toHaveAttribute("data-holds", "radio");
  await expect(picture(page).locator(".tent-props .tent-radio")).toBeHidden();
  await press(devices.getByRole("button", { name: "Radio check" }));
  await expect(picture(page)).toHaveAttribute("data-act", "radio-talk", WALKING);
  await expect(devices.locator(".radio__log")).toContainText("Loud and clear", WALKING);
  await press(devices.getByRole("tab", { name: "Weather", exact: true }));
  await expect.poll(() => inHand(page, "player"), WALKING).toBe("wind");
  await expect(picture(page)).toHaveAttribute("data-act", "meter", THROUGH_THE_DOOR);
  await expect(picture(page)).toHaveAttribute("data-holds", "meter");
  await expect(picture(page)).toHaveAttribute("data-door", "open");
  await expect(picture(page).locator(".tent-props .tent-radio")).toBeVisible();
  await press(devices.getByRole("button", { name: "Close" }));
  await expect(devices).toBeHidden();
  await expect.poll(() => inHand(page, "player"), WALKING).toBeNull();
  await expect(picture(page)).toHaveAttribute("data-act", "idle", THROUGH_THE_DOOR);
  await expect(picture(page)).toHaveAttribute("data-door", "shut");

  // A sleep alone passes the night at once: 23 hours less the minutes since 03:00. The picture
  // shows them into the bag, asleep for a moment, and up again with a stretch.
  await press(chore(page, "sleep"));
  await expect(tent(page).locator('[data-text="clock"]')).toHaveText(/^02:0\d$/, WALKING);
  await expect(tent(page).locator('[data-text="slept"]')).toHaveText(/^Slept 22 h \d+ min$/);
  await expect(picture(page)).toHaveAttribute("data-asleep", "yes", WALKING);
  await expect(picture(page)).toHaveAttribute("data-asleep", "no", THROUGH_THE_DOOR);
  await expect(feel(page)).not.toHaveAttribute("aria-label", /sleepy/);

  // Out: the screen closes behind them, and the button is over the door again.
  await press(tent(page).getByRole("button", { name: "Leave the tent" }));
  await expect.poll(async () => (await seen(page, "player"))?.sheltered, WALKING).toBe(false);
  await expect(tent(page)).toBeHidden(THROUGH_THE_DOOR);
  await expect(page.locator("#slope")).toHaveAttribute("data-passage", "outside", THROUGH_THE_DOOR);
  await expect(door(page)).toBeVisible(WALKING);
});

test("Camp 1's tent stands on snow, with the gas and the meals carried up, and no guitar", async ({
  page,
}) => {
  await climbFrom(page, (climb) => {
    savedPlayer(climb).along = AT_CAMP_1;
  });
  // The arrival's notice first: the climber is in the camp.
  const arrival = page.getByRole("dialog", { name: "Camp 1" });
  await expect(arrival).toBeVisible(WALKING);
  await press(arrival.getByRole("button", { name: "Continue" }));
  await expect(arrival).toBeHidden();

  await goIn(page);

  await expect(tent(page).locator('[data-text="where"]')).toHaveText(/^Camp 1 · 5,8\d\d m$/);
  await expect(stock(page, "gas")).toHaveText("454 g");
  await expect(stock(page, "meals")).toHaveText("6");
  await expect(chore(page, "guitar")).toBeDisabled();
  await expect(chore(page, "guitar")).toHaveAttribute(
    "aria-label",
    "Play the guitar: the guitar stays at Base Camp",
  );
  await expect(chore(page, "guitar").locator('[data-lacking="yes"]')).toHaveText("Base Camp");
  await expect(picture(page)).toHaveAttribute("data-ground", "snow");
  await expect(picture(page).locator(".tent-guitar-rest")).toBeHidden();
  await expect(picture(page).locator(".tent-duffel")).toBeHidden();
});
