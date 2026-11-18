import type { ClimberId, GameAction } from "./game-action";
import type { Json } from "./json";
import type { MountainClock } from "./mountain-clock";
import type { Moment, Rule } from "./rule";

/** The devices' numbers, from the knowledge base, in the mountain's seconds: how long a tracker
 * that's tracking waits between two points, how long its full battery lasts tracking, and how
 * long a message takes to leave once the tracker sees the sky. */
export interface DeviceNumbers {
  readonly interval: number;
  readonly life: number;
  readonly delivery: number;
}

/** Where the devices are: a climber who hangs on their rope in a crevasse or under a lip has ice
 * between their radio and Base Camp, and no sky over their tracker. The slope physics. */
export interface DeviceGround {
  climber(id: ClimberId): { readonly dead: boolean; readonly hanging: boolean };
}

/** A call on the radio: the step it was made on, the mountain's time of day in seconds, who
 * called on which channel with which ready phrase, and whether it got out. */
export interface RadioCall {
  readonly step: number;
  readonly at: number;
  readonly climber: ClimberId;
  readonly channel: Extract<GameAction, { kind: "radio" }>["channel"];
  readonly phrase: string;
  readonly heard: boolean;
}

/** A climber's radio as the page shows it: whether a call would get out from where they are. */
export interface RadioView {
  readonly contact: boolean;
}

/** A climber's tracker as the page shows it: whether it's tracking, its charge as a share, the
 * points it has sent and the time of day of the last, the check-ins sent and the messages still
 * leaving, its SOS, and whether it sees the sky. */
export interface TrackerView {
  readonly tracking: boolean;
  readonly charge: number;
  readonly points: number;
  readonly last: number | null;
  readonly checkIns: number;
  readonly sending: number;
  readonly sos: "none" | "sending" | "sent";
  readonly sky: boolean;
}

/** A message on its way out of a tracker: which, and the seconds of sky it still needs. */
type Outgoing = { readonly kind: "check-in" | "sos"; left: number };

type TrackerSave = {
  readonly id: ClimberId;
  tracking: boolean;
  charge: number;
  points: number;
  /** The time of day of the last point, and the mountain's seconds elapsed at it. */
  last: number | null;
  lastAt: number | null;
  checkIns: number;
  sos: boolean;
  outgoing: Outgoing[];
};

type DevicesSave = {
  readonly trackers: readonly TrackerSave[];
  readonly calls: readonly RadioCall[];
};

/** Who carries the devices as a scenario starts: every climber, each tracker charged and off. */
export interface DeviceStart {
  readonly climbers: readonly ClimberId[];
}

/**
 * The electronics a climber carries (#260): a handheld radio and a satellite tracker. A call on
 * the radio gets out unless ice stands between it and Base Camp, as it does for a climber hanging
 * in a crevasse; every call is kept, heard or not, and the page gives Base Camp its answer. A
 * tracker that's tracking sends a point each `interval` while it sees the sky, and its battery
 * runs down as it does; a check-in or an SOS takes `delivery` seconds of sky to leave. A tracker
 * goes on tracking when its climber can't work it any more: that is what it's carried for. The
 * rule runs after the slope physics, which says who hangs where, and draws nothing from chance.
 */
export class Devices implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "devices";

  readonly name = Devices.NAME;
  private trackers = new Map<ClimberId, TrackerSave>();
  private kept: RadioCall[] = [];

  constructor(
    private readonly numbers: DeviceNumbers,
    private readonly clock: MountainClock,
    private readonly ground: DeviceGround,
  ) {
    const { interval, life, delivery } = numbers;
    if (!(interval > 0 && life > 0 && delivery >= 0)) {
      throw new RangeError(
        `A tracker can't send every ${interval} s, last ${life} s and deliver in ${delivery} s`,
      );
    }
  }

  /** The state a scenario starts the devices in. */
  static start(start: DeviceStart): Json {
    const save: DevicesSave = {
      trackers: start.climbers.map((id) => ({
        id,
        tracking: false,
        charge: 1,
        points: 0,
        last: null,
        lastAt: null,
        checkIns: 0,
        sos: false,
        outgoing: [],
      })),
      calls: [],
    };
    return save as unknown as Json;
  }

  load(state: Json): void {
    const save = state as unknown as DevicesSave;
    this.trackers = new Map(
      save.trackers.map((tracker) => [
        tracker.id,
        { ...tracker, outgoing: tracker.outgoing.map((message) => ({ ...message })) },
      ]),
    );
    this.kept = [...save.calls];
  }

  save(): Json {
    const save: DevicesSave = {
      trackers: [...this.trackers.values()].map((tracker) => ({
        ...tracker,
        outgoing: tracker.outgoing.map((message) => ({ ...message })),
      })),
      calls: [...this.kept],
    };
    return save as unknown as Json;
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      if (action.kind === "radio") {
        this.call(moment.step, action);
      } else if (action.kind === "tracker") {
        this.work(action);
      }
    }
    for (const tracker of this.trackers.values()) {
      this.run(tracker);
    }
  }

  /** Every call made on the radio, in order, heard or not. */
  get calls(): readonly RadioCall[] {
    return this.kept;
  }

  /** A climber's radio: whether a call would get out from where they are now. */
  radio(id: ClimberId): RadioView {
    this.trackerOf(id);
    return { contact: this.sees(id) };
  }

  /** A climber's tracker. */
  tracker(id: ClimberId): TrackerView {
    const { tracking, charge, points, last, checkIns, sos, outgoing } = this.trackerOf(id);
    const raising = outgoing.some(({ kind }) => kind === "sos");
    return {
      tracking: tracking && charge > 0,
      charge,
      points,
      last,
      checkIns,
      sending: outgoing.length,
      sos: raising ? "sending" : sos ? "sent" : "none",
      sky: this.sees(id),
    };
  }

  /** A call on the radio, by a climber who can still make one. */
  private call(step: number, action: Extract<GameAction, { kind: "radio" }>): void {
    const { climber, channel, phrase } = action;
    this.trackerOf(climber);
    if (this.ground.climber(climber).dead) {
      return;
    }
    this.kept.push({
      step,
      at: this.clock.timeOfDay,
      climber,
      channel,
      phrase,
      heard: this.sees(climber),
    });
  }

  /** A press on the tracker, by a climber who can still press it, while it has charge. */
  private work(action: Extract<GameAction, { kind: "tracker" }>): void {
    const tracker = this.trackerOf(action.climber);
    if (this.ground.climber(action.climber).dead || tracker.charge <= 0) {
      return;
    }
    if (action.do === "track") {
      tracker.tracking = true;
    } else if (action.do === "stop") {
      tracker.tracking = false;
    } else if (action.do === "check-in") {
      tracker.outgoing.push({ kind: "check-in", left: this.numbers.delivery });
    } else if (!tracker.sos && !tracker.outgoing.some(({ kind }) => kind === "sos")) {
      // An SOS turns the tracking on with it: the rescue follows the points.
      tracker.tracking = true;
      tracker.outgoing.push({ kind: "sos", left: this.numbers.delivery });
    }
  }

  /** One step of a tracker: its battery, its point if one is due, and its messages on their way
   * out, while it sees the sky. */
  private run(tracker: TrackerSave): void {
    if (tracker.charge <= 0) {
      return;
    }
    const { clock, numbers } = this;
    const sky = this.sees(tracker.id);
    if (tracker.tracking) {
      tracker.charge = Math.max(0, tracker.charge - clock.secondsAStep / numbers.life);
      const due = tracker.lastAt === null || clock.elapsed - tracker.lastAt >= numbers.interval;
      if (sky && due) {
        tracker.points += 1;
        tracker.last = clock.timeOfDay;
        tracker.lastAt = clock.elapsed;
      }
    }
    if (!sky) {
      return;
    }
    for (const message of tracker.outgoing) {
      message.left -= clock.secondsAStep;
    }
    const left = tracker.outgoing.filter((message) => message.left > 0);
    for (const { kind } of tracker.outgoing.filter((message) => message.left <= 0)) {
      if (kind === "sos") {
        tracker.sos = true;
      } else {
        tracker.checkIns += 1;
      }
    }
    tracker.outgoing = left;
  }

  /** Whether a climber's devices see out: not from where they hang on their rope, in a crevasse
   * or under a lip. */
  private sees(id: ClimberId): boolean {
    return !this.ground.climber(id).hanging;
  }

  private trackerOf(id: ClimberId): TrackerSave {
    const tracker = this.trackers.get(id);
    if (tracker === undefined) {
      throw new RangeError(`${id} carries no devices on this expedition`);
    }
    return tracker;
  }
}
