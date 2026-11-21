/** A row of the satellite messenger's menu: start or stop tracking, send a check-in, ask for the
 * weather, and the forecast that came back. */
export type MessengerRow = "track" | "stop" | "check-in" | "weather" | "forecast";

/** What the messenger's screen shows: its menu, or the forecast a day at a time. */
export type MessengerScreen = "menu" | "forecast";

/**
 * The satellite messenger's menu (#284), worked by its buttons as a real one's is: up and down
 * move the bar through the rows, OK does what the row says, and back comes away from what OK
 * opened. On the forecast, up and down go from day to day. The rows are the tracker's as it is:
 * tracking or not, and the forecast once one has come. It holds only what the screen shows; what
 * a row does is the tracker's, in the climb.
 */
export class MessengerMenu {
  /** The forecast's last day, from the day it was issued. */
  private static readonly LAST_DAY = 2;

  private at = 0;
  private shown: MessengerScreen = "menu";
  private forecastDay = 0;

  /** The rows for a tracker that's `tracking` or not, with a `forecast` come back or none. */
  static rows(tracking: boolean, forecast: boolean): readonly MessengerRow[] {
    return [tracking ? "stop" : "track", "check-in", "weather", ...(forecast ? (["forecast"] as const) : [])];
  }

  get screen(): MessengerScreen {
    return this.shown;
  }

  /** The forecast's day on the screen, from the day it was issued. */
  get day(): number {
    return this.forecastDay;
  }

  /** Where the bar is among `rows`: on the last, if the rows have grown fewer. */
  picked(rows: readonly MessengerRow[]): number {
    return Math.min(this.at, rows.length - 1);
  }

  up(rows: readonly MessengerRow[]): void {
    this.step(rows, -1);
  }

  down(rows: readonly MessengerRow[]): void {
    this.step(rows, 1);
  }

  /** The bar onto the row a finger touched. */
  pick(row: number, rows: readonly MessengerRow[]): void {
    this.at = Math.max(0, Math.min(row, rows.length - 1));
  }

  /** OK: the row the bar is on, for the tracker to do, and the forecast opened if that's the
   * row; nothing on the forecast itself. */
  ok(rows: readonly MessengerRow[]): MessengerRow | null {
    if (this.shown === "forecast") {
      return null;
    }
    const row = rows[this.picked(rows)] ?? null;
    if (row === "forecast") {
      this.shown = "forecast";
      this.forecastDay = 0;
    }
    return row;
  }

  /** Back: from the forecast to the menu. */
  back(): void {
    this.shown = "menu";
  }

  /** Up and down: through the rows round and round, or from day to day of the forecast. */
  private step(rows: readonly MessengerRow[], by: 1 | -1): void {
    if (this.shown === "forecast") {
      this.forecastDay = Math.max(0, Math.min(MessengerMenu.LAST_DAY, this.forecastDay + by));
      return;
    }
    const next = this.picked(rows) + by;
    this.at = (next + rows.length) % rows.length;
  }
}
