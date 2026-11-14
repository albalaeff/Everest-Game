import type { SherpaVoice, SherpaWorld } from "./sherpa-voice";

/** Where a point of the slope is on the screen, in CSS pixels from its top left, or none while the
 * page draws no picture. The scene is this (`SlopeScene.screenAt`). */
export type ScreenPlace = (x: number, y: number) => readonly number[] | null;

/**
 * Pemba's bubble on the page (#212): `#sherpa`, over his head on the slope, saying the line his
 * voice picks each frame, with his name, for as long as it takes to read; at the screen's edge
 * nearest him, pointing to him, while he's off it (`data-edge`), and at the top of the screen when
 * the page draws no picture. It changes the words only when the line changes, follows him each
 * frame, never takes a click from the slope, and a screen reader reads each new line.
 */
export class SherpaBubble {
  /** How far above his feet the bubble's tail points, in slope metres: over his head. */
  private static readonly OVER_HEAD = 2.1;
  /** How far in from the screen's edges the bubble's tail stays, in CSS pixels. */
  private static readonly MARGIN = 24;

  private readonly bubble: HTMLElement;
  private readonly said: HTMLElement;
  private shown: string | null = null;

  constructor(
    private readonly window: Window,
    private readonly voice: SherpaVoice,
    private readonly world: SherpaWorld,
    private readonly place: ScreenPlace,
  ) {
    const { document } = window;
    this.bubble = SherpaBubble.required(document, "#sherpa");
    this.said = SherpaBubble.required(document, "#sherpa [data-text='said']");
    SherpaBubble.required(document, "#sherpa [data-text='who']").textContent = voice.name;
  }

  /** The line after `seconds` more of the climb, shown if it's changed, and the bubble moved to
   * where Pemba is now. */
  update(seconds: number): void {
    const line = this.voice.line(this.world, seconds);
    const words = line?.words ?? null;
    if (words !== this.shown) {
      this.shown = words;
      this.bubble.hidden = line === null;
      if (line === null) {
        delete this.bubble.dataset.cue;
      } else {
        this.bubble.dataset.cue = line.cue;
        this.bubble.dataset.kind = line.urgent ? "warning" : "said";
        this.said.textContent = line.words;
      }
    }
    if (line !== null) {
      this.follow();
    }
  }

  /** Puts the bubble's tail over Pemba's head, or at the edge nearest him while he's off the
   * screen; at the top when there's no picture. */
  private follow(): void {
    const { bubble } = this;
    const pemba = this.world.pemba();
    const at = this.place(pemba.x, pemba.y + SherpaBubble.OVER_HEAD);
    if (at === null) {
      bubble.dataset.edge = "none";
      bubble.style.removeProperty("left");
      bubble.style.removeProperty("top");
      return;
    }
    const [x = 0, y = 0] = at;
    const width = this.window.innerWidth;
    const height = this.window.innerHeight;
    const margin = SherpaBubble.MARGIN;
    const left = Math.min(width - margin, Math.max(margin, x));
    const top = Math.min(height - margin, Math.max(margin, y));
    const edge =
      x < margin
        ? "left"
        : x > width - margin
          ? "right"
          : y < margin
            ? "top"
            : y > height - margin
              ? "bottom"
              : "on";
    bubble.dataset.edge = edge;
    bubble.style.left = `${left.toFixed(1)}px`;
    bubble.style.top = `${top.toFixed(1)}px`;
  }

  private static required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new RangeError(`The page has no ${selector}`);
    }
    return element;
  }
}
