import type { DeviceTextName } from "../../interface/device-texts";
import { Readings } from "../../interface/readings";
import type { Texts } from "../../interface/texts";
import type { DeviceReadings } from "../device-readings";
import { DeviceFace } from "./device-face";
import { MeterDrawing } from "./meter-drawing";
import { SegmentDigits } from "./segment-digits";

/** The meter's screens, in the order its right button steps through them: the wind as it is,
 * its strongest and its average since the meter was switched on, the air, and the wind chill. */
const SCREENS = ["wind", "max", "average", "air", "chill"] as const;
type MeterScreen = (typeof SCREENS)[number];

/**
 * The pocket weather meter on the card (#284), worked as the real one is (gear.wind-meter-layout):
 * one big number on its segment screen, with the screen's sign and its unit under it. ► steps on
 * through the wind, its strongest and its average, the air and the wind chill, ◄ back, each
 * screen's hint flashing first; ◐ lights it for 10 seconds, and held 3 seconds switches it off,
 * and on again with nothing averaged. The impeller turns with the wind. Its number settles on the
 * wind and flutters about it, jumps to a gust as one comes, and keeps its average and its
 * strongest since it was switched on. Beside it, the wind's name and the risk of frostbite in the
 * wind chill it reads.
 */
export class MeterFace extends DeviceFace {
  /** How fast the number settles, how long a gust shows after it came, how long a hint flashes,
   * and how long ◐ is held to switch the meter off; the light's seconds (gear.wind-meter-layout).
   * The screen's numbers, not the mountain's, but for the light. */
  private static readonly SETTLE = 2.5;
  private static readonly GUST_SECONDS = 2.5;
  private static readonly HINT_SECONDS = 0.9;
  private static readonly OFF_MILLISECONDS = 3000;
  private static readonly LIGHT_FOR = 10;
  /** What each screen's hint spells. */
  private static readonly HINTS: Readonly<Partial<Record<MeterScreen, string>>> = {
    wind: "SPd",
    air: "dEG",
    chill: "chiLL",
  };

  private readonly readings = new Readings();
  private readonly digits = new SegmentDigits(5, 10);
  private readonly number: HTMLElement;
  private screenShown: MeterScreen = "wind";
  private hint = 0;
  private on = true;
  /** The seconds it's been on, what it shows, the sum for its average and its strongest; the
   * gusts it has seen, and the seconds a gust still shows. */
  private wind = { seconds: 0, shown: 0, sum: 0, strongest: 0, gusts: 0, gusting: 0 };
  private drawn = "";

  constructor(
    face: HTMLElement,
    texts: Texts<DeviceTextName>,
    private readonly climb: DeviceReadings,
  ) {
    super("wind", face, new MeterDrawing(), texts, MeterFace.LIGHT_FOR);
    this.number = this.find(".meter__number");
    this.wind.gusts = climb.wind.gusts;
    this.holdLong("power", MeterFace.OFF_MILLISECONDS, () => {
      this.switchOff();
    });
    this.turnTo("wind");
  }

  /** The meter as it comes out of the pocket: on, at the wind, nothing averaged yet. */
  takeOut(): void {
    this.on = true;
    this.wind = { ...this.wind, seconds: 0, shown: 0, sum: 0, strongest: 0 };
    this.turnTo("wind");
    this.lightUp();
  }

  /** A gust that has just caught the climber still blows for a moment, whether or not the meter
   * is out: one that came before isn't blowing now. */
  feel(seconds: number): void {
    const { wind } = this;
    const { gusts } = this.climb.wind;
    wind.gusting = gusts > wind.gusts ? MeterFace.GUST_SECONDS : wind.gusting - seconds;
    wind.gusting = Math.max(0, wind.gusting);
    wind.gusts = gusts;
  }

  draw(seconds: number, daylight: number): void {
    this.light(seconds, daylight);
    this.hint = Math.max(0, this.hint - seconds);
    const { texts, wind, readings } = this;
    const now = this.climb.wind;
    const gusting = now.coming || wind.gusting > 0;
    const first = wind.seconds === 0;
    wind.seconds += seconds;
    const flutter =
      1 + 0.08 * Math.sin(wind.seconds * 1.9) + 0.05 * Math.sin(wind.seconds * 5.3 + 1);
    const aim = (gusting ? now.gust : now.steady) * flutter;
    wind.shown = first
      ? aim
      : wind.shown + (aim - wind.shown) * Math.min(1, seconds * MeterFace.SETTLE);
    wind.sum += wind.shown * seconds;
    wind.strongest = Math.max(wind.strongest, wind.shown);
    const unit = texts.say("wind.unit");
    const speed = Math.round(wind.shown);
    const average = Math.round(wind.seconds > 0 ? wind.sum / wind.seconds : wind.shown);
    const strongest = Math.round(wind.strongest);
    // The air where the climber stands, to a tenth of a degree as a pocket meter reads it
    // (gear.wind-meter-readings), and the wind chill it works out from the wind it shows, in
    // whole degrees as the index is given, with Canada's risk of frostbite: red from a high one,
    // when bare skin can freeze within the half hour.
    const air = this.climb.air;
    const chill = this.climb.chill(wind.shown);
    this.set("now", String(speed));
    this.set("average", `${average} ${unit}`);
    this.set("strongest", `${strongest} ${unit}`);
    this.set("air", readings.temperature(air, 1));
    this.set("chill", readings.temperature(chill.chill));
    this.set(
      "name",
      gusting ? texts.say("wind.gust") : texts.say(`wind.name.${this.climb.named(wind.shown)}`),
    );
    this.set("risk", texts.say(`wind.risk.${chill.risk}`, chill.freezes ?? {}));
    DeviceFace.mark(this.find(".meter__risk"), "warn", chill.freezes === null ? "no" : "yes");
    DeviceFace.mark(this.face, "gust", gusting ? "yes" : "no");
    DeviceFace.mark(this.screen, "on", this.on ? "yes" : "no");
    const figures: Readonly<Record<MeterScreen, string>> = {
      wind: String(speed),
      max: String(strongest),
      average: String(average),
      air: MeterFace.figures(air, 1),
      chill: MeterFace.figures(chill.chill, 0),
    };
    const hint = MeterFace.HINTS[this.screenShown];
    const shown = !this.on ? " " : this.hint > 0 && hint !== undefined ? hint : figures[this.screenShown];
    if (shown !== this.drawn) {
      this.drawn = shown;
      this.number.innerHTML = this.digits.svg(shown);
    }
    // The impeller turns with the wind: a turn in a quarter of a second in a gale, still in none.
    const turn = speed < 1 ? "0s" : `${Math.min(3, Math.max(0.12, 14 / speed)).toFixed(2)}s`;
    if (this.body.style.getPropertyValue("--turn") !== turn) {
      this.body.style.setProperty("--turn", turn);
    }
  }

  protected pressed(name: string): void {
    if (name === "power") {
      if (!this.on) {
        this.takeOut();
      }
      return;
    }
    if (!this.on) {
      this.dark();
      return;
    }
    const at = SCREENS.indexOf(this.screenShown) + (name === "right" ? 1 : -1);
    this.turnTo(SCREENS[(at + SCREENS.length) % SCREENS.length] ?? "wind");
  }

  private turnTo(screen: MeterScreen): void {
    this.screenShown = screen;
    this.hint = MeterFace.HINTS[screen] === undefined ? 0 : MeterFace.HINT_SECONDS;
    DeviceFace.mark(this.screen, "screen", screen);
  }

  /** ◐ held: the screen goes blank and its light out. */
  private switchOff(): void {
    this.on = false;
    this.dark();
  }

  /** A reading as the segment screen writes it: a true minus, to `places` decimal places, and
   * no minus for a nought. */
  private static figures(value: number, places: number): string {
    const scale = 10 ** places;
    const rounded = Math.round(value * scale) / scale;
    const digits = Math.abs(rounded).toFixed(places);
    return `${rounded < 0 ? "−" : ""}${digits}`;
  }
}
