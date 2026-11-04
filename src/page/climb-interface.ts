import type { BodyView, ClimberId, MountainClock } from "../simulation";
import type { Body } from "../simulation/body/body";
import type { SlopePhysics } from "../physics";

/** The player's glanceable instruments and the self-check sheet. */
export class ClimbInterface {
  private readonly readouts: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly altitude: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly checkButton: HTMLElement;
  private readonly symptoms: HTMLElement;
  private readonly oximeter: HTMLElement;
  private readonly fingers: HTMLElement;

  constructor(
    window: Window,
    private readonly mountainClock: MountainClock,
    private readonly body: Body,
    private readonly physics: SlopePhysics,
    private readonly player: ClimberId,
  ) {
    const document = window.document;
    this.readouts = this.required(document, "#readouts");
    this.clock = this.required(document, "#readout-clock");
    this.altitude = this.required(document, "#readout-altitude");
    this.required(document, "#readout-pressure");
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
    this.clock.textContent = this.time(this.mountainClock.timeOfDay);
    this.altitude.textContent = `${Math.round(altitude).toLocaleString()} m`;
    this.updateSelfCheck(view);
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

  private time(seconds: number): string {
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  private required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`The climb interface needs ${selector}`);
    }
    return element;
  }
}
