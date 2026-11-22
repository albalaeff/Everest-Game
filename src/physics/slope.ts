import { SimulationClock } from "../simulation";
import type { ClimberId, Moment, Walk } from "../simulation";
import type { Climber, Hauls } from "./climber";
import { Faces } from "./faces";
import type { Face } from "./faces";
import type { InjurySettings } from "./injuries";
import type { Ladder } from "./ladder";
import { LadderClimbing } from "./ladder-climbing";
import { RescueLine } from "./rescue-line";
import { RescueWork } from "./rescue-work";
import type { RescueSettings } from "./rescue-work";
import type { Rope, Slide } from "./rope";
import { SectionScale } from "./section-scale";
import type { SectionAltitude } from "./section-scale";
import { SteepnessCurve } from "./steepness";
import type { GradientPoint, SteepnessPoint } from "./steepness";
import type { Point, Terrain, Way } from "./terrain";
import { Walking } from "./walking";

/** A stretch of the ground, by how far along it its ends are: plain data, as saves keep it. */
export type AlongStretch = {
  readonly from: number;
  readonly to: number;
};

/**
 * How a climber keeps their feet (#208): each metre they walk on blue ice, a ladder or steep snow
 * has a chance of slipping, by what's under them, divided by how sure-footed they are: a careful
 * pace's more, a hurried or tired one's less (`Legs.sureness`). Standing still never slips but
 * where a stance is hard (#197): on the front points, on a ladder bouncing hard, on ice steeper
 * than a flat foot holds on. And a jolt they can't prevent, a gust, a ladder twisting, a climber
 * passing them on their rope, slips them at its chance where a slip can happen. The chances are a
 * metre's at a sure-footedness of 1, and standing's a second's.
 */
export interface FootingSettings {
  /** The chance a metre of blue ice on the level slips, and how much more it is for each unit of
   * the sine of its slope, up or down. */
  readonly ice: number;
  readonly iceSteep: number;
  /** How hard blue ice holds what slides on it: snow's `friction` for ice. */
  readonly iceFriction: number;
  /** A ladder across a crevasse bounces under the steps on it: how much each metre walked on it
   * sets it going for each metre of its length, how much of it dies away a second, how much each
   * unit of it adds to the chance a metre on it slips, and the share of it the steps set going
   * while someone holds its rope taut from one of its ends (#212). */
  readonly bounce: {
    readonly excite: number;
    readonly damp: number;
    readonly slip: number;
    readonly held: number;
  };
  /** A crampon not checked before setting off (#196): the seconds on the move after which it comes
   * loose, on the next ladder; how sure-footed a loose one leaves its climber, a share; and the
   * seconds a refit takes, standing. */
  readonly crampon: { readonly looseAfter: number; readonly loose: number; readonly refit: number };
  /** Standing still where a stance is hard (#197), each a chance a second at a sure-footedness of
   * 1: on the front points, on a face of ice or on blue ice steeper than `steepness`, in degrees,
   * where a crampon's flat foot no longer holds; and for each unit of a ladder's bounce past
   * `bounceFrom`, the sway a crossing sets going on its own. */
  readonly still: {
    readonly steepness: number;
    readonly frontPoints: number;
    readonly bounce: number;
    readonly bounceFrom: number;
  };
  /** The share of a jolt's chance, a gust, a ladder twisting, a climber passing (#197), that slips
   * a climber standing still, braced for it, against one on the move. */
  readonly braced: number;
  /** One climber passing another on a rope they share (#197): how near along the ground, in
   * metres, and the chance it slips the one passed where a slip can happen, as a jolt does. */
  readonly passing: { readonly near: number; readonly slip: number };
}

/**
 * How a climber goes up and down ice too steep to walk, on their ice tools and the front points
 * of their crampons (`OnIce`): a pick swung in above them, the feet walked up under it, the next
 * pick swung in higher. The ice axe alone climbs it, slower and less surely; a second tool makes
 * it a climb of two picks, one always in the ice.
 */
export interface IceClimbSettings {
  /** How fast a whole stride climbs on two tools, in m/s, and the share of it on the axe alone. */
  readonly speed: number;
  readonly oneTool: number;
  /** How high above their feet a pick goes in at full stretch, and how far below a pick their
   * feet stop, locked off with the pick at their shoulder: in metres up. Between the two, a
   * climber moves; past either, they swing the next pick in first. */
  readonly reach: number;
  readonly lockOff: number;
  /** Above this height over their feet a pick is swung at full stretch, and bites poorly. */
  readonly stretch: number;
  /** How near the ice the player has to point for a pick to go in, and how far past a face's lip
   * a pick is planted to top out over it, in metres. */
  readonly snap: number;
  readonly overLip: number;
  /** The chance a metre climbed slips on two sound picks; how many times likelier it is on the
   * axe alone, and on a pick that bites poorly: over-reached, or in brittle ice. */
  readonly slip: number;
  readonly oneToolSlip: number;
  readonly poor: number;
  /** The chance a swing comes off for a climber on the axe alone, who hangs on their front
   * points while it's out of the ice. */
  readonly swingSlip: number;
  /** The share of a stride's power that hanging still on the tools takes. */
  readonly hang: number;
}

/**
 * The numbers the slope physics runs on, handed to it (docs/conventions.md → Data, not
 * literals): the page and the room server take them from the knowledge base, and the tests have
 * test numbers of their own.
 */
export interface SlopeSettings {
  /** Gravity's pull, in m/s². */
  readonly gravity: number;
  /** How hard snow and ice hold what slides on them, a climber or a rope: the push into the
   * ground times this is how much friction takes from a slide, and its arctangent is the
   * steepest ground that stops one. */
  readonly friction: number;
  /** How far a cowstail reaches from a climber to their rope, in metres. */
  readonly cowstail: number;
  /** How long the typical client's hands take to clip a cowstail's carabiner onto a rope, in
   * seconds, standing (#197): a climber's technique shares it as it shares their speed; nought
   * clips at once. */
  readonly clip: number;
  /** The energy a metre of walking takes of each kilogram moved, in J/kg/m, by the gradient
   * ahead: from the steepest measured down to the steepest measured up. */
  readonly walkingCost: readonly GradientPoint[];
  /** The steepest ground a climber walks, up or down, in degrees: steeper up stops them, and
   * steeper down is a fall. */
  readonly steepest: number;
  /** The power a whole stride walks on, in W for each kilogram moved. */
  readonly walkingPower: number;
  /** The fastest a climber walks, in m/s, whatever power they have to spare. */
  readonly fastestWalk: number;
  /** How many times faster than in life a climber goes over the drawn ground, the speeds above
   * with it: the mountain's clock over the drawing's scale (#167). A slip, or a step off an edge,
   * launches them at the speed they walk at in life, as the falls are life's (#278). */
  readonly pace: number;
  /** The share of the climb's extra cost, a metre up a slope over a metre on the level, that a
   * stride pays: 1 as measured, less where the game eases the climb. */
  readonly uphillCostShare: number;
  /** The chance a metre walked slips, by the steepness ahead (#208): on snow, before what ice
   * and their care do to it. */
  readonly slipChance: readonly SteepnessPoint[];
  /** A climber's speed along a ladder by its steepness the way they go, in m/s, at a whole
   * stride: across a crevasse at 0°, up a wall at 90°, and down it at −90°, where it's their
   * footing's (#256). */
  readonly ladderSpeed: readonly SteepnessPoint[];
  /** What a metre down a wall's ladder costs, as a share of what a metre up it does (#256): the
   * stride's power buys the speed up over it, and the footing's speed down holds them to it. */
  readonly ladderDownCost: number;
  /** The chance a metre climbed on a ladder slips, by its steepness the way they go: the
   * rungs' own, before a crossing's bounce. */
  readonly ladderSlipChance: readonly SteepnessPoint[];
  /** How a climber keeps their feet, and loses them. */
  readonly footing: FootingSettings;
  /** The speed a falling body hits the ground at, in m/s, past which the fall kills: life size,
   * as the falls are. */
  readonly lethalLanding: number;
  /** How fast a climber hanging on their rope climbs back up it to where they slipped, at a whole
   * stride, in m/s. */
  readonly climbBack: number;
  /** How fast a climber lowers themselves down a face of ice on the fixed rope that runs down it,
   * at a whole stride, in m/s: the rope through their descender, their front points on the ice. */
  readonly rappel: number;
  /** A ladder staged to break (#209), or sliding off its lip under two (#256): the seconds it
   * creaks before it breaks, and the seconds two climbers at whole strides take to haul it back up
   * and lash it across once it has (#228); and the chance that one across a crevasse slides off
   * its lip as a climber steps onto it with someone already on it. */
  readonly ladderBreak: {
    readonly creak: number;
    readonly reset: number;
    readonly overload: number;
  };
  /** Hauling a partner who hangs on the rope (#209): how fast a whole stride hauls them up it, in
   * m/s, and how near the point they're hauled to the hauler has to stand, in metres. */
  readonly haul: { readonly speed: number; readonly reach: number };
  /** How fast a hazard that goes throws a climber down the slope, in m/s. */
  readonly knock: number;
  /** The fastest slide a climber can stop with the ice axe driven into the slope, in m/s:
   * self-arrest works in a slide's first moments, or not at all. */
  readonly arrestSpeed: number;
  /** How far from their body a sliding climber can drive the ice axe in, in metres. */
  readonly axeReach: number;
  /** Climbing ice too steep to walk, on the tools. */
  readonly iceClimb: IceClimbSettings;
  /** How a hard landing injures, and how a casualty is rescued (#241). */
  readonly injury: InjurySettings;
  readonly rescue: RescueSettings;
}

/**
 * The ground with its ropes and ladders, and how everything on them moves in a step: the climbers
 * walk, the falling bodies move in sub-steps of Verlet integration, held by their ropes and the
 * ground, then the ropes move in one, pulled after their climbers.
 */
export class Slope {
  /** Sub-steps of a step for a falling body, and the constraints' rounds in each: the engine's
   * numbers, not the mountain's. Short sub-steps keep a fast body from passing through a wall.
   * A rope holds its climber by its length alone (`Rope`), so it can move in whole steps. */
  static readonly SUBSTEPS = 10;
  static readonly ITERATIONS = 4;
  /** Slower than this, in metres a second, a body on the ground lies still, and so does a rope
   * nobody is clipped to, which then waits for someone to move it: the engine's number too. */
  static readonly REST_SPEED = 0.01;
  /** How near a face of ice's foot or lip a ladder's end stands, along the ground, to be the way
   * up or down it there, in metres: the engine's number too. */
  static readonly BY_A_LADDER = 1.5;
  /** How many climbers it takes to haul a fallen ladder back up by its ropes, and the most whose
   * strides count (#228): a ladder's weight, two pairs of hands. */
  static readonly HANDS = 2;
  /** How near each other two ropes' distances from a climber are for the ropes to be as near, in
   * metres: at an anchor they share, where both are at the climber's feet. The engine's number. */
  private static readonly AS_NEAR = 1e-9;

  readonly walking: Walking;
  readonly slipChance: SteepnessCurve;
  readonly ladderClimbing: LadderClimbing;
  readonly ladderSlipChance: SteepnessCurve;
  readonly substepSeconds = SimulationClock.STEP_SECONDS / Slope.SUBSTEPS;
  /** The section's scale, which reads the altimeter. */
  readonly scale: SectionScale;
  /** The ground's faces, too steep to walk, and its dead ends. */
  readonly faces: Faces;
  /** The rescue lines thrown on it, built or half built, in the order they were begun (#241). */
  readonly lines = new Map<string, RescueLine>();
  /** Whether each rope's first anchor is the one further back along the ground, once asked: the
   * anchors stay where they're laid. */
  private readonly upTheRoute = new Map<Rope, boolean>();

  constructor(
    readonly settings: SlopeSettings,
    readonly terrain: Terrain,
    altitude: SectionAltitude,
    readonly ropes: ReadonlyMap<string, Rope>,
    readonly ladders: ReadonlyMap<string, Ladder>,
    /** The stretches of the ground that are bare blue ice, not snow. */
    private readonly ice: readonly AlongStretch[] = [],
    /** The stretches of its faces whose ice is brittle: a pick swung into it bites poorly. */
    private readonly brittle: readonly AlongStretch[] = [],
  ) {
    this.scale = new SectionScale(terrain, altitude);
    const { walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare } = settings;
    this.walking = new Walking(walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare);
    this.slipChance = new SteepnessCurve(settings.slipChance);
    this.ladderClimbing = new LadderClimbing(settings.ladderSpeed, settings.ladderDownCost);
    this.ladderSlipChance = new SteepnessCurve(settings.ladderSlipChance);
    const anchors = [...ropes.values()].flatMap((rope) => {
      const { shape } = rope;
      const [first, last] = [shape[0], shape.at(-1)];
      return [first, last].flatMap((anchor) =>
        anchor === undefined ? [] : [terrain.nearest(anchor).along],
      );
    });
    const ends = [...ladders.values()].flatMap((ladder) => ladder.ends);
    this.faces = new Faces(terrain, this.walking, [...anchors, ...ends]);
  }

  /** The face a pick swung at `along` the ground bites, and whether it's planted over the face's
   * lip, on the ground at its top: none where the ground there is no face's. */
  faceFor(along: number): { readonly face: Face; readonly over: boolean } | null {
    const on = this.faces.at(along);
    if (on !== null) {
      return { face: on, over: false };
    }
    const under = this.faces.below(along, this.settings.iceClimb.overLip);
    return under === null ? null : { face: under, over: true };
  }

  /** Whether the ice at `along` is brittle. */
  onBrittle(along: number): boolean {
    return this.brittle.some(({ from, to }) => along >= from && along <= to);
  }

  rope(id: string): Rope {
    const rope = this.ropes.get(id);
    if (rope === undefined) {
      throw new RangeError(`There's no rope ${id} on the slope`);
    }
    return rope;
  }

  ladder(id: string): Ladder {
    const ladder = this.ladders.get(id);
    if (ladder === undefined) {
      throw new RangeError(`There's no ladder ${id} on the slope`);
    }
    return ladder;
  }

  /** The ladder a climber standing at `along` steps onto, walking `direction`: one with an end
   * there that the direction goes along it from. */
  ladderFrom(along: number, direction: Walk["direction"]): Ladder | null {
    for (const ladder of this.ladders.values()) {
      const way = ladder.way(direction);
      if (way !== 0 && ladder.into(along) === way) {
        // A broken one isn't there to step onto until it's lashed back (#209).
        return ladder.condition === "broken" ? null : ladder;
      }
    }
    return null;
  }

  /**
   * Where a rescuer anchors a line over a climber who lies at `along`, where the route doesn't
   * reach, `way` along the ground from them (#241): the edge of the ground the route reaches that
   * way, or the end of the ladder that crosses over it, since nobody stands under a ladder; and
   * only an edge above them, since a rope goes down to a casualty. None from ground the route
   * reaches, or where there's no such edge that way.
   */
  anchorSpot(along: number, way: Way): number | null {
    const out = this.faces.wayOut(along, way);
    if (out === null) {
      return null;
    }
    let spot = out;
    for (const ladder of this.ladders.values()) {
      const [from, to] = ladder.ends;
      if (from !== undefined && to !== undefined && spot > from && spot < to) {
        spot = way > 0 ? to : from;
      }
    }
    return this.terrain.point(spot).y > this.terrain.point(along).y ? spot : null;
  }

  /** A new rescue line from an anchor at `top` down to `foot`, `by`'s, its anchor still to
   * build. */
  throwLine(top: number, foot: number, by: ClimberId): RescueLine {
    let number = this.lines.size + 1;
    while (this.lines.has(`rescue-${number}`)) {
      number += 1;
    }
    const line = new RescueLine(`rescue-${number}`, top, foot, by);
    this.lines.set(line.id, line);
    return line;
  }

  /** The steps in `seconds` of play. */
  private static steps(seconds: number): number {
    return Math.ceil(seconds / SimulationClock.STEP_SECONDS);
  }

  /** Who hauls whom this step (#209): each climber holding the haul hauls the one hanging whom
   * they can haul from nearest, within the haul's reach of their way up or, off a ladder that
   * stands, of its end (`Climber.haulPoints`, #239); each one hauled comes up at the haul's speed
   * times each hauler's stride, at the lip their first hauler pulls them to. */
  private hauls(climbers: readonly Climber[]): Hauls {
    const { reach, speed } = this.settings.haul;
    const hauled = new Map<Climber, number>();
    const haulers = new Map<Climber, ClimberId[]>();
    const lips = new Map<Climber, number | null>();
    const hauling = new Set<Climber>();
    for (const hauler of climbers) {
      const at = hauler.hauler(this);
      if (at === null) {
        continue;
      }
      let nearest: {
        readonly climber: Climber;
        readonly away: number;
        readonly lip: number | null;
      } | null = null;
      for (const other of climbers) {
        for (const { point, lip } of other === hauler ? [] : other.haulPoints(this)) {
          const x = point.x - at.x;
          const y = point.y - at.y;
          const away = Math.sqrt(x * x + y * y);
          if (away <= reach && away < (nearest?.away ?? Infinity)) {
            nearest = { climber: other, away, lip };
          }
        }
      }
      if (nearest !== null) {
        hauling.add(hauler);
        const before = hauled.get(nearest.climber) ?? 0;
        hauled.set(nearest.climber, before + speed * hauler.haulStride);
        haulers.set(nearest.climber, [...(haulers.get(nearest.climber) ?? []), hauler.id]);
        if (!lips.has(nearest.climber)) {
          lips.set(nearest.climber, nearest.lip);
        }
      }
    }
    return {
      of: (climber) => hauled.get(climber) ?? 0,
      who: (climber) => haulers.get(climber) ?? [],
      to: (climber) => lips.get(climber) ?? null,
      by: (climber) => hauling.has(climber),
    };
  }

  /** Who sets a fallen ladder back this step (#228): two or more who can haul, holding the haul
   * within its reach of either of its ends and hauling nobody, haul it back up together, each at
   * their stride's share of two whole strides' pace; one alone can't lift it. */
  private raising(
    climbers: readonly Climber[],
    hauls: Hauls,
  ): { readonly raisers: ReadonlySet<Climber>; readonly raised: ReadonlyMap<Ladder, number> } {
    const { haul, ladderBreak } = this.settings;
    const raisers = new Set<Climber>();
    const raised = new Map<Ladder, number>();
    for (const ladder of this.ladders.values()) {
      if (ladder.condition !== "broken") {
        continue;
      }
      const at = climbers.filter((climber) => {
        const point = hauls.by(climber) ? null : climber.hauler(this);
        return (
          point !== null &&
          ladder.shape.some((end) => {
            const x = end.x - point.x;
            const y = end.y - point.y;
            return Math.sqrt(x * x + y * y) <= haul.reach;
          })
        );
      });
      if (at.length < Slope.HANDS) {
        continue;
      }
      for (const climber of at) {
        raisers.add(climber);
      }
      const strides = at.reduce((sum, climber) => sum + climber.haulStride, 0);
      const pace = Math.min(strides, Slope.HANDS) / Slope.HANDS;
      raised.set(ladder, (pace * SimulationClock.STEP_SECONDS) / ladderBreak.reset);
    }
    return { raisers, raised };
  }

  /** Each ladder held from one of its ends by a climber holding the haul with nobody to haul, at
   * its end within the haul's reach, bounces at `footing.bounce.held` of what the steps on it set
   * going this step; every other at all of it (#212): its rope held taut, the ladder sways less. */
  private steady(climbers: readonly Climber[], hauls: Hauls): void {
    const { haul, footing } = this.settings;
    const holders = climbers.flatMap((climber) => {
      const at = hauls.by(climber) ? null : climber.hauler(this);
      return at === null ? [] : [at];
    });
    for (const ladder of this.ladders.values()) {
      const held = holders.some((at) =>
        ladder.shape.some((end) => {
          const x = end.x - at.x;
          const y = end.y - at.y;
          return Math.sqrt(x * x + y * y) <= haul.reach;
        }),
      );
      ladder.steady(held ? footing.bounce.held : 1);
    }
  }

  /** Whether the ground at `along` is bare blue ice. */
  onIce(along: number): boolean {
    return this.ice.some(({ from, to }) => along >= from && along <= to);
  }

  /** How hard the ground at `point` holds what slides on it: snow's friction, or ice's. */
  frictionAt(point: Point): number {
    const { friction, footing } = this.settings;
    return this.ice.length > 0 && this.onIce(this.terrain.nearest(point).along)
      ? footing.iceFriction
      : friction;
  }

  /** Whether the ground `way` from `along` is under a ladder, which walking crosses on instead. */
  underLadder(along: number, way: Way): boolean {
    return [...this.ladders.values()].some((ladder) => ladder.into(along) === way);
  }

  /** Whether one of its fixed ropes runs down a face of ice, to lower oneself down it on. */
  ropeDown(face: Face): boolean {
    return [...this.ropes.values()].some((rope) => rope.runsDown(face, this.settings.cowstail));
  }

  /** Whether a ladder's end is within `reach` metres along the ground of `along`. */
  ladderEndBy(along: number, reach: number): boolean {
    return [...this.ladders.values()].some((ladder) =>
      ladder.ends.some((end) => Math.abs(end - along) <= reach),
    );
  }

  /** Whether the ground at `along` is under a ladder, between its ends: nobody stands there. */
  underALadder(along: number): boolean {
    return [...this.ladders.values()].some((ladder) => {
      const [from, to] = ladder.ends;
      return from !== undefined && to !== undefined && along > from && along < to;
    });
  }

  /** Where a step `way` from `along` stops: at the next corner of the ground or end of a ladder. */
  stopAhead(along: number, way: Way): number {
    let stop = this.terrain.cornerAhead(along, way);
    for (const ladder of this.ladders.values()) {
      for (const end of ladder.ends) {
        const nearer = way > 0 ? end > along && end < stop : end < along && end > stop;
        if (nearer) {
          stop = end;
        }
      }
    }
    return stop;
  }

  /** The rope nearest a climber within a cowstail's reach, if any, and where on it: what a clip
   * takes. Of ropes as near as each other, at the anchor one ends at and the next begins at, the
   * one with the most of it lying the way the climber faces, `facing` (#305): the rope that goes
   * on, whichever was laid first. */
  ropeWithin(
    climber: Point,
    facing: Way = 1,
  ): { readonly rope: Rope; readonly slide: Slide } | null {
    let found: {
      readonly rope: Rope;
      readonly slide: Slide;
      readonly distance: number;
      readonly ahead: number;
    } | null = null;
    for (const rope of this.ropes.values()) {
      const { slide, distance } = rope.nearest(climber);
      if (distance > this.settings.cowstail) {
        continue;
      }
      const ahead = this.goesOn(rope, facing) ? rope.length - slide : slide;
      const nearer = found === null || distance < found.distance - Slope.AS_NEAR;
      const further = found !== null && distance > found.distance + Slope.AS_NEAR;
      if (nearer || (!further && ahead > (found?.ahead ?? 0))) {
        found = { rope, slide, distance, ahead };
      }
    }
    return found;
  }

  /** Whether a rope runs from its first anchor to its second the way `facing` points along the
   * ground. */
  private goesOn(rope: Rope, facing: Way): boolean {
    let upTheRoute = this.upTheRoute.get(rope);
    if (upTheRoute === undefined) {
      const { shape } = rope;
      const [first, last] = [shape[0], shape.at(-1)];
      upTheRoute =
        first === undefined ||
        last === undefined ||
        this.terrain.nearest(first).along <= this.terrain.nearest(last).along;
      this.upTheRoute.set(rope, upTheRoute);
    }
    return upTheRoute === facing > 0;
  }

  /** Each climber passed on the ground this step by another on a rope they share, within the
   * passing's reach (#197): the one passed, who moved the less, keeps their feet at the passing's
   * chance of a jolt, or slips. They were where `before` says, in the climbers' order. */
  private pass(
    climbers: readonly Climber[],
    before: readonly (number | null)[],
    moment: Moment,
  ): void {
    const { near, slip } = this.settings.footing.passing;
    if (!(slip > 0)) {
      return;
    }
    const passed = new Set<Climber>();
    for (const [i, one] of climbers.entries()) {
      for (const [j, other] of climbers.entries()) {
        const [was, wasOther] = [before[i], before[j]];
        const [now, nowOther] = [one.onTheGround, other.onTheGround];
        if (j <= i || was == null || wasOther == null || now === null || nowOther === null) {
          continue;
        }
        const crossed = Math.sign(was - wasOther) * Math.sign(now - nowOther) < 0;
        const close = Math.min(Math.abs(was - wasOther), Math.abs(now - nowOther)) <= near;
        const shared = one.ropes.some((rope) => other.ropes.includes(rope));
        if (crossed && close && shared) {
          passed.add(Math.abs(now - was) < Math.abs(nowOther - wasOther) ? one : other);
        }
      }
    }
    for (const climber of passed) {
      const chance = slip * climber.unsteadiness(this);
      if (chance > 0 && moment.random.chance(Math.min(1, chance))) {
        climber.upset(this, moment.step);
      }
    }
  }

  /** Each climber who stepped onto a ladder across a crevasse this step, with someone on it
   * already, or stepping onto it with them (#256): at the overload's chance it slides off its lip,
   * the end they stepped on from; it creaks first, and falls as a staged one does. They were on
   * the ladders `before` says, in the climbers' order. Nobody stepping onto someone else's
   * ladder, nothing is drawn. */
  private overload(
    climbers: readonly Climber[],
    before: readonly (Ladder | null)[],
    moment: Moment,
  ): void {
    const { overload } = this.settings.ladderBreak;
    if (!(overload > 0)) {
      return;
    }
    for (const [index, climber] of climbers.entries()) {
      const on = climber.onRungs;
      if (on === null || before[index] === on.ladder || !on.ladder.slidable) {
        continue;
      }
      const shared = climbers.some(
        (other, at) => other !== climber && (before[at] ?? other.onRungs?.ladder) === on.ladder,
      );
      if (shared && moment.random.chance(Math.min(1, overload))) {
        on.ladder.slideOff(moment.step, on.rung <= on.ladder.length / 2 ? "start" : "finish");
      }
    }
  }

  /** One step for every climber on it, in the scenario's order. A rope that lay still and
   * nobody is clipped to waits, so the ropes of a whole section cost nothing until used. The
   * ladders' bounce dies away after the climbers' steps set it going; one that has creaked long
   * enough breaks, and its climbers fall (#209), and one broken comes back up while two haul it
   * from its lips (#228). A climber holding the haul by someone hanging hauls them up instead of
   * stepping, and so does one hauling a fallen ladder; one holding it at a ladder's end with
   * nobody to haul holds its rope taut, and steadies it (#212). */
  advance(climbers: readonly Climber[], moment: Moment): void {
    const { gravity, friction, footing, ladderBreak } = this.settings;
    const clipped = new Set(climbers.flatMap((climber) => climber.ropes));
    const ropes = [...this.ropes.values()].filter((rope) => clipped.has(rope) || !rope.resting);
    const hauling = this.hauls(climbers);
    const { raisers, raised } = this.raising(climbers, hauling);
    const hauls: Hauls = {
      ...hauling,
      by: (climber) => hauling.by(climber) || raisers.has(climber),
    };
    this.steady(climbers, hauls);
    // Whoever holds the haul by a casualty, their hands free, works for them (#241): with
    // nobody hurt, stranded or carried, there's no such work to look for.
    const rescues = climbers.some((climber) => climber.needsHelp(this))
      ? new RescueWork(this, climbers, (climber) => hauls.by(climber))
      : null;
    const before = climbers.map((climber) => climber.onTheGround);
    const onRungs = climbers.map((climber) => climber.onRungs?.ladder ?? null);
    for (const climber of climbers) {
      climber.walk(this, moment, hauls, rescues ?? undefined);
      climber.beginStep();
    }
    rescues?.carryOut();
    this.pass(climbers, before, moment);
    this.overload(climbers, onRungs, moment);
    for (const ladder of this.ladders.values()) {
      ladder.settle(SimulationClock.STEP_SECONDS, footing.bounce.damp);
      if (ladder.snap(moment.step, Slope.steps(ladderBreak.creak))) {
        for (const climber of climbers) {
          climber.offBroken(ladder, this, moment.step);
        }
      }
      ladder.raise(raised.get(ladder) ?? 0);
    }
    for (let substep = 0; substep < Slope.SUBSTEPS; substep += 1) {
      for (const climber of climbers) {
        climber.integrate(this);
      }
      for (let round = 0; round < Slope.ITERATIONS; round += 1) {
        for (const climber of climbers) {
          climber.holdOn(this);
          climber.land(this);
        }
      }
      for (const climber of climbers) {
        climber.note(this);
      }
    }
    // What the step's hardest landings did to those who fell (#241).
    for (const climber of climbers) {
      climber.judge(this, moment);
    }
    for (const rope of ropes) {
      rope.integrate(gravity, SimulationClock.STEP_SECONDS);
    }
    for (let round = 0; round < Slope.ITERATIONS; round += 1) {
      for (const climber of climbers) {
        climber.pullRopes(this);
      }
      for (const rope of ropes) {
        rope.relax();
        rope.land(this.terrain, friction);
      }
    }
    for (const rope of ropes) {
      rope.rest(Slope.REST_SPEED * SimulationClock.STEP_SECONDS);
    }
    for (const climber of climbers) {
      climber.slide(this);
      climber.settle(this);
    }
    for (const climber of climbers) {
      climber.bring(this);
    }
  }
}
