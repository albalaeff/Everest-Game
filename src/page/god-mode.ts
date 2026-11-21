import type { ExpeditionRules } from "../content/mountain";
import type { Section } from "../content/section";
import type { Injury, Point } from "../physics";
import { MountainClock } from "../simulation";
import type { ClimberId, HazardEvent, HazardWeather, JoltKind } from "../simulation";
import { GodPlaces } from "./god-places";
import type { GodPlace } from "./god-places";
import type { SoloGame } from "./solo-game";

/** Where the god mode's player is, and their Sherpa, for its panel. */
export interface GodWhere {
  readonly along: number;
  readonly altitude: number;
  readonly sherpa: number | null;
}

/** What the god mode gives a script, on `window.everest.god` (#245): its places, and its powers. */
export interface GodHooks {
  readonly places: readonly GodPlace[];
  readonly where: GodWhere;
  readonly state: GodState;
  teleport(where: string | number, who?: ClimberId): number;
  hour(time: string): void;
  weather(weather: HazardWeather | "drawn"): void;
  calm(): void;
  speed(times: number): void;
  serac(): HazardEvent;
  ladder(id?: string): string | null;
  jolt(kind?: JoltKind): boolean;
  slip(): void;
  injure(injury?: Pick<Injury, "part" | "kind">, who?: ClimberId, at?: number): void;
  immortal(on: boolean): void;
}

/** How the god mode has set the climb: whether the player is immortal, how many times faster than
 * real time it runs, the weather it holds, or the seed's (#272), and the mountain's time of day,
 * `HH:MM`. */
export interface GodState {
  readonly immortal: boolean;
  readonly speed: number;
  readonly weather: HazardWeather | "drawn";
  readonly time: string;
}

/**
 * The god mode (#245): a tester's powers over the climb alone, asked for with `?god` in the
 * address, so a check or a story goes to any place on the route and sets a scenario up there
 * rather than walk from Base Camp. It stages the climb between steps, as a scenario's start state
 * does, through the powers each rule has for it (docs/conventions/simulation-core.md → The only
 * door): it puts a climber on their feet anywhere, clipped to the rope there, their Sherpa with
 * them; sets the clock on to a time of day, the weather and the speed, and calms the gusts; stages a serac collapse over
 * the player, the next ladder breaking, a gust or a twist, a slip, an injury to rescue a climber
 * from (#241); and, immortal, stands the player up again where their body comes to rest. Each power saves the climb, in the god mode's own slot.
 * The panel and `window.everest.god` are the page's.
 */
export class GodMode implements GodHooks {
  /** The address's word that asks for it. */
  static readonly WORD = "god";
  /** The speeds its panel offers, times real time. */
  static readonly SPEEDS: readonly number[] = [1, 5, 20];
  /** The weathers its panel holds, and the seed's, which turns through the days (#272). */
  static readonly WEATHERS: readonly (HazardWeather | "drawn")[] = [
    "clear",
    "cloud",
    "snow",
    "wind",
    "storm",
    "drawn",
  ];
  /** The injury it stages unless told another: a broken leg, which can't walk. */
  private static readonly BROKEN_LEG: Pick<Injury, "part" | "kind"> = {
    part: "leg",
    kind: "fracture",
  };
  /** The ids of the collapses it stages, before their count. */
  private static readonly COLLAPSE = "god-serac-";
  /** How long an immortal player lies dead at the most, still falling, before they stand up: less
   * than the page waits to say they died (`CampNotice.SETTLE_SECONDS`). */
  private static readonly REVIVE_SECONDS = 2;

  readonly places: readonly GodPlace[];
  private readonly lookup: GodPlaces;
  private undying = false;
  private deadFor = 0;
  private times = 1;

  constructor(
    private readonly game: SoloGame,
    private readonly rules: ExpeditionRules,
    private readonly route: Section,
    private readonly player: ClimberId,
    private readonly sherpa: ClimberId | null,
    seed: number,
  ) {
    this.lookup = new GodPlaces(route, rules.physics.bareFaces, seed);
    this.places = this.lookup.all;
  }

  /** Whether a page's address asks for the god mode. */
  static asked(href: string): boolean {
    return new URL(href).searchParams.has(GodMode.WORD);
  }

  get state(): GodState {
    const { weather, clock } = this.rules;
    return {
      immortal: this.undying,
      speed: this.times,
      weather: weather.held ?? "drawn",
      time: MountainClock.text(clock.timeOfDay),
    };
  }

  /** Where the player is, and their Sherpa. */
  get where(): GodWhere {
    const { physics } = this.rules;
    return {
      along: physics.along(this.player),
      altitude: physics.climber(this.player).altitude,
      sherpa: this.sherpa === null ? null : physics.along(this.sherpa),
    };
  }

  /**
   * Puts `who`, the player unless it says, on their feet at `where`: a place's id, or metres along
   * the ground. Under a ladder, they stand at its nearer end; on a step of ice, at its foot or its
   * top, the nearer; past the ground's ends, at the end. They're alive, still and clipped to the
   * rope there; the player's Sherpa comes with them, unless he lies with a bone broken (#241),
   * and takes the climb afresh. Where they stand, in metres along the ground.
   */
  teleport(where: string | number, who: ClimberId = this.player): number {
    const along = this.spot(typeof where === "number" ? where : this.lookup.along(where));
    const { physics, sherpa } = this.rules;
    physics.stand(who, along, true);
    // Their Sherpa comes with them on his feet: one who lies with a bone broken stays where he
    // lies, for the player to go to (#241).
    if (who === this.player && this.sherpa !== null && !physics.climber(this.sherpa).down) {
      physics.stand(this.sherpa, along, true);
    }
    if (this.sherpa !== null) {
      sherpa.afresh();
    }
    this.game.save();
    return along;
  }

  /** Sets the mountain's clock on to the next `time` of day, `HH:MM`: it never runs back, so an
   * hour gone by today is tomorrow's. */
  hour(time: string): void {
    const { clock } = this.rules;
    const day = MountainClock.SECONDS_A_DAY;
    clock.skip((MountainClock.secondsOf(time) - clock.timeOfDay + day) % day);
    this.game.save();
  }

  /** Holds a weather from now on, or goes back to the seed's (#272), and tells the hazards and the
   * jolts at once. */
  weather(weather: HazardWeather | "drawn"): void {
    const { rules } = this;
    rules.weather.hold(weather === "drawn" ? null : weather);
    const now = rules.weather.now;
    rules.hazards.changeWeather(now);
    rules.jolts.changeWeather(now);
    this.game.save();
  }

  /** Calms the mountain: no gust nor twist comes from now on, and none can be staged. For a
   * long scenario that must run with no chance of its own, a rescue's haul at a crevasse's edge
   * (#241). */
  calm(): void {
    this.rules.jolts.calm();
    this.game.save();
  }

  /** Runs the climb `times` times faster than real time, from 1. */
  speed(times: number): void {
    this.game.faster(times);
    this.times = times;
  }

  /** Stages a serac collapse over the player, for them: it cracks at once, and they have its
   * crack's time to get clear. The collapse it staged. */
  serac(): HazardEvent {
    const { hazards, physics } = this.rules;
    const count = hazards.events.filter(({ id }) => id.startsWith(GodMode.COLLAPSE)).length;
    const over = this.route.collapseOver(
      physics.along(this.player),
      `${GodMode.COLLAPSE}${String(count + 1)}`,
    );
    const event: HazardEvent = { ...over, trainees: [this.player] };
    hazards.stageEvent(event);
    this.game.save();
    return event;
  }

  /** Stages a ladder to break under the player, in its middle: `id`, or the first ahead of them
   * long enough to break. The ladder it staged, or none ahead. */
  ladder(id?: string): string | null {
    const { physics } = this.rules;
    const staged =
      id === undefined ? this.route.breakAhead(physics.along(this.player)) : this.route.breakOf(id);
    if (staged === null) {
      return null;
    }
    physics.stageBreak(staged.id, staged.breaks, [this.player]);
    this.game.save();
    return staged.id;
  }

  /** Brings a jolt on its way to the player, a gust over the stretch they're on or a twist on
   * the lashed ladder they're at: whether one is coming. */
  jolt(kind: JoltKind = "gust"): boolean {
    const brought = this.rules.jolts.bring(kind, this.player, this.game.step);
    this.game.save();
    return brought;
  }

  /** The player slips where they stand: a fall, which their rope holds if they're clipped. */
  slip(): void {
    this.rules.physics.upset(this.player, this.game.step);
    this.game.save();
  }

  /** Injures `who`, the player unless it says, as a hard landing would have (#241): a broken leg,
   * unless `injury` says otherwise. With `at`, metres along the ground, they lie there first, off
   * the rope, as a fall would have left them: a crevasse's floor, under its ladder, too. A Sherpa
   * who isn't the one hurt takes the climb as he finds it. */
  injure(
    injury: Pick<Injury, "part" | "kind"> = GodMode.BROKEN_LEG,
    who: ClimberId = this.player,
    at?: number,
  ): void {
    const { physics, sherpa } = this.rules;
    if (at !== undefined) {
      physics.stand(who, Math.min(Math.max(at, 0), physics.terrain.length), false);
    }
    physics.injure(who, injury, this.game.step);
    if (this.sherpa !== null && who !== this.sherpa) {
      sherpa.afresh();
    }
    this.game.save();
  }

  /** Whether the player stands up again where they'd have died. */
  immortal(on: boolean): void {
    this.undying = on;
  }

  /** Puts the player on the ground nearest a point of the slope, in its metres, as `teleport`
   * does: where the panel's pick lands. */
  teleportTo(point: Point): number {
    return this.teleport(this.rules.physics.terrain.nearest(point).along);
  }

  /** Each frame, `seconds` after the last, before the page reads a death: an immortal player who
   * died stands up again where their body comes to rest, the fall kept as one they lived through,
   * or where it is after `REVIVE_SECONDS`. */
  update(seconds: number): void {
    const { physics } = this.rules;
    const view = physics.climber(this.player);
    this.deadFor = view.dead ? this.deadFor + seconds : 0;
    if (!this.undying || !view.dead) {
      return;
    }
    if (view.falling && this.deadFor < GodMode.REVIVE_SECONDS) {
      return;
    }
    physics.stand(this.player, this.spot(physics.along(this.player)), true);
    this.deadFor = 0;
    if (this.sherpa !== null) {
      this.rules.sherpa.afresh();
    }
    this.game.save();
  }

  /** Where a climber can stand nearest `along`: on the ground, at the nearer end of a ladder whose
   * span it's under (nobody stands there), and at the foot or the top of a step of ice it's on. */
  private spot(along: number): number {
    const { physics } = this.rules;
    const on = Math.min(Math.max(along, 0), physics.terrain.length);
    const nearer = (from: number, to: number): number => (on - from <= to - on ? from : to);
    const ladder = this.route.layout.ladders.find(({ from, to }) => on > from && on < to);
    if (ladder !== undefined) {
      return nearer(ladder.from, ladder.to);
    }
    const face = physics.bareFaces.find(({ foot, top }) => on > foot && on < top);
    return face === undefined ? on : nearer(face.foot, face.top);
  }
}
