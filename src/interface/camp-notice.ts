import type { ClimberId, MountainClock } from "../simulation";
import { Readings } from "./readings";
import type { Texts } from "./texts";

/** The section as the arrival needs it: its name in the texts, the camp it ends at and where that
 * camp's stretch begins along the ground, and the hours the sources give the section. */
export interface SectionEnd {
  readonly id: string;
  readonly destination: { readonly id: string; readonly from: number };
  readonly hours: { readonly min: number; readonly max: number };
}

/** The climbers as the arrival reads them: how far along the ground one is, and their altimeter.
 * The slope physics is this. */
export interface Arriving {
  along(climber: ClimberId): number;
  climber(climber: ClimberId): { readonly altitude: number };
}

/**
 * The arrival at the camp a section ends at (#26): once the player's climber reaches its stretch,
 * a notice over the slope names the camp, reads the altimeter and the clock, says how long the
 * section took and the hours the sources give it, and [Continue], or Esc, closes it. It shows once
 * each time the camp is reached; the climb goes on behind it, and the camp itself, with its rest
 * and its choices, comes with #53.
 */
export class CampNotice {
  private readonly notice: HTMLElement;
  private readonly title: HTMLElement;
  private readonly where: HTMLElement;
  private readonly took: HTMLElement;
  private readonly button: HTMLElement;
  private readonly readings = new Readings();
  /** Whether the climber was in the camp's stretch at the last look. */
  private inside = false;

  constructor(
    window: Window,
    private readonly texts: Texts,
    private readonly clock: MountainClock,
    private readonly climbers: Arriving,
    private readonly player: ClimberId,
    private readonly section: SectionEnd,
  ) {
    const { document } = window;
    this.notice = CampNotice.element(document, "");
    this.title = CampNotice.element(document, "#camp-title");
    this.where = CampNotice.element(document, '[data-text="where"]');
    this.took = CampNotice.element(document, '[data-text="took"]');
    this.button = CampNotice.element(document, "button");
    this.button.textContent = texts.say("continue");
    this.button.addEventListener("click", () => {
      this.close();
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && !this.notice.hidden) {
        this.close();
      }
    });
  }

  /** Each frame: the notice shows as the climber comes into the camp. */
  update(): void {
    const arrived = this.climbers.along(this.player) >= this.section.destination.from;
    if (arrived && !this.inside) {
      this.show();
    }
    this.inside = arrived;
  }

  private show(): void {
    const { texts, readings, clock, section } = this;
    const { altitude } = this.climbers.climber(this.player);
    const time = texts.say("duration", readings.duration(clock.elapsed));
    this.title.textContent = texts.say(section.destination.id);
    this.where.textContent = `${readings.altitude(altitude)} · ${readings.clock(clock.timeOfDay)}`;
    this.took.textContent = `${texts.say(section.id, { time })} ${texts.say("first-time", section.hours)}`;
    this.notice.hidden = false;
    this.button.focus();
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
