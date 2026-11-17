import type { ClimberId, GameAction } from "./game-action";
import type { Json } from "./json";
import { MountainClock } from "./mountain-clock";
import type { Moment, Rule } from "./rule";

/** What a climber does in a tent that takes time: melts snow into their bottles, cooks a meal and
 * eats it, naps, sleeps until the alarm, or plays the camp's guitar. */
export const CHORES = ["melt", "cook", "nap", "sleep", "guitar"] as const;
export type Chore = (typeof CHORES)[number];

/** What a chore can't begin for want of: gas for the stove, a meal to cook, the water for it,
 * room in the bottles for more, or a guitar in the camp. */
export type Lack = "gas" | "meals" | "water" | "room" | "guitar";

/** The tents' numbers, from the knowledge base. */
export interface TentNumbers {
  /** How near a tent's door a climber stands to go in, in metres along the ground. */
  readonly reach: number;
  /** Melting snow: the mountain's seconds and the grams of gas a potful takes, and the litres
   * of water it gives. */
  readonly melt: { readonly seconds: number; readonly gas: number; readonly litres: number };
  /** A meal: the mountain's seconds it takes to cook and eat, the grams of gas and the litres of
   * water it takes, and its kcal. */
  readonly meal: {
    readonly seconds: number;
    readonly gas: number;
    readonly water: number;
    readonly kcal: number;
  };
  /** A nap's seconds. */
  readonly nap: number;
  /** The hour a night's sleep ends at, the alarm's: seconds since midnight. */
  readonly wake: number;
}

/** A camp's tents as a scenario pitches them: where each one's door is, along the ground; the
 * grams of gas and the meals its tents hold, `null` for what it never runs out of, as Base
 * Camp's kitchen doesn't; and whether there's a guitar. */
export interface TentCamp {
  readonly id: string;
  readonly doors: readonly number[];
  readonly gas: number | null;
  readonly meals: number | null;
  readonly guitar: boolean;
}

export interface TentStart {
  readonly camps: readonly TentCamp[];
  /** The climbers an agent steers, a Sherpa: a night is skipped once the players sleep, whatever
   * these do, and they sleep through it too. */
  readonly npcs: readonly ClimberId[];
}

/** A tent's door a climber stands at, outside it: the camp, which of its tents, and where the
 * door is along the ground. */
export interface TentDoor {
  readonly camp: string;
  readonly tent: number;
  readonly along: number;
}

/** A climber's tent as the rest of the game sees it, while they're in it: the camp and which of
 * its tents; the chore in hand and how far through it is, 0 to 1, nought for the guitar; the
 * grams of gas and the meals the camp has, `null` for what it never runs out of; whether there's
 * a guitar; what each chore lacks to begin, if anything; and their last sleep here, by the
 * mountain's seconds it began and ended at. */
export interface TentView {
  readonly camp: string;
  readonly tent: number;
  readonly chore: Chore | null;
  readonly progress: number;
  readonly gas: number | null;
  readonly meals: number | null;
  readonly guitar: boolean;
  readonly lacks: Readonly<Record<Chore, Lack | null>>;
  readonly slept: { readonly from: number; readonly to: number } | null;
}

/** Who's on the ground and who's under cover: the slope physics, which sits above the core. */
export interface Campground {
  /** Every living climber on the slope. */
  readonly climbers: readonly ClimberId[];
  along(id: ClimberId): number;
  climber(id: ClimberId): { readonly falling: boolean; readonly dead: boolean };
  /** Takes a climber in under cover, where they stay put whatever their keys say, or lets them
   * out again. */
  shelter(id: ClimberId, inside: boolean): void;
}

/** The water in the climbers' bottles: the packs'. */
export interface Flasks {
  /** The litres a climber carries, and how many more their bottles hold. */
  water(id: ClimberId): number;
  room(id: ClimberId): number;
  /** Pours `litres` into their bottles, as far as there's room, or out of them below nought. */
  pour(id: ClimberId, litres: number): void;
}

/** Who eats and sleeps: the body. */
export interface Sleeper {
  eat(id: ClimberId, kcal: number): void;
  /** They sleep through the mountain's time this step lives: a step's, or a skipped night's. */
  sleep(id: ClimberId): void;
}

/** A chore in hand, as saves keep it: the mountain's seconds it began with and has left. */
type Task = { readonly kind: Chore; readonly whole: number; left: number };

/** Someone in a tent, as saves keep them. */
type Dweller = {
  readonly id: ClimberId;
  readonly camp: string;
  readonly tent: number;
  task: Task | null;
  slept: { from: number; to: number } | null;
};

type TentsSave = {
  readonly camps: readonly TentCamp[];
  readonly npcs: readonly ClimberId[];
  readonly inside: readonly Dweller[];
};

/**
 * The camps' tents, as a rule of the core: a climber on their feet at a tent's door goes in, and
 * comes out when they choose; one knocked off their feet, or stood somewhere else, is out. Inside
 * they stay put, under cover, and take up a chore at a time. The stove melts snow into their
 * bottles and cooks a meal, burning the camp's gas as it goes: a flame that runs out of gas
 * leaves the pot as it was. A meal takes its water from the bottles, and feeds the body when it's
 * done. A sleeper sleeps through the mountain's own time while any player is awake; once every
 * living player sleeps, the clock skips to the first of them to wake (`MountainClock.skip`, the
 * night camp skips), and the Sherpa sleeps through it with them. The guitar only passes the time.
 * It runs after the clock and the packs, whose bottles it fills, and before the body, which
 * sleeps this step, and the slope physics, which keeps whoever is inside where they are. Its
 * numbers are handed to it; who's inside, their chores and the camps' gas and meals are its
 * state, which a scenario starts and a save keeps. A save from before it existed goes on with
 * the camps as the route pitches them (`missing`).
 */
export class Tents implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "tents";
  /** Less than this of a chore's time or a camp's gas is none: sums of fractions end a hair off. */
  private static readonly SPENT = 1e-6;

  readonly name = Tents.NAME;
  private camps: {
    id: string;
    doors: readonly number[];
    gas: number | null;
    meals: number | null;
    guitar: boolean;
  }[] = [];
  private npcs: readonly ClimberId[] = [];
  private readonly inside = new Map<ClimberId, Dweller>();

  constructor(
    private readonly numbers: TentNumbers,
    private readonly clock: MountainClock,
    private readonly ground: Campground,
    private readonly flasks: Flasks,
    private readonly sleeper: Sleeper,
    /** The camps as the route pitches them: what a save from before the tents goes on with. */
    private readonly pitched: TentStart,
  ) {}

  /** The state a scenario starts the tents in: the camps pitched and stocked, nobody inside. */
  static start(start: TentStart): Json {
    for (const { id, doors, gas, meals } of start.camps) {
      const stocked = (gas === null || gas >= 0) && (meals === null || meals >= 0);
      if (!stocked || !doors.every((door) => door >= 0)) {
        throw new RangeError(
          `The tents of ${id} need doors on the ground and no stock below nought`,
        );
      }
    }
    const save: TentsSave = { camps: start.camps, npcs: start.npcs, inside: [] };
    return save as unknown as Json;
  }

  missing(): Json {
    return Tents.start(this.pitched);
  }

  load(state: Json): void {
    const save = state as unknown as TentsSave;
    this.camps = save.camps.map((camp) => ({ ...camp }));
    this.npcs = save.npcs;
    this.inside.clear();
    for (const dweller of save.inside) {
      this.inside.set(dweller.id, {
        ...dweller,
        task: dweller.task === null ? null : { ...dweller.task },
        slept: dweller.slept === null ? null : { ...dweller.slept },
      });
    }
  }

  save(): Json {
    const save: TentsSave = {
      camps: this.camps.map((camp) => ({ ...camp })),
      npcs: this.npcs,
      inside: [...this.inside.values()].map((dweller) => ({
        ...dweller,
        task: dweller.task === null ? null : { ...dweller.task },
        slept: dweller.slept === null ? null : { ...dweller.slept },
      })),
    };
    return save as unknown as Json;
  }

  advance(moment: Moment): void {
    // The chores in hand live through this step's time before anything new begins in it.
    for (const dweller of [...this.inside.values()]) {
      if (this.stays(dweller)) {
        this.ground.shelter(dweller.id, true);
        this.work(dweller);
      } else {
        this.leave(dweller.id);
      }
    }
    for (const action of moment.actions) {
      if (action.kind === "tent") {
        this.pass(action);
      } else if (action.kind === "chore") {
        this.take(action);
      }
    }
    this.night();
  }

  /** A climber's tent, while they're in one. */
  tent(id: ClimberId): TentView | null {
    const dweller = this.inside.get(id);
    if (dweller === undefined) {
      return null;
    }
    const camp = this.campOf(dweller);
    const { task } = dweller;
    const timed = task !== null && task.whole > 0;
    return {
      camp: dweller.camp,
      tent: dweller.tent,
      chore: task?.kind ?? null,
      progress: timed ? Math.min(1, Math.max(0, 1 - task.left / task.whole)) : 0,
      gas: camp.gas,
      meals: camp.meals,
      guitar: camp.guitar,
      lacks: Object.fromEntries(
        CHORES.map((chore) => [chore, this.lack(dweller, chore)] as const),
      ) as Record<Chore, Lack | null>,
      slept: dweller.slept === null ? null : { ...dweller.slept },
    };
  }

  /** The door a climber could go in at now: the nearest within reach of where they stand, on
   * their feet and outside; none for one inside, off their feet or away from every door. */
  door(id: ClimberId): TentDoor | null {
    const { falling, dead } = this.ground.climber(id);
    if (falling || dead || this.inside.has(id)) {
      return null;
    }
    const at = this.ground.along(id);
    let nearest: TentDoor | null = null;
    for (const camp of this.camps) {
      for (const [tent, along] of camp.doors.entries()) {
        const away = Math.abs(along - at);
        if (
          away <= this.numbers.reach &&
          (nearest === null || away < Math.abs(nearest.along - at))
        ) {
          nearest = { camp: camp.id, tent, along };
        }
      }
    }
    return nearest;
  }

  /** In at the door they stand at, or out of the tent they're in. */
  private pass({ climber, go }: Extract<GameAction, { kind: "tent" }>): void {
    if (go === "out") {
      this.leave(climber);
      return;
    }
    const door = this.door(climber);
    if (door !== null) {
      this.inside.set(climber, {
        id: climber,
        camp: door.camp,
        tent: door.tent,
        task: null,
        slept: null,
      });
      this.ground.shelter(climber, true);
    }
  }

  private leave(id: ClimberId): void {
    if (this.inside.delete(id)) {
      this.ground.shelter(id, false);
    }
  }

  /** Whether someone inside is still there: on their feet, at their tent's door. */
  private stays(dweller: Dweller): boolean {
    const { falling, dead } = this.ground.climber(dweller.id);
    const door = this.campOf(dweller).doors[dweller.tent];
    return (
      !falling &&
      !dead &&
      door !== undefined &&
      Math.abs(this.ground.along(dweller.id) - door) <= this.numbers.reach
    );
  }

  /** Takes up a chore, if nothing it needs is missing, in place of the one in hand; or stops. */
  private take({ climber, chore }: Extract<GameAction, { kind: "chore" }>): void {
    const dweller = this.inside.get(climber);
    if (dweller === undefined) {
      return;
    }
    if (chore === "stop") {
      this.rest(dweller);
      return;
    }
    if (this.lack(dweller, chore) !== null) {
      return;
    }
    this.rest(dweller);
    const { melt, meal, nap } = this.numbers;
    if (chore === "cook") {
      const camp = this.campOf(dweller);
      camp.meals = camp.meals === null ? null : camp.meals - 1;
      this.flasks.pour(climber, -meal.water);
    }
    const whole =
      chore === "melt"
        ? melt.seconds
        : chore === "cook"
          ? meal.seconds
          : chore === "nap"
            ? nap
            : chore === "sleep"
              ? this.untilTheAlarm
              : 0;
    dweller.task = { kind: chore, whole, left: whole };
    if (chore === "nap" || chore === "sleep") {
      const now = this.clock.elapsed;
      dweller.slept = { from: now, to: now };
    }
  }

  /** The mountain's seconds from now to the alarm: a whole day's when it's ringing now. */
  private get untilTheAlarm(): number {
    const day = MountainClock.SECONDS_A_DAY;
    const until = this.numbers.wake - this.clock.timeOfDay;
    const ahead = until - Math.floor(until / day) * day;
    return ahead > Tents.SPENT ? ahead : day;
  }

  /** What a chore lacks to begin here, if anything. */
  private lack(dweller: Dweller, chore: Chore): Lack | null {
    const camp = this.campOf(dweller);
    const noGas = camp.gas !== null && camp.gas <= Tents.SPENT;
    if (chore === "melt") {
      return noGas ? "gas" : this.flasks.room(dweller.id) <= Tents.SPENT ? "room" : null;
    }
    if (chore === "cook") {
      if (camp.meals !== null && camp.meals < 1) {
        return "meals";
      }
      if (this.flasks.water(dweller.id) + Tents.SPENT < this.numbers.meal.water) {
        return "water";
      }
      return noGas ? "gas" : null;
    }
    return chore === "guitar" && !camp.guitar ? "guitar" : null;
  }

  /** A step of the chore in hand: the stove burns the camp's gas, and what's done is done. */
  private work(dweller: Dweller): void {
    const { task } = dweller;
    if (task === null || task.whole <= 0) {
      return;
    }
    const seconds = Math.min(this.clock.secondsAStep, task.left);
    if (task.kind === "melt" || task.kind === "cook") {
      const { melt, meal } = this.numbers;
      const gas = task.kind === "melt" ? melt.gas : meal.gas;
      if (!this.burn(dweller, (gas * seconds) / task.whole)) {
        dweller.task = null;
        return;
      }
    } else {
      this.sleeper.sleep(dweller.id);
    }
    task.left -= seconds;
    if (task.left <= Tents.SPENT) {
      this.finish(dweller, task.kind);
    }
  }

  /** Burns `grams` of the camp's gas: false when there wasn't that much, and the flame is out. */
  private burn(dweller: Dweller, grams: number): boolean {
    const camp = this.campOf(dweller);
    if (camp.gas === null) {
      return true;
    }
    const enough = camp.gas + Tents.SPENT >= grams;
    camp.gas = Math.max(0, camp.gas - grams);
    if (camp.gas <= Tents.SPENT) {
      camp.gas = 0;
    }
    return enough;
  }

  private finish(dweller: Dweller, chore: Chore): void {
    if (chore === "melt") {
      this.flasks.pour(dweller.id, this.numbers.melt.litres);
    } else if (chore === "cook") {
      this.sleeper.eat(dweller.id, this.numbers.meal.kcal);
    }
    this.rest(dweller);
  }

  /** Puts the chore in hand down: a sleeper wakes now. */
  private rest(dweller: Dweller): void {
    const { task, slept } = dweller;
    if (task !== null && (task.kind === "nap" || task.kind === "sleep") && slept !== null) {
      slept.to = this.clock.elapsed;
    }
    dweller.task = null;
  }

  /** Once every living player sleeps, the clock skips to the first of them to wake: everyone
   * asleep sleeps through it, and so do the climbers an agent steers. */
  private night(): void {
    const living = this.ground.climbers;
    const players = living.filter((id) => !this.npcs.includes(id));
    const sleepers: { dweller: Dweller; task: Task }[] = [];
    for (const dweller of this.inside.values()) {
      const { task } = dweller;
      if (task !== null && (task.kind === "nap" || task.kind === "sleep")) {
        sleepers.push({ dweller, task });
      }
    }
    const asleep = (id: ClimberId): boolean => sleepers.some(({ dweller }) => dweller.id === id);
    if (players.length === 0 || !players.every(asleep)) {
      return;
    }
    const skipped = Math.min(...sleepers.map(({ task }) => task.left));
    if (!(skipped > Tents.SPENT)) {
      return;
    }
    this.clock.skip(skipped);
    for (const { dweller, task } of sleepers) {
      this.sleeper.sleep(dweller.id);
      task.left -= skipped;
      if (task.left <= Tents.SPENT) {
        this.rest(dweller);
      }
    }
    for (const id of living) {
      if (this.npcs.includes(id)) {
        this.sleeper.sleep(id);
      }
    }
  }

  private campOf(dweller: Dweller): {
    id: string;
    doors: readonly number[];
    gas: number | null;
    meals: number | null;
    guitar: boolean;
  } {
    const camp = this.camps.find(({ id }) => id === dweller.camp);
    if (camp === undefined) {
      throw new RangeError(`${dweller.id} is in a tent of ${dweller.camp}, which isn't a camp`);
    }
    return camp;
  }
}
