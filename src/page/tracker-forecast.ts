import type { DeviceTextName, ForecastDayIndex, ForecastPart } from "../interface/device-texts";
import { Readings } from "../interface/readings";
import type { Texts } from "../interface/texts";
import type { ForecastDay } from "../simulation";

/**
 * The forecast on the satellite tracker's screen (#272): what the general model said when the
 * request reached it, three days in six hours each, the time it was issued at above, a sky's mark
 * over the air and the wind in each six hours, and a dash for those already past. It draws again
 * only when another forecast comes; it holds nothing the climb doesn't.
 */
export class TrackerForecast {
  private static readonly DAY = 24 * 60 * 60;
  private static readonly PARTS: readonly ForecastPart[] = [0, 1, 2, 3];
  private static readonly SIX_HOURS = 6 * 60 * 60;
  private readonly readings = new Readings();
  /** What it shows: the forecast's issue and its days, or none. */
  private shown: string | null = null;

  constructor(
    private readonly document: Document,
    private readonly box: HTMLElement,
    private readonly texts: Texts<DeviceTextName>,
  ) {}

  /** Shows the forecast issued at `issued`, the mountain's seconds since the first day's
   * midnight, or hides the screen while none has come. */
  draw(days: readonly ForecastDay[] | null, issued: number | null): void {
    const key = days === null || issued === null ? "none" : `${issued}:${JSON.stringify(days)}`;
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    this.box.hidden = days === null || issued === null;
    if (days === null || issued === null) {
      return;
    }
    const { texts, readings } = this;
    const time = readings.clock(
      issued - Math.floor(issued / TrackerForecast.DAY) * TrackerForecast.DAY,
    );
    const heading = this.box.querySelector("[data-read='forecast-of']");
    if (heading !== null) {
      heading.textContent = texts.say("tracker.weather-of", { time });
    }
    const table = this.box.querySelector("table");
    table?.replaceChildren(this.head(), ...days.map((day) => this.row(day)));
  }

  /** The six hours of a day, across the top. */
  private head(): HTMLTableRowElement {
    const row = this.document.createElement("tr");
    row.append(this.document.createElement("th"));
    for (const part of TrackerForecast.PARTS) {
      const cell = this.document.createElement("th");
      cell.scope = "col";
      cell.textContent = this.texts.say(`forecast.part.${part}`);
      row.append(cell);
    }
    return row;
  }

  /** A day's six hours: a sky's mark, its air and its wind, or a dash for one already past. */
  private row(day: ForecastDay): HTMLTableRowElement {
    const { document, texts } = this;
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = texts.say(`forecast.day.${Math.min(day.day, 2) as ForecastDayIndex}`);
    row.append(label);
    for (const part of TrackerForecast.PARTS) {
      const cell = document.createElement("td");
      const period = day.periods.find(
        ({ from }) => Math.floor(from / TrackerForecast.SIX_HOURS) % 4 === part,
      );
      if (period === undefined) {
        cell.textContent = "—";
      } else {
        const sky = document.createElement("i");
        sky.dataset.sky = period.sky;
        sky.setAttribute("role", "img");
        sky.setAttribute("aria-label", texts.say(`forecast.sky.${period.sky}`));
        const air = document.createElement("span");
        air.textContent = texts.say("tracker.weather-air", { air: Math.round(period.air) });
        const wind = document.createElement("span");
        wind.textContent = texts.say("tracker.weather-wind", { wind: Math.round(period.wind) });
        cell.append(sky, air, document.createElement("br"), wind);
      }
      row.append(cell);
    }
    return row;
  }
}
