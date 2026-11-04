import type { Camera } from "./camera";
import type { ZoomChange, ZoomChoice } from "./zoom";

/** Where the level is shown: the `<output>` between `[-]` and `[+]`. */
export interface ZoomReadout {
  textContent: string | null;
}

/**
 * The player's choice of how much slope to see. Each press moves it a level, farther out or
 * closer in, and none past the ends: the camera glides there, the device keeps it, and the readout
 * between `[-]` and `[+]` says it, `20 m`.
 */
export class ZoomControl {
  constructor(
    private readonly choice: ZoomChoice,
    private readonly camera: Camera,
    private readonly readout: ZoomReadout,
    private readonly unit: string,
  ) {
    this.show();
  }

  step(change: ZoomChange): void {
    const zoom = this.choice.chosen.towards(change);
    this.choice.choose(zoom);
    this.camera.zoomTo(zoom);
    this.show();
  }

  private show(): void {
    this.readout.textContent = `${this.choice.chosen.metresHigh} ${this.unit}`;
  }
}
