import { FrameRate } from "./frame-rate";

/** The frames a second on the page, beside the build: for checking the targets by hand. */
export class FpsReadout {
  private readonly rate = new FrameRate();

  constructor(
    private readonly element: HTMLElement,
    private readonly unit: string,
  ) {}

  /** A frame drawn at `nowMilliseconds`. */
  frame(nowMilliseconds: number): void {
    if (this.rate.frame(nowMilliseconds)) {
      this.element.textContent = `${this.rate.fps ?? 0} ${this.unit}`;
    }
  }
}
