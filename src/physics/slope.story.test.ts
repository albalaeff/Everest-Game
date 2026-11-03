import { describe, expect, it } from "vitest";

import { ActionLog, Expedition, HeadlessRunner, StepPacer } from "../simulation";
import type { ClimberId, GameAction } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import { TestMountain } from "./testing/test-mountain";

const FRAME_SECONDS = 1 / 60;
const FRIENDS: readonly ClimberId[] = ["anna", "boris"];

describe("Two friends on a steep fixed rope, one of them careless", () => {
  it("holds the one clipped in, lets the other slide, and replays the same in the debrief", () => {
    // A 40° slope above a run-out, with a fixed rope from 10 m up it to 30 m up, a metre slack.
    const rope = {
      id: "fixed",
      from: TestMountain.upTheSlope(10),
      to: TestMountain.upTheSlope(30),
      length: 21,
    };
    const climbers = FRIENDS.map((id) => ({ id, along: TestMountain.upTheSlope(15) }));
    const layout = TestMountain.SLOPE.layout(climbers, [rope]);
    const physics = new SlopePhysics(TestMountain.SETTINGS);
    const expedition = Expedition.start(TestMountain.scenario(2026, layout), [physics]);
    const pacer = new StepPacer(100);
    const shaken = new Set<ClimberId>();
    let pressed: GameAction[] = [
      { kind: "clip", climber: "anna", cowstail: "second" },
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "walk", climber: "boris", direction: "right" },
    ];

    // The page's loop: each frame turns real time into steps, and sends what was pressed. A
    // player who sees their climber slip lets go of the key.
    const someoneFalling = () => FRIENDS.some((id) => physics.climber(id).falling);
    while ((shaken.size < FRIENDS.length || someoneFalling()) && expedition.seconds < 120) {
      const due = pacer.due(FRAME_SECONDS);
      for (let done = 0; done < due; done += 1) {
        expedition.advance(pressed);
        pressed = [];
      }
      for (const id of FRIENDS) {
        if (physics.climber(id).falling && !shaken.has(id)) {
          shaken.add(id);
          pressed.push({ kind: "walk", climber: id, direction: "stop" });
        }
      }
    }
    const anna = physics.climber("anna");
    const boris = physics.climber("boris");
    const lowerAnchor = TestMountain.SLOPE.terrain.point(rope.from);

    // Both slipped on the steep ice, once each.
    expect(anna.falls).toHaveLength(1);
    expect(boris.falls).toHaveLength(1);

    // Anna stayed clipped: she slid down the rope to its lower anchor, and it held her there,
    // a cowstail and half the slack below it, on her feet again.
    const fromAnchor = Math.hypot(anna.x - lowerAnchor.x, anna.y - lowerAnchor.y);
    expect(anna.second).toBe("fixed");
    expect(fromAnchor).toBeLessThanOrEqual(0.5 + TestMountain.SETTINGS.cowstail + 0.01);

    // Boris skipped the clip, and slid all the way to the run-out, fast and far.
    expect(boris.y).toBeCloseTo(0, 6);
    expect(boris.falls[0]?.drop).toBeGreaterThan(anna.falls[0]?.drop ?? 0);
    expect(boris.falls[0]?.speed).toBeGreaterThan(anna.falls[0]?.speed ?? 0);

    // The debrief plays it again from the save, with no screen, and sees the same climb.
    const save = expedition.save();
    const again = new SlopePhysics(TestMountain.SETTINGS);
    const debrief = Expedition.start(save.scenario, [again]);
    new HeadlessRunner(debrief, new ActionLog(save.actions)).play(save.step);
    expect(again.climber("anna")).toEqual(anna);
    expect(again.climber("boris")).toEqual(boris);
    expect(debrief.save()).toEqual(save);
  });
});
