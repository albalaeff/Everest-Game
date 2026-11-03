import { describe, expect, it } from "vitest";

import { FrameRate } from "./frame-rate";

/** Plays `frames` frames a second for `seconds`, and says how many readings came. */
function play(rate: FrameRate, framesASecond: number, seconds: number): number {
  let readings = 0;
  for (let frame = 0; frame <= framesASecond * seconds; frame += 1) {
    if (rate.frame((frame * 1000) / framesASecond)) {
      readings += 1;
    }
  }
  return readings;
}

describe("FrameRate", () => {
  it("has no reading before a second has passed", () => {
    const rate = new FrameRate();

    for (let frame = 0; frame < 30; frame += 1) {
      expect(rate.frame(frame * 16.7)).toBe(false);
    }

    expect(rate.fps).toBeNull();
  });

  it("reads 60 on a laptop's frames, and 30 on a phone's", () => {
    const laptop = new FrameRate();
    const phone = new FrameRate();

    play(laptop, 60, 1);
    play(phone, 30, 1);

    expect(laptop.fps).toBe(60);
    expect(phone.fps).toBe(30);
  });

  it("gives a new reading each second, and says when it does", () => {
    const rate = new FrameRate();

    expect(play(rate, 60, 5)).toBe(5);
    expect(rate.fps).toBe(60);
  });

  it("reads the frames of the last second only", () => {
    const rate = new FrameRate();

    play(rate, 60, 1);
    for (let frame = 1; frame <= 30; frame += 1) {
      rate.frame(1000 + frame * (1000 / 30));
    }

    expect(rate.fps).toBe(30);
  });
});
