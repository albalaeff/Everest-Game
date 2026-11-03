import { describe, expect, it } from "vitest";

import type { SlopeView } from "../input/slope-view";
import { Camera } from "./camera";
import type { Watched } from "./camera";

/** The player's climber as the physics would show them, wherever a test puts them. */
class StillClimber {
  climber: Watched = { x: 10, y: 2, first: null, second: null };

  moveTo(x: number, y: number): void {
    this.climber = { ...this.climber, x, y };
  }
}

const FRAME = 1 / 60;

describe("Camera", () => {
  it("shows 20 m of slope from the top of the screen to the bottom, on a phone as on a PC", () => {
    for (const [width, height] of [
      [640, 360],
      [1920, 1080],
      [1024, 768],
    ]) {
      const camera = new Camera(new StillClimber(), width ?? 0, height ?? 0);

      expect(camera.at(0, 0).y - camera.at(0, height ?? 0).y).toBeCloseTo(Camera.METRES_HIGH, 9);
    }
  });

  it("starts on the climber, a third from the left and below the middle", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    expect(camera.position).toEqual({ x: 10, y: 2 });
    expect(camera.anchor.x).toBeCloseTo(640 / 3, 9);
    expect(camera.anchor.y).toBe(216);
    expect(camera.toScreen({ x: 10, y: 2 })).toEqual(camera.anchor);
    expect(camera.at(640 / 3, 216)).toEqual({ x: 10, y: 2 });
  });

  it("measures the screen in metres, up and to the right, to the centimetre, and back", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    expect(camera.pixelsPerMetre).toBe(18);
    expect(camera.at(640 / 3 + 18, 216 - 36)).toEqual({ x: 11, y: 4 });
    expect(camera.at(400, 130)).toEqual({ x: 20.37, y: 6.78 });
    const point = camera.at(400, 130);
    expect(camera.toScreen(point).x).toBeCloseTo(400, 0);
    expect(camera.toScreen(point).y).toBeCloseTo(130, 0);
  });

  it("follows the climber smoothly, and settles on them", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    climber.moveTo(16, 5);

    camera.follow(FRAME);
    const afterOneFrame = camera.position;
    for (let frame = 0; frame < 180; frame += 1) {
      camera.follow(FRAME);
    }

    expect(afterOneFrame.x).toBeGreaterThan(10);
    expect(afterOneFrame.x).toBeLessThan(11);
    expect(camera.position.x).toBeCloseTo(16, 3);
    expect(camera.position.y).toBeCloseTo(5, 3);
  });

  it("lands in the same place after a second at 30 frames a second as at 60", () => {
    const climber = new StillClimber();
    const phone = new Camera(climber, 640, 360);
    const pc = new Camera(climber, 640, 360);
    climber.moveTo(30, 12);

    for (let frame = 0; frame < 30; frame += 1) {
      phone.follow(1 / 30);
    }
    for (let frame = 0; frame < 60; frame += 1) {
      pc.follow(FRAME);
    }

    expect(phone.position.x).toBeCloseTo(pc.position.x, 9);
    expect(phone.position.y).toBeCloseTo(pc.position.y, 9);
  });

  it("jumps onto the climber at once", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    climber.moveTo(100, 50);

    camera.jump();

    expect(camera.position).toEqual({ x: 100, y: 50 });
  });

  it("places a tool a metre ahead of the climber: the ice axe above, the crampons below", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    expect(camera.ahead("ice-axe")).toEqual({ x: 11, y: 3 });
    expect(camera.ahead("crampons")).toEqual({ x: 11, y: 1 });
  });

  it("is the slope view the input reads: the climber, and the ropes they're clipped to", () => {
    const climber = new StillClimber();
    climber.climber = { ...climber.climber, first: "fixed" };
    const view: SlopeView = new Camera(climber, 640, 360);

    expect(view.climber).toMatchObject({ x: 10, y: 2, first: "fixed", second: null });
  });

  it("keeps its place on the slope when the screen turns", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    camera.resize(360, 640);

    expect(camera.screen).toEqual({ width: 360, height: 640 });
    expect(camera.position).toEqual({ x: 10, y: 2 });
    expect(camera.at(0, 0).y - camera.at(0, 640).y).toBeCloseTo(Camera.METRES_HIGH, 9);
  });
});
