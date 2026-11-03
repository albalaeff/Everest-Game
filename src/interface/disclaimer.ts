import type { ExpertReview } from "./expert-review";

/** The disclaimer's words, in one language of content/disclaimer.json. */
export type DisclaimerTexts = Readonly<
  Record<"title" | "course" | "skills" | "mark" | "sources" | "understand", string>
>;

/**
 * What the game opens on: it trains knowledge and decisions and replaces no course, instructor or
 * doctor, and it's a beta until an expert has reviewed it. The game starts only once [I understand]
 * is pressed, so nothing reaches it before; the training's modules open on it too (#63).
 */
export class Disclaimer {
  private static readonly TEXTS: readonly (keyof DisclaimerTexts)[] = [
    "title",
    "course",
    "skills",
    "mark",
    "sources",
    "understand",
  ];

  constructor(
    private readonly document: Document,
    texts: DisclaimerTexts,
    review: ExpertReview,
  ) {
    for (const text of Disclaimer.TEXTS) {
      this.element(`[data-text="${text}"]`).textContent = texts[text];
    }
    this.element(".beta").hidden = review.done();
  }

  /** Shows it, and starts what comes after once the player has read it. */
  show(then: () => void): void {
    const dialog = this.element("");
    const understand = this.element("button");
    understand.addEventListener(
      "click",
      () => {
        dialog.hidden = true;
        then();
      },
      { once: true },
    );
    dialog.hidden = false;
    understand.focus();
  }

  private element(selector: string): HTMLElement {
    const found = this.document.querySelector<HTMLElement>(`#disclaimer ${selector}`.trim());
    if (found === null) {
      throw new RangeError(`No #disclaimer ${selector} on the page`);
    }
    return found;
  }
}
