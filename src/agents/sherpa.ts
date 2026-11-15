import type { ClimberView, Point, SlopePhysics } from "../physics";
import type {
  ClimberId,
  GameAction,
  HazardEvent,
  HazardZone,
  Json,
  Rule,
  Warning,
} from "../simulation";
import { Footwork } from "./footwork";
import type { FootworkSave, RouteWay } from "./footwork";

/** The Sherpa's numbers (docs/conventions.md → Data, not literals): the knowledge base's
 * `technique.sherpa-*` records, and the haul's reach. */
export interface SherpaSettings {
  /** How far ahead of the first of his clients he walks, in metres: he walks on when they come
   * nearer than `near`, and waits once he's `far` ahead. */
  readonly lead: { readonly near: number; readonly far: number };
  /** How far the last of them may fall behind him before he waits, in metres. */
  readonly wait: number;
  /** How far behind one who went ahead of him he follows, in metres: closing up once they're
   * `far` ahead, standing once they're nearer than `near`. */
  readonly behind: { readonly near: number; readonly far: number };
  /** The mountain's seconds he rests with a client he went to pull off the rope. */
  readonly rest: number;
  /** The mountain's seconds a client he follows stands still before he goes past them on the
   * rope to lead again (#197). */
  readonly pass: number;
  /** How near the point a hanging climber is hauled up to he has to stand: the haul's reach. */
  readonly reach: number;
}

/** What the Sherpa is doing now, for his voice. */
export type SherpaDoing =
  /** Standing for his clients: before they set off, or for the last of them. */
  | "waiting"
  /** Walking ahead of them. */
  | "leading"
  /** Behind a client who went ahead of him. */
  | "following"
  /** Going past a client who went ahead of him and stood still, to lead again (#197). */
  | "passing"
  /** At a ladder's far end, holding its line taut for a client to cross. */
  | "holding"
  /** Going to a client who hangs on the rope, or hauling them out. */
  | "rescuing"
  /** Sitting with a client he went to pull out, on safe ground. */
  | "resting"
  /** Backing off out from under a hazard that's going. */
  | "retreating"
  /** In the camp the section ends at. */
  | "arrived";

/** The Sherpa as his voice and the picture see him. */
export interface SherpaView {
  readonly climber: ClimberId;
  readonly doing: SherpaDoing;
  /** The client he's with: the one he waits for, holds the line for, hauls or rests with; none
   * while he leads or follows. */
  readonly client: ClimberId | null;
  /** The ladder whose line he holds, or none. */
  readonly ladder: string | null;
  /** The mountain's seconds of his rest still to go, once it has begun; none otherwise. */
  readonly restLeft: number | null;
}

/** The ground the Sherpa reads the hazards of: the section's zones, the training events staged
 * on it and the warnings going (`ObjectiveHazards`). */
export interface SherpaHazards {
  readonly zones: readonly HazardZone[];
  readonly events: readonly HazardEvent[];
  readonly warnings: readonly Warning[];
}

/** The mountain's clock as far as he uses it: the seconds since the expedition began. */
export interface SherpaClock {
  readonly elapsed: number;
}

/** A Sherpa as a scenario starts him: his climber, the clients he guides, and the stretch of the
 * camp the section ends at. A type, not an interface, so that saves keep it as plain data. */
export type SherpaStart = {
  readonly climber: ClimberId;
  readonly clients: readonly ClimberId[];
  readonly arrival: { readonly from: number; readonly to: number };
};

/** A rest with a client he went to pull out: where along the ground, and when it ends on the
 * mountain's clock, once the client has come to it. */
type Rest = {
  readonly client: ClimberId;
  readonly at: number;
  readonly until: number | null;
};

/** The Sherpa's whole state, as saves keep it. */
type SherpaSave = SherpaStart & {
  readonly footwork: FootworkSave;
  /** The clients who've set off, by moving once: a seat nobody plays never does. */
  readonly setOff: readonly ClimberId[];
  readonly doing: SherpaDoing;
  readonly client: ClimberId | null;
  /** Whether he walks now, for the lead's give: he walks on until he's far enough ahead. */
  readonly walking: boolean;
  /** The ladder he's on, or the last he stepped off while he holds its line. */
  readonly ladder: string | null;
  readonly holding: boolean;
  /** The client he's going to pull out, until they're on their feet; then the rest with them. */
  readonly rescue: ClimberId | null;
  readonly rest: Rest | null;
  /** When, on the mountain's clock, the client ahead of him stopped, while they stand still
   * (#197): missing from the saves of builds before he passed. */
  readonly stillSince?: number | null;
};

/** What he does this step: which way he goes, or none to stand, and whether he holds the haul. */
type Plan = {
  readonly way: RouteWay | null;
  readonly haul: boolean;
  readonly doing: SherpaDoing;
  readonly client: ClimberId | null;
};

/**
 * A Sherpa who guides his clients through a section (#212), as a client's own Sherpa does in the
 * Icefall (`technique.sherpa-leads`, `technique.personal-sherpa`): an agent of the core, steering
 * his climber through the same door as a player (`Rule.act`), on the footwork of a careful climber
 * (`Footwork`), always clipped in and taking the rest step where a slip is likeliest.
 *
 * He waits until a client sets off, then leads, `lead` metres ahead of the first of them, and
 * waits for the last once they're `wait` behind; one who goes ahead of him he follows, `behind`
 * metres back, until they stand still for `pass` of the mountain's seconds, and he goes past them
 * on the rope to lead again (#197). He never stands where the ice falls: not in a hazard's zone, on blue ice or on a
 * ladder, but goes on to safe ground. He crosses each ladder first and holds its line taut from
 * its far end until his clients behind are across (the haul, held with nobody to haul, steadies
 * it), and never steps onto a ladder someone's on or that's broken. A client hanging on the rope
 * he goes to, and hauls out from the ground within reach of where they'd come up; then he waits
 * with them on the nearest safe ground for `rest` of the mountain's seconds, or until they go on.
 * A hazard going over him he backs out from under. In the camp the section ends at, he stops.
 * The same hazards threaten him as anyone.
 */
export class Sherpa implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "sherpa";

  /** How near a spot along the ground he stands to be at it, and how near a ladder's end ahead
   * he waits when he can't step onto it, in metres. */
  private static readonly AT = 0.3;
  private static readonly AT_LADDER = 0.6;
  /** How far past the nearer end of a hazard's stretch going over him he backs off, and how far
   * short of the far end of the camp he stops, in metres. */
  private static readonly CLEAR = 1;
  private static readonly SHORT_OF_THE_END = 2;
  /** How far behind him a client counts as level with him, in metres; and how near two lengths
   * are to be the same. */
  private static readonly LEVEL = 0.5;
  private static readonly EXACT = 1e-6;

  readonly name = Sherpa.NAME;

  private state: SherpaSave | null = null;
  private footwork: Footwork | null = null;
  private readonly ladderEnds = new Map<string, readonly number[]>();

  constructor(
    private readonly settings: SherpaSettings,
    private readonly physics: SlopePhysics,
    private readonly hazards: SherpaHazards,
    private readonly clock: SherpaClock,
  ) {}

  /** A scenario's start state for a Sherpa: standing, nobody set off yet. */
  static start(start: SherpaStart): Json {
    const { climber, clients, arrival } = start;
    if (clients.includes(climber)) {
      throw new RangeError(`${climber} can't guide himself`);
    }
    if (!(arrival.from < arrival.to)) {
      throw new RangeError("The camp he guides his clients to has no stretch");
    }
    const save: SherpaSave = {
      climber,
      clients,
      arrival,
      footwork: Footwork.STANDING,
      setOff: [],
      doing: "waiting",
      client: null,
      walking: false,
      ladder: null,
      holding: false,
      rescue: null,
      rest: null,
    };
    return save;
  }

  /** What he's doing, for his voice and the picture. */
  get view(): SherpaView {
    const { climber, doing, client, ladder, holding, rest } = this.loaded;
    const ends = rest?.until ?? null;
    return {
      climber,
      doing,
      client,
      ladder: holding ? ladder : null,
      restLeft: ends === null ? null : Math.max(0, ends - this.clock.elapsed),
    };
  }

  load(state: Json): void {
    const save = state as unknown as SherpaSave;
    this.state = save;
    this.footwork = new Footwork(this.physics, save.climber, true, save.footwork);
    this.ladderEnds.clear();
  }

  save(): Json {
    const save: SherpaSave = { ...this.loaded, footwork: this.steps.save() };
    return save;
  }

  /** What his climber does this step, from where everyone stands after the last. */
  act(): readonly GameAction[] {
    const { climber } = this.loaded;
    const me = this.physics.climber(climber);
    if (me.dead) {
      return [];
    }
    this.noticeSetOff();
    const along = this.physics.along(climber);
    this.noticeLadder(me, along);
    this.noticeStill(along);
    const plan = this.plan(me, along);
    this.state = {
      ...this.loaded,
      doing: plan.doing,
      client: plan.client,
      walking: plan.way !== null,
    };
    const moves = this.steps.actions(plan.way);
    const haul: readonly GameAction[] =
      plan.haul === me.haulHeld ? [] : [{ kind: "haul", climber, held: plan.haul }];
    return [...moves, ...haul];
  }

  advance(): void {}

  /** Each client seen moving for the first time has set off. */
  private noticeSetOff(): void {
    const { clients, setOff } = this.loaded;
    const now = clients.filter((id) => setOff.includes(id) || this.physics.climber(id).moving);
    if (now.length !== setOff.length) {
      this.state = { ...this.loaded, setOff: now };
    }
  }

  /** How long the client furthest ahead of him has stood still, on their feet off a ladder: since
   * when, while they do. */
  private noticeStill(along: number): void {
    const state = this.loaded;
    const first = state.setOff
      .filter((id) => !this.physics.climber(id).dead)
      .reduce<ClimberId | null>(
        (best, id) =>
          best === null || this.physics.along(id) > this.physics.along(best) ? id : best,
        null,
      );
    const view = first === null ? null : this.physics.climber(first);
    const ahead = first === null ? 0 : this.physics.along(first) - along;
    const still = view !== null && ahead > Sherpa.LEVEL && !view.moving && this.onTheGround(view);
    const since = still ? (state.stillSince ?? this.clock.elapsed) : null;
    if (since !== (state.stillSince ?? null)) {
      this.state = { ...state, stillSince: since };
    }
  }

  /** The ladder he's on; stepping off one, he holds its line for whoever is still to cross. */
  private noticeLadder(me: ClimberView, along: number): void {
    const state = this.loaded;
    if (me.ladder !== null) {
      this.state = { ...state, ladder: me.ladder, holding: false };
      return;
    }
    if (state.ladder !== null && !state.holding && !me.falling) {
      const end = this.endAt(state.ladder, along);
      this.state = end === null ? { ...state, ladder: null } : { ...state, holding: true };
    }
  }

  /** What he does now, most pressing first. */
  private plan(me: ClimberView, along: number): Plan {
    return (
      this.rescue(me, along) ??
      this.rested(along) ??
      this.retreat(along) ??
      this.hold(along) ??
      this.guide(me, along)
    );
  }

  /** A client hanging on the rope: to the ground within reach of where they'd come up, nearest
   * him, and the haul held there; none in reach, he stands where it's safe. Once they're on
   * their feet again, the rest begins. */
  private rescue(me: ClimberView, along: number): Plan | null {
    const state = this.loaded;
    const hanging = state.clients
      .map((id) => ({ id, lift: this.physics.liftPoint(id) }))
      .filter((client): client is { id: ClimberId; lift: Point } => client.lift !== null)
      .map((client) => ({ ...client, spot: this.haulSpot(client.lift, along) }))
      .sort((a, b) => this.away(a.spot, along) - this.away(b.spot, along));
    const [client] = hanging;
    if (client === undefined) {
      if (state.rescue !== null) {
        const { rescue } = state;
        const view = this.physics.climber(rescue);
        const at = this.restSpot(this.physics.along(rescue));
        this.state = {
          ...state,
          rescue: null,
          rest: view.dead || at === null ? null : { client: rescue, at, until: null },
        };
      }
      return null;
    }
    this.state = { ...state, rescue: client.id, rest: null, holding: false, ladder: null };
    const plan = { doing: "rescuing" as const, client: client.id };
    if (client.spot === null) {
      return { ...plan, way: this.onTheGround(me) ? null : this.forward(me), haul: false };
    }
    if (Math.abs(client.spot - along) <= Sherpa.AT && this.onTheGround(me)) {
      return { ...plan, way: null, haul: true };
    }
    return { ...plan, way: this.move(this.toward(client.spot, along), along), haul: false };
  }

  /** With a client he pulled out: to the safe spot, and there until the rest is over, or until
   * they go on without him, or away. */
  private rested(along: number): Plan | null {
    const state = this.loaded;
    const { rest } = state;
    if (rest === null) {
      return null;
    }
    const view = this.physics.climber(rest.client);
    const theirs = this.physics.along(rest.client);
    const over = rest.until !== null && this.clock.elapsed >= rest.until;
    const gone =
      view.dead ||
      Math.abs(theirs - rest.at) > this.settings.wait ||
      theirs - along > this.settings.lead.far;
    if (over || gone) {
      this.state = { ...state, rest: null };
      return null;
    }
    const plan = { haul: false, doing: "resting" as const, client: rest.client };
    const seat = this.seat(rest.at);
    if (Math.abs(seat - along) > Sherpa.AT) {
      return { ...plan, way: this.move(this.toward(seat, along), along) };
    }
    if (rest.until === null && Math.abs(theirs - rest.at) <= this.settings.lead.near) {
      this.state = { ...state, rest: { ...rest, until: this.clock.elapsed + this.settings.rest } };
    }
    return { ...plan, way: null };
  }

  /** A hazard going over him: out from under its stretch to its nearer end, or, short of it,
   * standing where he is. */
  private retreat(along: number): Plan | null {
    const stretch = this.goingOver(along);
    if (stretch === null) {
      return null;
    }
    const plan = { haul: false, doing: "retreating" as const, client: null };
    if (along < stretch.from || along > stretch.to) {
      return { ...plan, way: null };
    }
    const back = stretch.from - Sherpa.CLEAR;
    const on = stretch.to + Sherpa.CLEAR;
    const nearer = along - back <= on - along ? back : on;
    return { ...plan, way: this.move(this.toward(nearer, along), along) };
  }

  /** At the far end of the ladder he just crossed, its line held taut for the clients still to
   * cross it, until they're over; not where the ice falls while they're still far behind. */
  private hold(along: number): Plan | null {
    const state = this.loaded;
    const { ladder } = state;
    if (ladder === null || !state.holding) {
      return null;
    }
    const end = this.endAt(ladder, along);
    const behind = end === null ? [] : this.behind(ladder, end);
    const [nearest] = behind;
    if (end === null || nearest === undefined) {
      this.state = { ...state, ladder: null, holding: false };
      return null;
    }
    const on = this.physics.climber(nearest.id).ladder === ladder;
    const far = !on && Math.abs(nearest.along - end.other) > this.settings.wait;
    if (far && !this.safeAt(along)) {
      this.state = { ...state, ladder: null, holding: false };
      return null;
    }
    return { way: null, haul: true, doing: "holding", client: nearest.id };
  }

  /** Leading, following, or waiting for the clients who've set off, on safe ground. */
  private guide(me: ClimberView, along: number): Plan {
    const state = this.loaded;
    const { lead, behind, wait } = this.settings;
    const team = state.setOff
      .filter((id) => !this.physics.climber(id).dead)
      .map((id) => ({ id, along: this.physics.along(id) }))
      .sort((a, b) => a.along - b.along);
    const last = team[0];
    const first = team.at(-1);
    const stand = (doing: SherpaDoing, client: ClimberId | null): Plan => ({
      way: this.safe(me, along) ? null : this.forward(me),
      haul: false,
      doing,
      client,
    });
    if (first === undefined || last === undefined) {
      return stand("waiting", null);
    }
    if (along >= state.arrival.to - Sherpa.SHORT_OF_THE_END) {
      return stand("arrived", null);
    }
    const go = (doing: SherpaDoing): Plan =>
      this.move("up", along) === null
        ? { way: null, haul: false, doing: "waiting", client: null }
        : { way: "up", haul: false, doing, client: null };
    if (first.along - along > Sherpa.LEVEL) {
      // A client went ahead of him: he follows them, but never too far from the last.
      const ahead = first.along - along;
      if (along - last.along > wait) {
        return stand("waiting", last.id);
      }
      const { stillSince = null } = state;
      const rested = stillSince !== null && this.clock.elapsed - stillSince >= this.settings.pass;
      if (rested && ahead <= behind.far + Sherpa.CLEAR) {
        // They've stood a while: he goes past them on the rope, and leads again (#197).
        return go("passing");
      }
      if (ahead > behind.far || (state.walking && ahead > behind.near)) {
        return go("following");
      }
      return stand("following", null);
    }
    const gap = along - first.along;
    if (along - last.along > wait) {
      return stand("waiting", last.id);
    }
    if (along >= state.arrival.from) {
      return stand("arrived", null);
    }
    if (gap < lead.near || (state.walking && gap < lead.far)) {
      return go("leading");
    }
    return stand("leading", null);
  }

  /** `way`, unless it's barred right ahead of him on the ground: a ladder he'd step onto that's
   * broken, or that someone's on; then none, and he waits at its end. */
  private move(way: RouteWay, along: number): RouteWay | null {
    const { climber, clients } = this.loaded;
    if (!this.onTheGround(this.physics.climber(climber))) {
      return way;
    }
    const barred = this.physics.ladders.some((id) => {
      const [from, to] = this.ends(id);
      const onto = way === "up" ? from : to;
      if (onto === undefined) {
        return false;
      }
      const ahead = way === "up" ? onto - along : along - onto;
      if (ahead < -Sherpa.AT || ahead > Sherpa.AT_LADDER) {
        return false;
      }
      const taken = clients.some(
        (client) => client !== climber && this.physics.climber(client).ladder === id,
      );
      return taken || this.physics.ladderCondition(id) === "broken";
    });
    return barred ? null : way;
  }

  /** Where he sits by a client resting at `at`: a metre on up the route, where that's safe, or
   * beside them. */
  private seat(at: number): number {
    const on = at + Sherpa.CLEAR;
    return this.safeAt(on) && this.standable(on) ? on : at;
  }

  /** The clients who've still to cross a ladder he stands at the end of, nearest the ladder
   * first: those on it, and those on the ground at its other side. */
  private behind(
    ladder: string,
    end: { readonly at: number; readonly other: number },
  ): readonly { readonly id: ClimberId; readonly along: number }[] {
    const { setOff } = this.loaded;
    const side = end.other < end.at ? -1 : 1;
    return setOff
      .filter((id) => !this.physics.climber(id).dead)
      .map((id) => ({ id, view: this.physics.climber(id), along: this.physics.along(id) }))
      .filter(({ view, along }) => view.ladder === ladder || (along - end.at) * side > Sherpa.AT)
      .sort((a, b) => Math.abs(a.along - end.at) - Math.abs(b.along - end.at))
      .map(({ id, along }) => ({ id, along }));
  }

  /** The end of `ladder` he stands at, by how far along the ground it is, and its other end; none
   * if he's at neither. */
  private endAt(
    ladder: string,
    along: number,
  ): { readonly at: number; readonly other: number } | null {
    const [from, to] = this.ends(ladder);
    if (from === undefined || to === undefined) {
      return null;
    }
    if (Math.abs(along - to) <= Sherpa.AT_LADDER) {
      return { at: to, other: from };
    }
    if (Math.abs(along - from) <= Sherpa.AT_LADDER) {
      return { at: from, other: to };
    }
    return null;
  }

  /** A ladder's ends, by how far along the ground they are, the one further back first: found once
   * a load, since the ladders lie where they're laid. */
  private ends(ladder: string): readonly number[] {
    const known = this.ladderEnds.get(ladder);
    if (known !== undefined) {
      return known;
    }
    const ends = this.physics
      .ladder(ladder)
      .map((point) => this.physics.terrain.nearest(point).along)
      .sort((a, b) => a - b);
    this.ladderEnds.set(ladder, ends);
    return ends;
  }

  /** Where along the ground he hauls a client hanging from: on the ground within reach of where
   * they'd come up, at a ladder's end or under where they'd come up, the nearest him; none if no
   * ground is in reach. */
  private haulSpot(lift: Point, along: number): number | null {
    const { terrain } = this.physics;
    const below = terrain.nearest(lift).along;
    const spots = [below, ...this.physics.ladders.flatMap((id) => this.ends(id))]
      .filter((spot) => {
        const point = terrain.point(spot);
        const x = point.x - lift.x;
        const y = point.y - lift.y;
        return Math.sqrt(x * x + y * y) <= this.settings.reach && this.standable(spot);
      })
      .sort((a, b) => Math.abs(a - along) - Math.abs(b - along));
    return spots[0] ?? null;
  }

  /** The nearest spot to `from` along the ground, either way, where nobody need stand under
   * falling ice or on blue ice: where he sits with a client he pulled out. */
  private restSpot(from: number): number | null {
    const step = 0.5;
    const farthest = 200;
    for (let away = 0; away <= farthest; away += step) {
      for (const spot of [from + away, from - away]) {
        if (
          spot >= 0 &&
          spot <= this.loaded.arrival.to &&
          this.safeAt(spot) &&
          this.standable(spot)
        ) {
          return spot;
        }
      }
    }
    return null;
  }

  /** Whether a climber can stand on the ground at `spot`: not under a ladder, up a face of ice
   * between its foot and its lip, or on a ledge nobody walks out of. */
  private standable(spot: number): boolean {
    const { physics } = this;
    const between = (from: number, to: number): boolean =>
      spot > Math.min(from, to) + Sherpa.EXACT && spot < Math.max(from, to) - Sherpa.EXACT;
    const under = physics.ladders.some((id) => {
      const [from, to] = this.ends(id);
      return from !== undefined && to !== undefined && between(from, to);
    });
    const face = physics.face(spot);
    const up = face !== null && between(face.foot, face.top);
    return !under && !up && !physics.deadEnd(spot);
  }

  /** Whether he stands where it's safe to wait: on his feet on the ground, out of every hazard's
   * zone and off blue ice. */
  private safe(me: ClimberView, along: number): boolean {
    return this.onTheGround(me) && this.safeAt(along);
  }

  /** Whether the ground at `along` is out of every hazard's zone and off blue ice. */
  private safeAt(along: number): boolean {
    const inZone = this.hazards.zones.some(({ from, to }) => along >= from && along <= to);
    const onIce = this.physics.ice.some(({ from, to }) => along >= from && along <= to);
    return !inZone && !onIce;
  }

  /** On his feet on the ground: not on a ladder, on the ice, down a rope or in a fall. */
  private onTheGround(me: ClimberView): boolean {
    return !me.falling && me.ladder === null && !me.onIce && !me.lowering;
  }

  /** The stretch of the hazard going over `along`, a zone's or a training event's with its lead,
   * or none. */
  private goingOver(along: number): { readonly from: number; readonly to: number } | null {
    const { zones, events, warnings } = this.hazards;
    for (const warning of warnings) {
      const zone = zones.find(({ id }) => id === warning.zone);
      if (zone !== undefined && along >= zone.from && along <= zone.to) {
        return zone;
      }
      const event = events.find(({ id }) => id === warning.zone);
      if (
        event !== undefined &&
        along >= event.from - event.lead &&
        along <= event.to + event.lead
      ) {
        return event;
      }
    }
    return null;
  }

  /** The way on: the way he was going on a ladder, the ice or a rope down a step, and up the
   * route anywhere else. */
  private forward(me: ClimberView): RouteWay {
    return this.onTheGround(me) ? "up" : (this.steps.going ?? "up");
  }

  /** The way along the ground to `spot` from `along`. */
  private toward(spot: number, along: number): RouteWay {
    return spot >= along ? "up" : "down";
  }

  /** How far along the ground `spot` is from `along`, none being as far as can be. */
  private away(spot: number | null, along: number): number {
    return spot === null ? Number.MAX_VALUE : Math.abs(spot - along);
  }

  private get steps(): Footwork {
    if (this.footwork === null) {
      throw new RangeError("The Sherpa has no footwork: load a state first");
    }
    return this.footwork;
  }

  private get loaded(): SherpaSave {
    if (this.state === null) {
      throw new RangeError("The Sherpa has no state: load one first");
    }
    return this.state;
  }
}
