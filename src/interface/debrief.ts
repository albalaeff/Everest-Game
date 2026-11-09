import type { Fall, Kit, LogPage } from "../physics";
import type { ClimberId, Strike } from "../simulation";
import { Readings } from "./readings";
import type { DayWarmth } from "./sun-clock";
import type { Texts } from "./texts";

/** How a line of the debrief reads: well, a warning, or a mistake. */
export type Tone = "good" | "warn" | "bad" | "plain";

/** The debrief's words in content/debrief.json. */
export type DebriefTextName = keyof (typeof import("../../content/debrief.json"))["en"];

/** What the debrief reads of a climb: the player's page of the logbook, their falls, what came
 * down on the route, and what they checked of their kit before setting off (#196). */
export interface DebriefFacts {
  readonly page: LogPage;
  readonly falls: readonly Fall[];
  readonly strikes: readonly Strike[];
  readonly player: ClimberId;
  readonly kit: Kit;
}

/** The debrief said: whether the climber died, a verdict, and its lines. */
export interface DebriefSaid {
  readonly dead: boolean;
  readonly verdict: { readonly text: string; readonly tone: Tone };
  readonly lines: readonly {
    readonly label: string;
    readonly value: string;
    readonly tone: Tone;
  }[];
}

/**
 * The debrief (#194), after a climb: how long the climber was unclipped on the route, and how
 * long where a slip was a fall; how many times the rope caught them, and how many falls had no rope
 * to hold them; how long they were under the seracs and how long they stood still there; what came
 * down near them; and when they got out of the Icefall, before the sun or after it, or when and how
 * they died; the checks they skipped at Base Camp (#196); and how the training events went, a
 * serac collapse ahead and a ladder breaking under them (#209). Even a climber who made it sees how
 * lucky they were, and a death is traced back to the mistake it came from, a crampon they didn't
 * check too (docs/guidelines/usability.md → A consequence that comes late is traced back). Its
 * words are content/debrief.json's.
 */
export class Debrief {
  private static readonly HOUR = 3600;
  private readonly readings = new Readings();

  constructor(
    private readonly texts: Texts<DebriefTextName>,
    private readonly warmth: DayWarmth,
  ) {}

  /** The kit a climber checks, in the gear check's order, and its name in the debrief. */
  private static readonly KIT: readonly {
    readonly item: keyof Kit;
    readonly name: DebriefTextName;
  }[] = [
    { item: "crampons", name: "gear.crampons" },
    { item: "lamp", name: "gear.lamp" },
    { item: "water", name: "gear.water" },
  ];

  /** The debrief of a climb. */
  of({ page, falls, strikes, player, kit }: DebriefFacts): DebriefSaid {
    const caught = falls.filter((fall) => fall.held === true).length;
    const unroped = falls.filter((fall) => fall.held === false);
    const near = strikes.filter((strike) => strike.climbers.includes(player));
    const dead = page.died !== null;
    const lines: { label: string; value: string; tone: Tone }[] = [];
    const line = (label: DebriefTextName, value: string, tone: Tone): void => {
      lines.push({ label: this.texts.say(label), value, tone });
    };
    if (page.died !== null) {
      line("died-at", this.readings.clock(page.died), "bad");
    } else if (page.arrived !== null) {
      const beforeSun = page.arrived < this.warmth.from * Debrief.HOUR;
      const time = this.readings.clock(page.arrived);
      line(
        "out",
        this.texts.say(beforeSun ? "out.before-sun" : "out.in-sun", { time }),
        beforeSun ? "good" : "warn",
      );
    }
    line("unclipped", this.duration(page.unclipped), page.unclipped > 0 ? "warn" : "good");
    line("exposed", this.duration(page.exposed), page.exposed > 0 ? "bad" : "good");
    line("caught", this.texts.say("count", { count: caught }), caught > 0 ? "warn" : "plain");
    line(
      "unroped-falls",
      this.texts.say("count", { count: unroped.length }),
      unroped.length > 0 ? "bad" : "good",
    );
    line("under-seracs", this.duration(page.underSeracs), "plain");
    line("stopped", this.duration(page.stopped), page.stopped > 0 ? "bad" : "good");
    line(
      "near",
      this.texts.say("count", { count: near.length }),
      near.length > 0 ? "warn" : "plain",
    );
    const skipped = Debrief.KIT.filter(({ item }) => !kit[item]).map(({ name }) =>
      this.texts.say(name),
    );
    line(
      "gear",
      skipped.length === 0
        ? this.texts.say("gear.checked")
        : this.texts.say("gear.skipped", { items: skipped.join(", ") }),
      skipped.length === 0 ? "good" : "bad",
    );
    // The training events (#209), once they've happened to the player.
    const collapse = strikes.find(({ training }) => training === true);
    if (collapse !== undefined) {
      const caughtBy = collapse.climbers.includes(player);
      line(
        "training-serac",
        this.texts.say(caughtBy ? "training-serac.caught" : "training-serac.clear"),
        caughtBy ? "bad" : "good",
      );
    }
    const broke = falls.find(({ broke }) => broke === true);
    if (broke !== undefined) {
      const said =
        broke.held !== true
          ? "training-ladder.fell"
          : broke.pulled === true
            ? "training-ladder.pulled"
            : "training-ladder.held";
      line("training-ladder", this.texts.say(said), broke.held === true ? "good" : "bad");
    }
    return { dead, verdict: this.verdict(page, caught, unroped, strikes, player), lines };
  }

  /** What the climb comes to: the cause of a death, or how well the climber did. */
  private verdict(
    page: LogPage,
    caught: number,
    unroped: readonly Fall[],
    strikes: readonly Strike[],
    player: ClimberId,
  ): DebriefSaid["verdict"] {
    const { texts } = this;
    if (page.died !== null) {
      const struck = strikes.find((strike) => strike.killed.includes(player));
      if (struck !== undefined) {
        return { text: texts.say(`died.${struck.kind}`), tone: "bad" };
      }
      const worst = unroped.reduce<Fall | null>(
        (most, fall) => (most === null || fall.drop > most.drop ? fall : most),
        null,
      );
      const drop = Math.round(worst?.drop ?? 0);
      const cause =
        worst?.broke === true
          ? "died.ladder"
          : worst?.looseCrampon === true
            ? "died.fall-crampon"
            : "died.fall";
      return { text: texts.say(cause, { drop }), tone: "bad" };
    }
    if (page.exposed > 0) {
      return {
        text: texts.say("verdict.lucky", { time: this.duration(page.exposed) }),
        tone: "warn",
      };
    }
    if (page.arrived !== null && page.arrived >= this.warmth.from * Debrief.HOUR) {
      return { text: texts.say("verdict.late"), tone: "warn" };
    }
    if (caught > 0) {
      return { text: texts.say("verdict.saved", { count: caught }), tone: "good" };
    }
    return { text: texts.say("verdict.clean"), tone: "good" };
  }

  /** `seconds` of the mountain's time as the debrief writes it. */
  private duration(seconds: number): string {
    if (seconds <= 0) {
      return this.texts.say("none");
    }
    const { hours, minutes } = this.readings.duration(seconds);
    if (hours > 0) {
      return this.texts.say("hours", { hours, minutes });
    }
    return minutes > 0 ? this.texts.say("minutes", { minutes }) : this.texts.say("moment");
  }
}
