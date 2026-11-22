import type { DeviceTextName, ForecastDayIndex, ForecastPart } from "../interface/device-texts";
import { Readings } from "../interface/readings";
import type { Texts } from "../interface/texts";
import type { ForecastDay } from "../simulation";

/**
 * The forecast on the satellite messenger's screen (#272, #284): what the general model said when
 * the request reached it, a day at a time as the messenger's up and down turn them, the day and
 * the time it was issued at above, and the day's six hours under it, each with a sky's mark, the
 * air and the wind, and a dash for those already past. It draws again only when what it shows
 * changes; it holds nothing the climb doesn't.
 */
export class TrackerForecast {
  private static readonly DAY = 24 * 60 * 60;
  private static readonly PARTS: readonly ForecastPart[] = [0, 1, 2, 3];
  private static readonly SIX_HOURS = 6 * 60 * 60;
  private readonly readings = new Readings();
  /** What it shows: the forecast's issue, its days and the day on the screen, or none. */
  private shown: string | null = null;

  constructor(
    private readonly document: Document,
    private readonly box: HTMLElement,
    private readonly texts: Texts<DeviceTextName>,
  ) {}

  /** Shows day `day` of the forecast issued at `issued`, the mountain's seconds since the first
   * day's midnight, or nothing while none has come. */
  draw(days: readonly ForecastDay[] | null, issued: number | null, day: number): void {
    const key =
      days === null || issued === null ? "none" : `${issued}:${day}:${JSON.stringify(days)}`;
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    const shown = days?.[day];
    const table = this.box.querySelector("table");
    const heading = this.box.querySelector("[data-read='forecast-of']");
    if (days === null || issued === null || shown === undefined) {
      table?.replaceChildren();
      if (heading !== null) {
        heading.textContent = "";
      }
      return;
    }
    const { texts, readings } = this;
    const time = readings.clock(
      issued - Math.floor(issued / TrackerForecast.DAY) * TrackerForecast.DAY,
    );
    if (heading !== null) {
      heading.textContent = texts.say("tracker.weather-of", {
        day: texts.say(`forecast.day.${Math.min(shown.day, 2) as ForecastDayIndex}`),
        time,
      });
    }
    table?.replaceChildren(...TrackerForecast.PARTS.map((part) => this.row(shown, part)));
  }

  /** Six hours of the day: a sky's mark, its air and its wind, or a dash for those already
   * past. */
  private row(day: ForecastDay, part: ForecastPart): HTMLTableRowElement {
    const { document, texts } = this;
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = texts.say(`forecast.part.${part}`);
    row.append(label);
    const period = day.periods.find(
      ({ from }) => Math.floor(from / TrackerForecast.SIX_HOURS) % 4 === part,
    );
    if (period === undefined) {
      const past = document.createElement("td");
      past.colSpan = 3;
      past.textContent = "—";
      row.append(past);
      return row;
    }
    const sky = document.createElement("td");
    const mark = document.createElement("i");
    mark.dataset.sky = period.sky;
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", texts.say(`forecast.sky.${period.sky}`));
    sky.append(mark);
    const air = document.createElement("td");
    air.textContent = texts.say("tracker.weather-air", { air: Math.round(period.air) });
    const wind = document.createElement("td");
    wind.textContent = texts.say("tracker.weather-wind", { wind: Math.round(period.wind) });
    row.append(sky, air, wind);
    return row;
  }
}
