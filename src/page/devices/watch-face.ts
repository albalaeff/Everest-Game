import type { BaseCamp } from "../../interface/base-camp";
import type { DeviceTextName } from "../../interface/device-texts";
import type { GpsFix } from "../../interface/gps-watch";
import { Readings } from "../../interface/readings";
import type { Texts } from "../../interface/texts";
import type { DeviceReadings } from "../device-readings";
import type { DevicesRoute } from "../devices-panel";
import { DeviceFace } from "./device-face";
import { WatchDrawing } from "./watch-drawing";

/** The watch's pages, in the order its up and down buttons turn them. */
const PAGES = ["altitude", "map", "arrival", "time"] as const;
type WatchPage = (typeof PAGES)[number];

/** The last fix the watch took, with the altitude and the place it was taken at. */
interface LastFix {
  readonly reading: GpsFix;
  readonly altitude: number;
  readonly x: number;
  readonly y: number;
  readonly along: number;
}

/**
 * The GPS watch on the card (#284), as an outdoor watch is worn and read: its round screen shows a
 * page at a time, and its five buttons work as the real one's (gear.watch-buttons). Up and down
 * turn the pages: the altitude with the rate of climb and what's still to climb; the route's
 * profile with the track and the dot, the distance done and what's left to Camp 1; the arrival
 * there at the pace so far, against the sun; the time of day with the activity's time and the
 * sun's hour. Light lights the screen, back goes to the first page, and start pauses the
 * activity and starts it again: paused, the watch records no time, no distance and no track, as
 * a real one doesn't. It takes a fix where it sees the sky, twice a second on the wrist and every
 * frame while it's looked at: the last one is what it shows under the ice.
 */
export class WatchFace extends DeviceFace {
  /** The map's box, in its own units, and the seconds between two fixes on the wrist. */
  private static readonly MAP = { left: 8, right: 192, top: 6, bottom: 46 };
  private static readonly FIX_SECONDS = 0.5;
  private static readonly SECONDS_AN_HOUR = 3600;

  private readonly readings = new Readings();
  private readonly onMap: (x: number, y: number) => readonly [number, number];
  private page: WatchPage = "altitude";
  private fix: LastFix | null = null;
  private nextFix = 0;
  /** The activity: what was left out while it was paused, its seconds and its metres; when it
   * was paused, if it is, and how far it had come then; and the stretches of the route it
   * recorded, as shares of the ground, the last still growing. */
  private skipped = { seconds: 0, metres: 0 };
  private pausedAt: {
    readonly elapsed: number;
    readonly done: number;
    readonly along: number;
  } | null = null;
  private recorded: { readonly from: number; to: number }[] = [{ from: 0, to: 0 }];

  constructor(
    face: HTMLElement,
    texts: Texts<DeviceTextName>,
    private readonly climb: DeviceReadings,
    private readonly baseCamp: BaseCamp,
    private readonly route: DevicesRoute,
  ) {
    super("gps", face, new WatchDrawing(), texts);
    this.onMap = this.mapOf(route.profile);
    const camp = texts.say(`camp.${route.camp}`);
    this.set("left-label", texts.say("gps.left", { camp }));
    this.set("arrival-label", texts.say("gps.arrival", { camp }));
    this.find(".watch__route").setAttribute("d", this.pathOf(route.profile));
    this.find(".watch__track").setAttribute("d", this.pathOf(route.profile));
    this.turnTo("altitude");
  }

  /** The watch takes a fix where it sees the sky: twice a second on the wrist, and every frame
   * while it's `looked` at. */
  locate(seconds: number, looked: boolean): void {
    this.nextFix -= seconds;
    if (this.nextFix > 0 && !looked) {
      return;
    }
    this.nextFix = WatchFace.FIX_SECONDS;
    const reading = this.climb.gps;
    if (reading.fix) {
      this.fix = { reading, altitude: this.climb.altitude, ...this.climb.spot };
    }
  }

  draw(seconds: number, daylight: number): void {
    this.light(seconds, daylight);
    const { texts, readings, baseCamp } = this;
    const seen = this.climb.gps.fix;
    DeviceFace.mark(this.screen, "fix", seen ? "yes" : "no");
    DeviceFace.mark(this.screen, "paused", this.pausedAt === null ? "no" : "yes");
    this.set("time", readings.clock(this.climb.timeOfDay));
    this.set("timer", this.timer());
    if (this.fix === null) {
      this.set("where", texts.say("gps.no-fix"));
      return;
    }
    const { reading: fix, altitude, x, y, along } = this.fix;
    // No sky: the screen keeps the last fix, and says so.
    this.set(
      "where",
      seen
        ? texts.say("gps.where", { part: texts.say(`part.${fix.part}`) })
        : texts.say("gps.no-fix"),
    );
    this.set("altitude", readings.altitude(altitude));
    this.set("to-climb", texts.say("gps.metres", { metres: Math.round(fix.toClimb) }));
    this.set("done", baseCamp.distance(this.done(fix)));
    this.set("left", baseCamp.distance(fix.left));
    this.set(
      "rate",
      fix.rate === null
        ? texts.say("gps.none")
        : texts.say("gps.rate-value", { rate: Math.round(fix.rate) }),
    );
    this.set(
      "arrival",
      fix.arrival === null ? texts.say("gps.none") : readings.clock(WatchFace.day(fix.arrival)),
    );
    this.drawSun(fix);
    const [left, top] = this.onMap(x, y);
    const dot = this.find(".watch__dot");
    dot.setAttribute("cx", left.toFixed(1));
    dot.setAttribute("cy", top.toFixed(1));
    this.drawTrack(Math.min(1, Math.max(0, along / this.route.ground)));
  }

  protected pressed(name: string): void {
    const at = PAGES.indexOf(this.page);
    if (name === "up" || name === "down") {
      const next = at + (name === "down" ? 1 : -1);
      this.turnTo(PAGES[(next + PAGES.length) % PAGES.length] ?? "altitude");
    } else if (name === "back") {
      this.turnTo("altitude");
    } else if (name === "start") {
      this.pauseOrGo();
    }
  }

  private turnTo(page: WatchPage): void {
    this.page = page;
    DeviceFace.mark(this.screen, "page", page);
    for (const shown of this.screen.querySelectorAll<HTMLElement>(".watch__page")) {
      shown.hidden = shown.dataset.page !== page;
    }
  }

  /** Start: pauses the activity, or starts it again where the climber is now. */
  private pauseOrGo(): void {
    const fix = this.fix;
    const elapsed = this.climb.elapsed;
    const along = fix === null ? 0 : Math.min(1, Math.max(0, fix.along / this.route.ground));
    const done = fix?.reading.done ?? 0;
    if (this.pausedAt === null) {
      this.pausedAt = { elapsed, done, along };
      return;
    }
    const paused = this.pausedAt;
    this.skipped = {
      seconds: this.skipped.seconds + Math.max(0, elapsed - paused.elapsed),
      metres: this.skipped.metres + Math.max(0, done - paused.done),
    };
    this.recorded.push({ from: along, to: along });
    this.pausedAt = null;
  }

  /** The distance the activity recorded: all of the route's but what was walked while it was
   * paused, and nothing more while it is. */
  private done(fix: GpsFix): number {
    const done = this.pausedAt === null ? fix.done : this.pausedAt.done;
    return Math.max(0, done - this.skipped.metres);
  }

  /** The activity's time: the climb's since it set off, but for the pauses. */
  private timer(): string {
    const now = this.pausedAt?.elapsed ?? this.climb.elapsed;
    const seconds = Math.max(0, Math.floor(now - this.skipped.seconds));
    const hours = Math.floor(seconds / WatchFace.SECONDS_AN_HOUR);
    const minutes = Math.floor((seconds % WatchFace.SECONDS_AN_HOUR) / 60);
    const rest = seconds % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  /** The track the activity recorded on the map: a stretch for each time it ran, the last
   * reaching the climber while it runs. */
  private drawTrack(along: number): void {
    const last = this.recorded.at(-1);
    if (this.pausedAt === null && last !== undefined) {
      last.to = Math.max(last.from, along);
    }
    const dashes: number[] = [];
    let at = 0;
    for (const { from, to } of this.recorded) {
      dashes.push(Math.max(0, from - at), Math.max(0, to - from));
      at = to;
    }
    const pattern = `0 ${dashes.map((dash) => dash.toFixed(4)).join(" ")} 1`;
    const track = this.find(".watch__track");
    if (track.style.strokeDasharray !== pattern) {
      track.style.strokeDasharray = pattern;
    }
  }

  /** When the sun comes onto the ice, and whether the pace so far gets the climber to the top
   * before it: what they race through the Icefall (route.icefall-lessons). */
  private drawSun(fix: GpsFix): void {
    const { texts, readings } = this;
    const sun = this.climb.sun;
    const verdict = this.find("[data-read='verdict']");
    if (sun.state !== "cold") {
      this.set("sun", texts.say("gps.sun-on"));
      verdict.hidden = true;
      return;
    }
    const { timeOfDay } = this.climb;
    const until = WatchFace.day(this.route.sunrise - timeOfDay);
    this.set("sun", readings.clock(this.route.sunrise));
    verdict.hidden = fix.arrival === null;
    if (fix.arrival === null) {
      return;
    }
    const after = fix.arrival - (timeOfDay + until);
    const { hours, minutes } = readings.duration(Math.abs(after));
    const fills = { hours, minutes: String(minutes).padStart(2, "0") };
    DeviceFace.mark(verdict, "late", after > 0 ? "yes" : "no");
    DeviceFace.write(verdict, texts.say(after > 0 ? "gps.late" : "gps.early", fills));
  }

  /** The route's ground as a path on the watch's map. */
  private pathOf(profile: readonly (readonly number[])[]): string {
    return profile
      .map(([x = 0, y = 0], index) => {
        const [left, top] = this.onMap(x, y);
        return `${index === 0 ? "M" : "L"}${left.toFixed(1)} ${top.toFixed(1)}`;
      })
      .join("");
  }

  /** Where a point of the slope is on the watch's map: the route fills its box, foot to top. */
  private mapOf(
    profile: readonly (readonly number[])[],
  ): (x: number, y: number) => readonly [number, number] {
    const xs = profile.map(([x = 0]) => x);
    const ys = profile.map(([, y = 0]) => y);
    const [west, east] = [Math.min(...xs), Math.max(...xs)];
    const [low, high] = [Math.min(...ys), Math.max(...ys)];
    const { left, right, top, bottom } = WatchFace.MAP;
    return (x, y) => [
      left + ((x - west) / (east - west || 1)) * (right - left),
      bottom - ((y - low) / (high - low || 1)) * (bottom - top),
    ];
  }

  /** A time of day within the day: an arrival past midnight is the next day's hour. */
  private static day(seconds: number): number {
    const day = 24 * WatchFace.SECONDS_AN_HOUR;
    return ((seconds % day) + day) % day;
  }
}
