import type { Fall, Injury, Kit, LogPage } from "../physics";
import type { ClimberId, ColdView, MountainClock, Strike } from "../simulation";
import type { Debrief, DebriefTextName } from "./debrief";
import { Readings } from "./readings";
import type { Texts } from "./texts";

/** The section as the arrival needs it: its name in the texts, the camp it ends at and where that
 * camp's stretch begins along the ground, and the hours the sources give the section. */
export interface SectionEnd {
  readonly id: string;
  readonly destination: { readonly id: string; readonly from: number };
  readonly hours: { readonly min: number; readonly max: number };
}

/** The climbers as the arrival reads them: how far along the ground one is, their altimeter,
 * and whether they're dead, still falling, and their falls. The slope physics is this. */
export interface Arriving {
  along(climber: ClimberId): number;
  climber(climber: ClimberId): {
    readonly altitude: number;
    readonly dead: boolean;
    readonly falling: boolean;
    readonly falls: readonly Fall[];
    /** What they checked before setting off (#196). */
    readonly kit: Kit;
    /** What their hard landings left them (#241). */
    readonly injuries: readonly Injury[];
  };
}

/** The climbers' Sherpa as the arrival hears him (#212): his climber, his name, and his line at
 * the camp, none once he's dead. */
export interface ArrivingSherpa {
  readonly climber: ClimberId;
  readonly name: string;
  arrival(): string | null;
}

/** What the debrief reads of the climb besides the climbers: each one's page of the logbook, and
 * what came down on the route (#194). The logbook and the hazards are this. */
export interface ClimbRecord {
  page(climber: ClimberId): LogPage;
  readonly strikes: readonly Strike[];
  /** What the cold did to a climber (#272): none where the body feels no cold. */
  cold?(climber: ClimberId): ColdView | null;
}

/**
 * The end of the climb, over the slope: the arrival at the camp a section ends at (#26), and the
 * player's death on the way (#194). Once the player's climber reaches the camp's stretch, the
 * notice names the camp, reads the altimeter and the clock, says how long the section took and
 * the hours the sources give it; once they die, and their body has come to rest, it says so. Both
 * then give the debrief: its verdict and its lines, what the climb was (`Debrief`). [Continue], or
 * Esc, closes it, and the climb goes on behind it; after a death, [Start over] sets off a new one,
 * where there's one to set off. It shows once each time the camp is reached, and once on a death;
 * the camp itself, with its rest and its choices, comes with #53. On the arrival it opens with
 * the line of the climbers' Sherpa, if they have one and he's alive (#212). A player carried down
 * with a bone broken and set down in the camp they set off from is told so, once (#241): the
 * climb is over, evacuated, and the debrief says how it came to that.
 */
export class CampNotice {
  /** How long after a death the notice waits for the body to come to rest, at the most. */
  static readonly SETTLE_SECONDS = 3;

  private readonly notice: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sherpaSaid: HTMLElement;
  private readonly where: HTMLElement;
  private readonly took: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly button: HTMLElement;
  private readonly startOverButton: HTMLElement;
  private readonly readings = new Readings();
  /** Whether the climber was in the camp's stretch at the last look; how long they've been dead,
   * and whether the notice has said so. */
  private inside = false;
  private deadFor = 0;
  private mourned = false;
  private evacuated = false;

  constructor(
    window: Window,
    private readonly texts: Texts,
    private readonly clock: MountainClock,
    private readonly climbers: Arriving,
    private readonly player: ClimberId,
    private readonly section: SectionEnd,
    private readonly debrief: Debrief,
    private readonly record: ClimbRecord,
    private readonly debriefTexts: Texts<DebriefTextName>,
    private readonly startOver: (() => void) | null,
    private readonly sherpa: ArrivingSherpa | null = null,
  ) {
    const { document } = window;
    this.notice = CampNotice.element(document, "");
    this.title = CampNotice.element(document, "#camp-title");
    this.sherpaSaid = CampNotice.element(document, '[data-text="sherpa"]');
    this.where = CampNotice.element(document, '[data-text="where"]');
    this.took = CampNotice.element(document, '[data-text="took"]');
    this.verdict = CampNotice.element(document, '[data-text="verdict"]');
    this.lines = CampNotice.element(document, '[data-text="debrief"]');
    this.button = CampNotice.element(document, '[data-text="continue"]');
    this.startOverButton = CampNotice.element(document, '[data-text="start-over"]');
    this.button.textContent = texts.say("continue");
    this.startOverButton.textContent = debriefTexts.say("start-over");
    this.button.addEventListener("click", () => {
      this.close();
    });
    this.startOverButton.addEventListener("click", () => {
      this.startOver?.();
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && !this.notice.hidden) {
        this.close();
      }
    });
  }

  /** Each frame, `seconds` after the last: the notice shows as the climber comes into the camp,
   * and once they die, when their body has come to rest. */
  update(seconds = 0): void {
    const view = this.climbers.climber(this.player);
    if (view.dead) {
      this.deadFor += seconds;
      const settled = !view.falling || this.deadFor >= CampNotice.SETTLE_SECONDS;
      if (!this.mourned && settled) {
        this.mourned = true;
        this.showDeath();
      }
      return;
    }
    if (!this.evacuated && (this.record.page(this.player).evacuated ?? null) !== null) {
      this.evacuated = true;
      this.showEvacuation();
    }
    const arrived = this.climbers.along(this.player) >= this.section.destination.from;
    if (arrived && !this.inside) {
      this.show();
    }
    this.inside = arrived;
  }

  private show(): void {
    const { texts, readings, clock, section } = this;
    const { altitude } = this.climbers.climber(this.player);
    const time = texts.say("duration", readings.duration(clock.played));
    this.title.textContent = texts.say(section.destination.id);
    this.where.textContent = `${readings.altitude(altitude)} · ${readings.clock(clock.timeOfDay)}`;
    this.took.textContent = `${texts.say(section.id, { time })} ${texts.say("first-time", section.hours)}`;
    this.took.hidden = false;
    this.startOverButton.hidden = true;
    const said = this.sherpa?.arrival() ?? null;
    this.sherpaSaid.hidden = said === null;
    if (said !== null && this.sherpa !== null) {
      this.sherpaSaid.textContent = texts.say("sherpa-said", { name: this.sherpa.name, said });
    }
    this.say();
    this.notice.hidden = false;
    this.button.focus();
  }

  /** The player's death: where and when, and the debrief, with [Start over] where there is one. */
  private showDeath(): void {
    const { readings, clock } = this;
    const { altitude } = this.climbers.climber(this.player);
    this.title.textContent = this.debriefTexts.say("you-died");
    this.where.textContent = `${readings.altitude(altitude)} · ${readings.clock(clock.timeOfDay)}`;
    this.took.hidden = true;
    this.sherpaSaid.hidden = true;
    this.startOverButton.hidden = this.startOver === null;
    this.say();
    this.notice.hidden = false;
    (this.startOver === null ? this.button : this.startOverButton).focus();
  }

  /** The player set down in the camp they set off from, carried down hurt (#241): where and
   * when, and the debrief, with [Start over] where there is one. */
  private showEvacuation(): void {
    const { readings, clock } = this;
    const { altitude } = this.climbers.climber(this.player);
    this.title.textContent = this.debriefTexts.say("evacuated");
    this.where.textContent = `${readings.altitude(altitude)} · ${readings.clock(clock.timeOfDay)}`;
    this.took.hidden = true;
    this.sherpaSaid.hidden = true;
    this.startOverButton.hidden = this.startOver === null;
    this.say();
    this.notice.hidden = false;
    (this.startOver === null ? this.button : this.startOverButton).focus();
  }

  /** The debrief: its verdict, and a line for each thing it counts, each with its tone. */
  private say(): void {
    const { player, record } = this;
    const said = this.debrief.of({
      page: record.page(player),
      falls: this.climbers.climber(player).falls,
      strikes: record.strikes,
      player,
      kit: this.climbers.climber(player).kit,
      sherpa: this.sherpa?.climber ?? null,
      injuries: this.climbers.climber(player).injuries,
      cold: record.cold?.(player) ?? null,
    });
    this.verdict.textContent = said.verdict.text;
    this.verdict.dataset.tone = said.verdict.tone;
    this.lines.replaceChildren(
      ...said.lines.flatMap(({ label, value, tone }) => {
        const term = this.lines.ownerDocument.createElement("dt");
        const detail = this.lines.ownerDocument.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        detail.dataset.tone = tone;
        return [term, detail];
      }),
    );
  }

  private close(): void {
    this.notice.hidden = true;
  }

  private static element(document: Document, selector: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`#camp ${selector}`.trim());
    if (found === null) {
      throw new RangeError(`No #camp ${selector} on the page`);
    }
    return found;
  }
}
