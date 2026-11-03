import { GraphicsQuality, QualityChoice } from "./graphics-quality";
import type { RenderingTexts } from "./rendering-texts";

/** The `[Graphics: …]` button: each press steps the level up, and round to Low after High. */
export class QualityButton {
  private readonly element = document.createElement("button");

  constructor(
    private readonly choice: QualityChoice,
    private readonly texts: RenderingTexts,
    onChange: (quality: GraphicsQuality) => void,
  ) {
    this.element.type = "button";
    this.element.id = "graphics";
    this.element.className = "setting-button";
    this.element.addEventListener("click", () => {
      this.choice.choose(this.choice.quality.next);
      this.show();
      onChange(this.choice.quality);
    });
    this.show();
  }

  appendTo(parent: Element): void {
    parent.append(this.element);
  }

  private show(): void {
    const { name } = this.choice.quality;
    this.element.textContent = `${this.texts.graphics}: ${this.texts[name]}`;
    this.element.dataset.quality = name;
  }
}
