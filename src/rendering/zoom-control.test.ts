import { describe, expect, it } from "vitest";

import { Camera } from "./camera";
import { Zoom, ZoomChoice } from "./zoom";
import { ZoomControl } from "./zoom-control";

const CLIMBER = { climber: { x: 10, y: 2, first: null, second: null } };

function setUp(zoom = Zoom.STANDARD) {
  const choice = new ZoomChoice(null);
  choice.choose(zoom);
  const camera = new Camera(CLIMBER, 640, 360, choice.chosen);
  const readout = { textContent: "" as string | null };
  const control = new ZoomControl(choice, camera, readout, "m");
  return { choice, camera, readout, control };
}

describe("ZoomControl", () => {
  it("shows the level it starts on", () => {
    expect(setUp().readout.textContent).toBe("20 m");
    expect(setUp(Zoom.FARTHEST).readout.textContent).toBe("100 m");
  });

  it("moves the camera, the choice and the readout a level a press", () => {
    const { choice, camera, readout, control } = setUp();

    control.step("farther");
    control.step("farther");
    control.step("closer");

    expect(choice.chosen).toBe(Zoom.FAR);
    expect(camera.zoom).toBe(Zoom.FAR);
    expect(readout.textContent).toBe("50 m");
  });

  it("stops at the end, closest or farthest", () => {
    const { camera, readout, control } = setUp(Zoom.CLOSE);

    control.step("closer");

    expect(camera.zoom).toBe(Zoom.CLOSE);
    expect(readout.textContent).toBe("10 m");
  });
});
