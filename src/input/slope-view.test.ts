import { describe, expect, it } from "vitest";

import { PlainSlopeView } from "./slope-view";

describe("PlainSlopeView", () => {
  const view = new PlainSlopeView({ innerWidth: 640, innerHeight: 360 });

  it("puts the climber in the middle of the screen", () => {
    expect(view.at(320, 180)).toEqual(view.climber);
  });

  it("measures the screen in metres, up and to the right from the climber", () => {
    expect(view.at(400, 130)).toEqual({ x: 0.8, y: 0.5 });
    expect(view.at(200, 230)).toEqual({ x: -1.2, y: -0.5 });
  });

  it("places a tool just ahead of the climber: the ice axe above, the crampons below", () => {
    expect(view.ahead("ice-axe")).toEqual({ x: 1, y: 1 });
    expect(view.ahead("crampons")).toEqual({ x: 1, y: -1 });
  });
});
