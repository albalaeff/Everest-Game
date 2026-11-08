import { describe, expect, it } from "vitest";

import { ActionLog, Expedition, HeadlessRunner, StepPacer } from "../simulation";
import type { ClimberId, GameAction } from "../simulation";
import type { ClimberView } from "./climber";
import { SlopePhysics } from "./slope-physics";
import type { RopeLayout, SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, unclip, jumar, distance } = Climb;
const FRAME_SECONDS = 1 / 60;

/** A player at the keys: after each frame that took a step, they look at their climber and
 * press what they'd press. They let go of the walking key when their climber slips, and press it
 * again once they're on their feet, unless the fall has shaken them. */
abstract class Player {
  private walking = false;
  private shaken = false;

  constructor(readonly id: ClimberId) {}

  look(climber: ClimberView): GameAction[] {
    const pressed = this.choose(climber);
    this.shaken ||= climber.falls.some((fall) => fall.drop > 5);
    const walking = !climber.falling && !this.shaken;
    if (walking !== this.walking) {
      this.walking = walking;
      pressed.push(walk(this.id, walking ? "right" : "stop"));
    }
    return pressed;
  }

  protected abstract choose(climber: ClimberView): GameAction[];
}

/** The page's loop: each frame turns real time into steps, and sends what the players pressed. */
class Page {
  readonly physics: SlopePhysics;
  readonly expedition: Expedition;
  private readonly pacer = new StepPacer(100);

  constructor(
    private readonly settings: SlopeSettings,
    layout: SlopeLayout,
    seed: number,
    /** How sure-footed each climber is, where it isn't 1: a care no action sets here, with no
     * body to set it. */
    private readonly sureness: Readonly<Record<ClimberId, number>> = {},
  ) {
    this.physics = new SlopePhysics(settings);
    this.expedition = Expedition.start(TestMountain.scenario(seed, layout), [this.physics]);
    Page.sure(this.physics, sureness);
  }

  private static sure(physics: SlopePhysics, sureness: Readonly<Record<ClimberId, number>>): void {
    for (const [id, share] of Object.entries(sureness)) {
      physics.sureness(id, share);
    }
  }

  /** Plays until `over` says so, or ten minutes, with `watch` looking on after every step. */
  play(players: readonly Player[], over: () => boolean, watch: () => void = () => undefined): void {
    let pressed: GameAction[] = [];
    while (!over() && this.expedition.seconds < 600) {
      const due = this.pacer.due(FRAME_SECONDS);
      for (let done = 0; done < due; done += 1) {
        this.expedition.advance(pressed);
        pressed = [];
        watch();
      }
      if (due > 0) {
        pressed = players.flatMap((player) => player.look(this.physics.climber(player.id)));
      }
    }
  }

  /** The debrief: the same climb played again from the save, with no screen. */
  debrief(): { readonly physics: SlopePhysics; readonly expedition: Expedition } {
    const save = this.expedition.save();
    const physics = new SlopePhysics(this.settings);
    const expedition = Expedition.start(save.scenario, [physics]);
    Page.sure(physics, this.sureness);
    new HeadlessRunner(expedition, new ActionLog(save.actions)).play(save.step);
    return { physics, expedition };
  }
}

describe("Two Sherpas cross a ladder over a crevasse, one of them unclipped, as in 2012", () => {
  /** Clipped to the rope beside the ladder before stepping onto it, or not. */
  class Crossing extends Player {
    private ready = false;

    constructor(
      id: ClimberId,
      private readonly clipsIn: boolean,
    ) {
      super(id);
    }

    protected choose(): GameAction[] {
      const pressed = this.clipsIn && !this.ready ? [clip(this.id, "second")] : [];
      this.ready = true;
      return pressed;
    }
  }

  it("holds the one clipped in over the crevasse, and the other falls to its bottom", () => {
    // The crevasse is 3 m wide and 30 m deep, with a ladder across and a rope beside it, and
    // the ice of the ladder's rungs is bad: a slip about once a second on it.
    const handline: RopeLayout = { id: "handline", from: 19, to: 84, length: 5.2 };
    const layout = TestMountain.CREVASSE.layout(
      [
        { id: "lhakpa", along: 19.5 },
        { id: "dorje", along: 19.5 },
      ],
      [handline],
      [{ id: "bridge", from: 20, to: 83 }],
    );
    const page = new Page(TestMountain.ICY_LADDERS, layout, 2012);
    const players = [new Crossing("lhakpa", true), new Crossing("dorje", false)];
    const slipped = new Set<ClimberId>();

    page.play(
      players,
      () => slipped.size === players.length && page.expedition.seconds > 30,
      () => {
        for (const { id } of players) {
          if (page.physics.climber(id).falling) {
            slipped.add(id);
          }
        }
      },
    );
    const lhakpa = page.physics.climber("lhakpa");
    const dorje = page.physics.climber("dorje");

    // Both slipped on the ladder. Dorje went to the bottom, 30 m down.
    expect(dorje).toMatchObject({ y: -30, falling: false, second: null });
    expect(dorje.falls).toHaveLength(1);
    expect(dorje.falls[0]?.drop).toBeCloseTo(30, 6);

    // Lhakpa hangs on the rope, a couple of metres into the crevasse.
    expect(lhakpa).toMatchObject({ falling: true, second: "handline" });
    expect(lhakpa.y).toBeLessThan(-1);
    expect(lhakpa.y).toBeGreaterThan(-2.4);

    // The debrief sees the same.
    const debrief = page.debrief();
    expect(debrief.physics.climber("lhakpa")).toEqual(lhakpa);
    expect(debrief.physics.climber("dorje")).toEqual(dorje);
    expect(debrief.expedition.save()).toEqual(page.expedition.save());
  });
});

describe("Two clients go up a line of fixed ropes on the jumar, one careless at the anchor", () => {
  const up = (metres: number): number => TestMountain.upTheSlope(metres);
  const lower: RopeLayout = { id: "lower", from: up(10), to: up(30), length: 21 };
  const upper: RopeLayout = { id: "upper", from: up(30), to: up(50), length: 21 };
  const anchor = TestMountain.SLOPE.terrain.point(lower.to);

  /** On the jumar from the start, held, and up to the anchor; there, each their own way. */
  abstract class Jumaring extends Player {
    private started = false;

    protected choose(climber: ClimberView): GameAction[] {
      if (!this.started) {
        this.started = true;
        return [clip(this.id, "first"), jumar(this.id, true)];
      }
      return climber.falling ? [] : this.past(climber);
    }

    /** What they press once they're on their feet, and maybe past the anchor. */
    protected abstract past(climber: ClimberView): GameAction[];
  }

  /** The second onto the next rope before the first comes off the old one. */
  class Careful extends Jumaring {
    protected past(climber: ClimberView): GameAction[] {
      const atTheAnchor = climber.first === lower.id && climber.x > anchor.x;
      return atTheAnchor
        ? [clip(this.id, "second"), unclip(this.id, "first"), clip(this.id, "first")]
        : [];
    }
  }

  /** The first off the old rope at the anchor, meaning to clip the next five metres on. */
  class Careless extends Jumaring {
    protected past(climber: ClimberView): GameAction[] {
      if (climber.first === lower.id && climber.x > anchor.x) {
        return [unclip(this.id, "first")];
      }
      const onTheNext = climber.first === null && climber.y > anchor.y;
      return onTheNext && distance(climber, anchor) > 5 ? [clip(this.id, "first")] : [];
    }
  }

  it("holds the careful one's every slip at the jumar, and the careless one slides off", () => {
    const layout = TestMountain.SLOPE.layout(
      [
        { id: "pasang", along: up(12) },
        { id: "boris", along: up(12) },
      ],
      [lower, upper],
    );
    // The slope slips 0.15 a metre at a steady pace: Boris hurries, four times as likely to slip,
    // and Pasang takes care, half as likely (#208).
    const slope: SlopeSettings = {
      ...TestMountain.CALM,
      slipChance: [
        [-45, 0.2],
        [-25, 0],
        [25, 0],
        [45, 0.2],
      ],
    };
    const page = new Page(slope, layout, 2026, { boris: 0.25, pasang: 2 });
    const players = [new Careful("pasang"), new Careless("boris")];
    const high = TestMountain.SLOPE.terrain.point(up(45));
    let pasangUnclipped = false;
    let pasangClipped = false;

    page.play(
      players,
      () => {
        const [pasang, boris] = [page.physics.climber("pasang"), page.physics.climber("boris")];
        return pasang.y > high.y && boris.falls.some((fall) => fall.drop > 5) && !boris.falling;
      },
      () => {
        const pasang = page.physics.climber("pasang");
        const clipped = pasang.first !== null || pasang.second !== null;
        pasangUnclipped ||= pasangClipped && !clipped;
        pasangClipped ||= clipped;
      },
    );
    const pasang = page.physics.climber("pasang");
    const boris = page.physics.climber("boris");

    // Pasang went past the anchor to the upper rope, never off the ropes, and each slip of
    // hers stopped at her jumar, a short way down.
    expect(pasang).toMatchObject({ first: upper.id, second: upper.id });
    expect(pasang.y).toBeGreaterThan(high.y);
    expect(pasangUnclipped).toBe(false);
    expect(pasang.falls.length).toBeGreaterThan(0);
    expect(pasang.falls.every((fall) => fall.drop < 2)).toBe(true);

    // Boris slipped while he was off the ropes, and slid all the way to the run-out.
    expect(boris).toMatchObject({ first: null, second: null, falling: false });
    expect(boris.y).toBeCloseTo(0, 6);
    expect(boris.falls.at(-1)?.drop).toBeGreaterThan(anchor.y - 1);

    // The debrief sees the same.
    const debrief = page.debrief();
    expect(debrief.physics.climber("pasang")).toEqual(pasang);
    expect(debrief.physics.climber("boris")).toEqual(boris);
    expect(debrief.expedition.save()).toEqual(page.expedition.save());
  });
});
