/**
 * Marks the page as played by touch, which shows the thumb's controls: on a phone from the start,
 * and on a laptop with a touch screen from its first touch.
 */
export class TouchMode {
  private static readonly MARK = "touch";

  constructor(
    window: Window,
    private readonly root: Element,
  ) {
    if (window.matchMedia("(pointer: coarse)").matches) {
      this.turnOn();
    }
    window.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        this.turnOn();
      }
    });
  }

  private turnOn(): void {
    this.root.classList.add(TouchMode.MARK);
  }
}
