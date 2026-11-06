import { describe, expect, it } from "vitest";

import type { SlopeView } from "../input/slope-view";
import { Camera } from "./camera";
import type { Watched } from "./camera";
import { Zoom } from "./zoom";

/** The player's climber as the physics would show them, wherever a test puts them. */
class StillClimber {
  climber: Watched = { x: 10, y: 2, first: null, second: null };

  moveTo(x: number, y: number): void {
    this.climber = { ...this.climber, x, y };
  }
}

const FRAME = 1 / 60;

/** The slope from the top of the screen to the bottom, in metres. */
function metresHigh(camera: Camera): number {
  return camera.at(0, 0).y - camera.at(0, camera.screen.height).y;
}

describe("Camera", () => {
  it("shows 20 m of slope from the top of the screen to the bottom, on a phone as on a PC", () => {
    for (const [width, height] of [
      [640, 360],
      [1920, 1080],
      [1024, 768],
    ]) {
      const camera = new Camera(new StillClimber(), width ?? 0, height ?? 0);

      expect(camera.zoom).toBe(Zoom.STANDARD);
      expect(metresHigh(camera)).toBeCloseTo(20, 9);
    }
  });

  it("starts on the level it's given: 10, 20, 50 or 100 m from the top to the bottom", () => {
    for (const zoom of Zoom.LEVELS) {
      const camera = new Camera(new StillClimber(), 1000, 500, zoom);

      expect(camera.metresHigh).toBe(zoom.metresHigh);
      expect(metresHigh(camera)).toBeCloseTo(zoom.metresHigh, 9);
      expect(camera.pixelsPerMetre).toBe(500 / zoom.metresHigh);
    }
  });

  it("glides to another level in a quarter of a second, and stays there", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    camera.zoomTo(Zoom.FARTHEST);
    expect(camera.zoom).toBe(Zoom.FARTHEST);
    expect(camera.metresHigh).toBe(20);
    const seen: number[] = [];
    for (let frame = 0; frame < 14; frame += 1) {
      camera.follow(FRAME);
      seen.push(camera.metresHigh);
    }
    camera.follow(FRAME);
    camera.follow(FRAME);

    expect(seen.every((metres) => metres > 20 && metres < 100)).toBe(true);
    expect(seen.every((metres, frame) => frame === 0 || metres > (seen[frame - 1] ?? 0))).toBe(
      true,
    );
    expect(camera.metresHigh).toBe(100);
    expect(metresHigh(camera)).toBeCloseTo(100, 9);
  });

  it("glides the same at 30 frames a second as at 60", () => {
    const climber = new StillClimber();
    const phone = new Camera(climber, 640, 360);
    const pc = new Camera(climber, 640, 360);
    phone.zoomTo(Zoom.FAR);
    pc.zoomTo(Zoom.FAR);

    phone.follow(1 / 30);
    phone.follow(1 / 30);
    for (let frame = 0; frame < 4; frame += 1) {
      pc.follow(FRAME);
    }

    expect(phone.metresHigh).toBeCloseTo(pc.metresHigh, 9);
  });

  it("keeps the climber where they were on the screen as it glides", () => {
    const camera = new Camera(new StillClimber(), 640, 360);
    const before = camera.toScreen({ x: 10, y: 2 });

    camera.zoomTo(Zoom.CLOSE);
    camera.follow(0.1);

    expect(camera.toScreen({ x: 10, y: 2 })).toEqual(before);
  });

  it("lands a point of the screen where it's drawn this frame, during the glide too", () => {
    const camera = new Camera(new StillClimber(), 640, 360);
    camera.zoomTo(Zoom.FAR);

    camera.follow(0.1);
    const point = camera.at(400, 130);

    expect(camera.metresHigh).toBeGreaterThan(20);
    expect(camera.metresHigh).toBeLessThan(50);
    expect(point.x).toBeCloseTo(10 + (400 - 640 / 3) / camera.pixelsPerMetre, 2);
    expect(point.y).toBeCloseTo(2 + (216 - 130) / camera.pixelsPerMetre, 2);
  });

  it("turns back from halfway, from where the glide had got to", () => {
    const camera = new Camera(new StillClimber(), 640, 360);
    camera.zoomTo(Zoom.FARTHEST);
    camera.follow(0.1);
    const halfway = camera.metresHigh;

    camera.zoomTo(Zoom.STANDARD);
    expect(camera.metresHigh).toBe(halfway);
    camera.follow(0.05);
    expect(camera.metresHigh).toBeLessThan(halfway);
    camera.follow(0.25);

    expect(camera.metresHigh).toBe(20);
  });

  it("stays put when asked for the level it's at", () => {
    const camera = new Camera(new StillClimber(), 640, 360, Zoom.FARTHEST);
    camera.zoomTo(Zoom.FARTHEST.towards("farther"));

    camera.follow(FRAME);

    expect(camera.metresHigh).toBe(100);
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

  it("follows the climber as the picture draws them, between the steps, when it's told where", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    climber.moveTo(16, 5);

    for (let frame = 0; frame < 180; frame += 1) {
      camera.follow(FRAME, { x: 12, y: 3 });
    }

    expect(camera.position.x).toBeCloseTo(12, 3);
    expect(camera.position.y).toBeCloseTo(3, 3);
    expect(camera.climber).toMatchObject({ x: 16, y: 5 });
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

  it("looks ahead the way the climber goes: walking left, they slide over to two thirds across", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    const across = (): number => camera.toScreen(climber.climber).x / 640;

    // Down the slope at a slow walk, 1 m a second, for six seconds.
    const seen: number[] = [];
    for (let frame = 1; frame <= 360; frame += 1) {
      climber.moveTo(10 - frame / 60, 2);
      camera.follow(FRAME);
      seen.push(across());
    }

    expect(seen[30]).toBeLessThan(0.45);
    expect(seen.every((share, frame) => frame < 30 || share >= (seen[frame - 30] ?? 0))).toBe(true);
    expect(across()).toBeGreaterThan(0.64);
    expect(across()).toBeLessThan(2 / 3 + 0.01);
  });

  it("keeps looking the way the climber went when they stop or take a step back", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);

    climber.moveTo(9.8, 2);
    for (let frame = 0; frame < 300; frame += 1) {
      camera.follow(FRAME);
    }

    expect(camera.toScreen(climber.climber).x).toBeCloseTo(640 / 3, 1);
  });

  it("turns back to look up the slope when the climber walks up again", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    climber.moveTo(4, 2);
    for (let frame = 0; frame < 600; frame += 1) {
      camera.follow(FRAME);
    }

    climber.moveTo(8, 2);
    for (let frame = 0; frame < 600; frame += 1) {
      camera.follow(FRAME);
    }

    expect(camera.toScreen(climber.climber).x).toBeCloseTo(640 / 3, 0);
  });

  it("lands a click where it's drawn while the view slides", () => {
    const climber = new StillClimber();
    const camera = new Camera(climber, 640, 360);
    climber.moveTo(6, 2);

    camera.follow(0.5);
    const point = camera.at(400, 130);

    expect(camera.toScreen(climber.climber).x).toBeGreaterThan(640 / 3);
    expect(camera.toScreen(point).x).toBeCloseTo(400, 0);
    expect(camera.toScreen(point).y).toBeCloseTo(130, 0);
  });

  it("slides the same at 30 frames a second as at 60", () => {
    const climber = new StillClimber();
    const phone = new Camera(climber, 640, 360);
    const pc = new Camera(climber, 640, 360);
    climber.moveTo(5, 2);

    for (let frame = 0; frame < 30; frame += 1) {
      phone.follow(1 / 30);
    }
    for (let frame = 0; frame < 60; frame += 1) {
      pc.follow(FRAME);
    }

    expect(phone.position.x).toBeCloseTo(pc.position.x, 9);
  });

  it("keeps its place on the slope when the screen turns", () => {
    const camera = new Camera(new StillClimber(), 640, 360);

    camera.resize(360, 640);

    expect(camera.screen).toEqual({ width: 360, height: 640 });
    expect(camera.position).toEqual({ x: 10, y: 2 });
    expect(metresHigh(camera)).toBeCloseTo(20, 9);
  });
});
