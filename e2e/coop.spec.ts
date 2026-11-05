import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { WALKING, along, atRest, openARoom, readTheDisclaimer, roomNotice, seen } from "./climb";

/**
 * Cross-play (spec.md → Phone and PC): a PC and a phone in one room, on the room server
 * `npm run room` serves on this machine, climb the Icefall's first ladder together. The phone is
 * the project's, and the PC a desktop browser beside it of the same engine: Chrome beside the
 * Pixel, Safari beside the iPhone. The PC opens the room and climbs as `player`, from 10 m along
 * Base Camp's flat; the phone joins by the link and climbs as `teammate`, from 12 m. The ground
 * rises 5 m to the foot of the ladder up the first block, 32 m across, and the block's top is
 * 3 m up the ladder (content/route/icefall.json).
 */

const LADDER_FOOT = 32;
const BLOCK_TOP = 8;

/** The walk to the ladder and the climb up it, in the room's real time: a room keeps the
 * mountain's clock whatever the browsers draw, so neither can be put partway along. */
const CLIMBING = { timeout: 240_000 };

/** How high up the slope a climber is, in metres. */
async function height(page: Page, climber: string): Promise<number> {
  return (await seen(page, climber))?.y ?? Number.NaN;
}

/** The wait for a press to come back from the room: its step, and a frame of a browser starved of
 * them on CI, beside the other worker's (PR #158). */
const PRESSING = { intervals: [3_000], timeout: 60_000 };

/** Clips the second cowstail to the block's rope, by `clip`, pressed again while it hasn't held.
 * A press unclips a cowstail the page shows clipped, so each waits for the last to come back, and
 * none goes while the climber is off their feet. What the climber was doing says why it failed. */
async function clipToTheBlock(page: Page, climber: string, clip: () => Promise<void>) {
  await expect
    .poll(async () => {
      const seenNow = await seen(page, climber);
      if (seenNow?.second === null && !seenNow.falling) {
        await clip();
      }
      return seenNow;
    }, PRESSING)
    .toMatchObject({ second: "block" });
}

/** The PC's player: by the keys, Shift held for the faster pace the phone's full push gives, to
 * the foot of the ladder, clipped in with R, and up it on W and D. */
async function climbByKeys(pc: Page): Promise<void> {
  await pc.keyboard.down("Shift");
  await pc.keyboard.down("KeyD");
  await expect.poll(() => along(pc, "player"), CLIMBING).toBeCloseTo(LADDER_FOOT, 1);
  await pc.keyboard.up("KeyD");
  await pc.keyboard.up("Shift");
  await clipToTheBlock(pc, "player", () => pc.keyboard.press("KeyR"));
  await pc.keyboard.down("Shift");
  await pc.keyboard.down("KeyW");
  await pc.keyboard.down("KeyD");
  await expect.poll(() => height(pc, "player"), CLIMBING).toBeGreaterThanOrEqual(BLOCK_TOP);
  await pc.keyboard.up("KeyD");
  await pc.keyboard.up("KeyW");
  await pc.keyboard.up("Shift");
}

/** The phone's player: on the joystick, the left thumb's, pushed its whole reach for the faster
 * pace, to the foot of the ladder, clipped in with the cowstail's button, and up it with the
 * thumb pushed up and right. */
async function climbByTouch(phone: Page): Promise<void> {
  const slope = phone.locator("#slope");
  const thumb = { pointerId: 7, pointerType: "touch", isPrimary: true };
  const push = async (clientX: number, clientY: number) => {
    await slope.dispatchEvent("pointerdown", { ...thumb, clientX: 100, clientY: 250 });
    await slope.dispatchEvent("pointermove", { ...thumb, clientX, clientY });
    return () => slope.dispatchEvent("pointerup", { ...thumb, clientX, clientY });
  };
  const button = phone.locator('[data-control="clip-second"]');

  let letGo = await push(160, 250);
  await expect.poll(() => along(phone, "teammate"), CLIMBING).toBeCloseTo(LADDER_FOOT, 1);
  await letGo();
  await clipToTheBlock(phone, "teammate", async () => {
    const box = await button.boundingBox();
    if (box === null) {
      throw new Error("There's no cowstail button on the phone");
    }
    await phone.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  });
  letGo = await push(142, 208);
  await expect.poll(() => height(phone, "teammate"), CLIMBING).toBeGreaterThanOrEqual(BLOCK_TOP);
  await letGo();
}

/** Each climber as both browsers see them, once they're at rest: the same, to the centimetre. */
async function expectTheSameClimb(pc: Page, phone: Page): Promise<void> {
  for (const climber of ["player", "teammate"]) {
    const across = await atRest(pc, climber);
    expect(await along(phone, climber)).toBeCloseTo(across, 2);
    expect(await height(phone, climber)).toBeCloseTo(await height(pc, climber), 2);
  }
}

test.describe("on a phone's screen of 640 by 360", () => {
  test.use({ viewport: { width: 640, height: 360 } });

  test("a PC and a phone in one room climb the first ladder together, each seeing the other", async ({
    page: phone,
    browser,
    browserName,
    baseURL,
    hasTouch,
  }) => {
    test.skip(!hasTouch, "a phone's story, beside a PC");
    test.setTimeout(480_000);
    const desktop = devices[browserName === "webkit" ? "Desktop Safari" : "Desktop Chrome"];
    const context = await browser.newContext(
      baseURL === undefined ? desktop : { ...desktop, baseURL },
    );
    const pc = await context.newPage();
    const code = await openARoom(pc);

    await readTheDisclaimer(phone, pc.url());

    await expect(roomNotice(phone)).toHaveText(`You have joined room ${code}`);
    // Each browser's first frame, as e2e/room.spec.ts waits for the friend's.
    await expect(phone.locator("#slope")).toHaveAttribute("data-climber", "12.00 0.00", {
      timeout: 15_000,
    });
    await expect.poll(() => along(pc, "teammate"), WALKING).toBeCloseTo(12, 1);
    await Promise.all([climbByKeys(pc), climbByTouch(phone)]);
    // Each sees the other on top of the block, clipped to its rope.
    for (const [page, other] of [
      [pc, "teammate"],
      [phone, "player"],
    ] as const) {
      await expect.poll(() => height(page, other), CLIMBING).toBeGreaterThanOrEqual(BLOCK_TOP);
      const climber = await seen(page, other);
      expect(climber?.ladder).toBeNull();
      expect(climber?.second).toBe("block");
    }
    await expectTheSameClimb(pc, phone);
    await context.close();
  });
});
