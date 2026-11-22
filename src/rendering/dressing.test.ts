import { describe, expect, it } from "vitest";

import type { Injury } from "../physics";
import { ClimberPose } from "./climber-pose";
import type { PoseState } from "./climber-pose";
import { Dressing } from "./dressing";

const injury = (over: Partial<Injury> = {}): Injury => ({
  part: "leg",
  kind: "fracture",
  step: 0,
  tourniquet: false,
  splinted: false,
  aid: 0,
  ...over,
});

const STANDING: PoseState = {
  travelled: 0,
  moving: false,
  falling: false,
  dead: false,
  tiredness: "fresh",
  pace: "steady",
  ground: () => 0,
  terrain: () => 0,
  jumar: null,
  carabiner: null,
  sliding: false,
  ladder: null,
  footing: 1,
  hauling: false,
};
const pose = new ClimberPose().advance(5, STANDING);

describe("Dressing", () => {
  it("shows nothing on a limb broken under the skin until first aid is on it, and the blood on one broken through it", () => {
    expect(Dressing.of([])).toEqual([]);
    expect(Dressing.of([injury()])).toEqual([]);
    expect(Dressing.of([injury({ kind: "open-fracture" })])).toEqual([
      { part: "leg", bleeding: true, tourniquet: false, splint: false, wrap: false },
    ]);
  });

  it("shows the tourniquet once it's on, the blood stopped, then the splint over it", () => {
    const stopped = injury({ kind: "open-fracture", tourniquet: true });

    expect(Dressing.of([stopped])).toEqual([
      { part: "leg", bleeding: false, tourniquet: true, splint: false, wrap: false },
    ]);
    expect(Dressing.of([{ ...stopped, splinted: true }])).toEqual([
      { part: "leg", bleeding: false, tourniquet: true, splint: true, wrap: false },
    ]);
  });

  it("shows a sprain's wrap, not a splint, and nothing before it's wrapped: a limb at a time", () => {
    const sprain = injury({ part: "arm", kind: "sprain" });

    expect(Dressing.of([sprain])).toEqual([]);
    expect(Dressing.of([{ ...sprain, splinted: true }, injury({ splinted: true })])).toEqual([
      { part: "arm", bleeding: false, tourniquet: false, splint: false, wrap: true },
      { part: "leg", bleeding: false, tourniquet: false, splint: true, wrap: false },
    ]);
  });

  it("has first aid go on the middle of the broken shin or forearm, or the sprained joint, the leg's first", () => {
    const [leg] = pose.legs;
    const [arm] = pose.arms;
    const middle = (from: { x: number; y: number }, to: { x: number; y: number }) => ({
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    });

    expect(Dressing.wound(pose, [])).toBeNull();
    expect(Dressing.wound(pose, [injury()])).toEqual(middle(leg.middle, leg.end));
    expect(Dressing.wound(pose, [injury({ part: "arm" })])).toEqual(middle(arm.middle, arm.end));
    expect(Dressing.wound(pose, [injury({ kind: "sprain" })])).toEqual(leg.end);
    expect(Dressing.wound(pose, [injury({ part: "arm" }), injury()])).toEqual(
      middle(leg.middle, leg.end),
    );
  });
});
