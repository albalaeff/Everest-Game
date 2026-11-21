import type { ActionSink } from "../../input/player-action";
import type { DeviceTextName } from "../../interface/device-texts";
import { Readings } from "../../interface/readings";
import type { Texts } from "../../interface/texts";
import type { ClimberId } from "../../simulation";
import type { DeviceReadings } from "../device-readings";
import { TrackerForecast } from "../tracker-forecast";
import { DeviceFace } from "./device-face";
import { MessengerDrawing } from "./messenger-drawing";
import { MessengerMenu } from "./messenger-menu";
import type { MessengerRow } from "./messenger-menu";

/**
 * The satellite messenger on the card (#284), worked by its buttons as the real one is
 * (gear.messenger-layout): its screen has the battery, the sky and the time along its top, whether
 * it's tracking, and its menu, to start or stop tracking, send a check-in or ask for the weather,
 * with the forecast once one has come; ▲ and ▼ move the bar, OK does the row, back comes away
 * from the forecast, and a finger on a row does it too. The SOS is under its cap, held 3 seconds,
 * as the screen counts down. Each row is an action of the game's, so a room and a replay see it;
 * beside it, what the tracker has sent so far.
 */
export class MessengerFace extends DeviceFace {
  /** How long the SOS is held: the game's rule, the screen's number. */
  private static readonly SOS_MILLISECONDS = 3000;

  /** Each row's words but the forecast's. */
  private static readonly LABELS: Readonly<Record<Exclude<MessengerRow, "forecast">, DeviceTextName>> =
    {
      track: "tracker.track",
      stop: "tracker.stop",
      "check-in": "tracker.check-in",
      weather: "tracker.weather",
    };

  private readonly readings = new Readings();
  private readonly menu = new MessengerMenu();
  private readonly list: HTMLElement;
  private readonly forecast: TrackerForecast;
  private rows: readonly MessengerRow[] = [];
  private drawnRows = "";

  constructor(
    face: HTMLElement,
    texts: Texts<DeviceTextName>,
    private readonly climb: DeviceReadings,
    private readonly sink: ActionSink,
    private readonly player: ClimberId,
    private readonly minutes: number,
  ) {
    super("tracker", face, new MessengerDrawing(), texts);
    this.list = this.find(".messenger__menu");
    this.forecast = new TrackerForecast(
      face.ownerDocument,
      this.find(".messenger__forecast"),
      texts,
    );
    this.holdLong("sos", MessengerFace.SOS_MILLISECONDS, () => {
      this.work("sos");
    });
  }

  draw(seconds: number, daylight: number): void {
    this.light(seconds, daylight);
    const { texts, readings } = this;
    const tracker = this.climb.tracker;
    const flat = tracker.charge <= 0;
    const fetched = this.climb.fetched;
    this.rows = MessengerMenu.rows(tracker.tracking, fetched !== null);
    DeviceFace.mark(this.screen, "tracking", tracker.tracking ? "yes" : "no");
    DeviceFace.mark(this.screen, "sky", tracker.sky ? "yes" : "no");
    DeviceFace.mark(this.screen, "shows", this.menu.screen);
    this.set("time", readings.clock(this.climb.timeOfDay));
    this.set("battery", texts.say("tracker.percent", { percent: Math.ceil(tracker.charge * 100) }));
    this.set(
      "state",
      flat
        ? texts.say("tracker.flat")
        : tracker.tracking
          ? texts.say("tracker.on", { minutes: this.minutes })
          : texts.say("tracker.off"),
    );
    this.set("points", String(tracker.points));
    this.set("last", tracker.last === null ? texts.say("gps.none") : readings.clock(tracker.last));
    this.set("check-ins", String(tracker.checkIns));
    this.set(
      "status",
      !tracker.sky
        ? texts.say("tracker.no-sky")
        : tracker.sos === "sending"
          ? texts.say("tracker.sos-sending")
          : tracker.sos === "sent"
            ? texts.say("tracker.sos-sent")
            : tracker.weather.asking
              ? texts.say("tracker.weather-asking")
              : tracker.sending > 0
                ? texts.say("tracker.sending")
                : tracker.weather.coming
                  ? texts.say("tracker.weather-coming")
                  : "",
    );
    DeviceFace.mark(this.find("[data-read='status']"), "sos", tracker.sos === "none" ? "no" : "yes");
    this.drawRows(flat);
    const sos = this.control("sos");
    const sosOff = flat || tracker.sos !== "none";
    if (sos.disabled !== sosOff) {
      sos.disabled = sosOff;
    }
    this.forecast.draw(fetched, tracker.weather.arrived?.issued ?? null, this.menu.day);
  }

  protected pressed(name: string): void {
    const { menu, rows } = this;
    if (name === "up") {
      menu.up(rows);
    } else if (name === "down") {
      menu.down(rows);
    } else if (name === "ok") {
      this.act(menu.ok(rows));
    } else if (name === "back") {
      menu.back();
    }
  }

  /** The menu's rows, a button each, the bar on the one picked: drawn again as they change. */
  private drawRows(flat: boolean): void {
    const { texts, rows } = this;
    const { weather } = this.climb.tracker;
    const picked = this.menu.picked(rows);
    const issued = weather.arrived?.issued ?? null;
    const key = `${rows.join()}:${String(issued)}`;
    if (key !== this.drawnRows) {
      this.drawnRows = key;
      const document = this.face.ownerDocument;
      this.list.replaceChildren(
        ...rows.map((row, index) => {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "messenger__row";
          button.dataset.row = row;
          button.textContent =
            row === "forecast"
              ? texts.say("tracker.forecast-row", {
                  time: this.readings.clock(MessengerFace.day(issued ?? 0)),
                })
              : texts.say(MessengerFace.LABELS[row]);
          button.addEventListener("click", () => {
            this.lightUp();
            this.menu.pick(index, this.rows);
            this.act(this.menu.ok(this.rows));
          });
          item.append(button);
          return item;
        }),
      );
    }
    for (const [index, button] of [...this.list.querySelectorAll<HTMLButtonElement>("button")].entries()) {
      const off = flat || (button.dataset.row === "weather" && (weather.asking || weather.coming));
      if (button.disabled !== off) {
        button.disabled = off;
      }
      const current = String(index === picked);
      if (button.getAttribute("aria-current") !== current) {
        button.setAttribute("aria-current", current);
      }
    }
  }

  /** What OK does on a row: the tracker's own, or the forecast opened. */
  private act(row: MessengerRow | null): void {
    if (row === "track" || row === "stop" || row === "check-in" || row === "weather") {
      this.work(row);
    }
  }

  private work(what: "track" | "stop" | "check-in" | "weather" | "sos"): void {
    this.sink.send({ kind: "tracker", climber: this.player, do: what });
  }

  /** A time of the mountain's clock within its day. */
  private static day(seconds: number): number {
    const day = 24 * 60 * 60;
    return ((seconds % day) + day) % day;
  }
}
