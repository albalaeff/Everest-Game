import { Readings } from "../interface/readings";
import type { SunClock } from "../interface/sun-clock";
import type { BodyView, ClimberId, MountainClock, OxygenSystem, OxygenView } from "../simulation";
import type { Body } from "../simulation/body/body";
import type { SlopePhysics } from "../physics";

/** The player's glanceable instruments and the self-check sheet. */
export class ClimbInterface {
  private readonly readings = new Readings();
  private readonly readouts: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly altitude: HTMLElement;
  private readonly pressure: HTMLElement;
  private readonly flow: HTMLElement;
  /** The sun clock's readout, and its box, which its state colours (#194). */
  private readonly sun: HTMLElement;
  private readonly sunBox: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly checkButton: HTMLElement;
  private readonly symptoms: HTMLElement;
  private readonly oximeter: HTMLElement;
  private readonly fingers: HTMLElement;

  constructor(
    window: Window,
    private readonly mountainClock: MountainClock,
    private readonly body: Body,
    private readonly oxygen: OxygenSystem,
    private readonly physics: SlopePhysics,
    private readonly player: ClimberId,
    private readonly sunClock: SunClock,
  ) {
    const document = window.document;
    this.readouts = this.required(document, "#readouts");
    this.clock = this.required(document, "#readout-clock");
    this.altitude = this.required(document, "#readout-altitude");
    this.pressure = this.required(document, "#readout-pressure");
    this.flow = this.required(document, "#oxygen-flow");
    this.sun = this.required(document, "#readout-sun");
    this.sunBox = this.required(document, "#readout-sun-box");
    this.panel = this.required(document, "#self-check");
    this.checkButton = this.required(document, "[data-control='check-self']");
    this.symptoms = this.required(document, "#self-check-symptoms");
    this.oximeter = this.required(document, "#self-check-oximeter");
    this.fingers = this.required(document, "#self-check-fingers");
    this.checkButton.addEventListener("click", () => this.toggle());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Tab") {
        event.preventDefault();
        this.toggle();
      } else if (event.code === "Escape" && !this.panel.hidden) {
        this.close();
      }
    });
    this.panel.querySelector("button")?.addEventListener("click", () => this.close());
    this.readouts.hidden = false;
  }

  update(): void {
    const { altitude } = this.physics.climber(this.player);
    const view = this.body.climber(this.player);
    const oxygen = this.oxygen.climber(this.player);
    this.clock.textContent = this.readings.clock(this.mountainClock.timeOfDay);
    this.altitude.textContent = this.readings.altitude(altitude);
    this.updateOxygen(oxygen);
    this.updateSelfCheck(view);
    this.updateSun();
  }

  /** When the sun comes onto the ice, or that it's on it: the HUD's own words, as its labels'. */
  private updateSun(): void {
    const reading = this.sunClock.at(this.mountainClock.timeOfDay);
    const minutes = reading.state === "cold" ? String(reading.minutes).padStart(2, "0") : "";
    const [text, short] =
      reading.state === "cold"
        ? [`in ${reading.hours} h ${minutes} min`, `${reading.hours} h ${minutes}`]
        : reading.state === "warming"
          ? ["Now · warming", "warming"]
          : ["Now · warm", "warm"];
    if (this.sun.textContent !== text) {
      this.sun.textContent = text;
      this.clock.dataset.sun = `Sun ${short}`;
      this.clock.dataset.sunState = reading.state;
    }
    if (this.sunBox.dataset.state !== reading.state) {
      this.sunBox.dataset.state = reading.state;
    }
  }

  private updateOxygen(oxygen: OxygenView): void {
    this.pressure.textContent =
      oxygen.bottles === 0 ? "None carried" : `${oxygen.pressure} bar · ${oxygen.bottles} bottles`;
    this.flow.textContent = `${oxygen.flow} L/min`;
  }

  private updateSelfCheck(view: BodyView): void {
    this.symptoms.textContent =
      view.symptoms.length === 0
        ? "No symptoms"
        : view.symptoms.map((symptom) => symptom.replaceAll("-", " ")).join(", ");
    this.oximeter.textContent = `${view.oximeter}%`;
    const fingerState = view.oximeter >= 90 ? "warm" : view.oximeter >= 80 ? "pale" : "blue";
    this.fingers.textContent = fingerState;
    this.fingers.dataset.state = fingerState;
  }

  private toggle(): void {
    if (this.panel.hidden) {
      this.panel.hidden = false;
      this.checkButton.setAttribute("aria-expanded", "true");
      this.panel.querySelector("button")?.focus();
    } else {
      this.close();
    }
  }

  private close(): void {
    this.panel.hidden = true;
    this.checkButton.setAttribute("aria-expanded", "false");
    this.checkButton.focus();
  }

  private required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`The climb interface needs ${selector}`);
    }
    return element;
  }
}
