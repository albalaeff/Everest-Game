import { PageElements } from "../input/page-elements";
import type { Texts } from "../interface/texts";
import type { Kit } from "../physics";

/**
 * The gear check at Base Camp (#196): after Your climber, before every new climb alone, the player
 * ticks what they check of their kit, each item with the reason it matters, and [Set off] starts
 * the climb with it. Nothing is ticked to begin with: a check is something the player does, and
 * one they skip catches up with them on the route, not at once. The screen says it's a game model,
 * not instructions for the route. Its words are content/gear.json's.
 */
export class GearCheck {
  /** The screen's own words, by their names in content/gear.json and index.html. */
  static readonly TEXTS = [
    "title",
    "model",
    "intro",
    "crampons",
    "crampons-why",
    "lamp",
    "lamp-why",
    "water",
    "water-why",
    "set-off",
  ] as const;
  /** What the player checks, in the screen's order: each a box named after its part of the kit. */
  static readonly ITEMS: readonly (keyof Kit)[] = ["crampons", "lamp", "water"];

  private readonly elements: PageElements;
  private readonly dialog: HTMLElement;
  private readonly form: HTMLFormElement;

  constructor(window: Window, texts: Texts) {
    this.elements = new PageElements(window.document);
    for (const text of GearCheck.TEXTS) {
      this.find(`[data-text="${text}"]`).textContent = texts.say(text);
    }
    this.dialog = this.find("");
    this.form = this.find("form") as HTMLFormElement;
  }

  /** Shows it, nothing ticked, and sets off with what the player checked. Enter sets off too,
   * from a box, as it does from [Set off]. */
  show(then: (kit: Kit) => void): void {
    const setOff = (): void => {
      if (this.dialog.hidden) {
        return;
      }
      this.dialog.querySelector<HTMLElement>(":focus")?.blur();
      this.dialog.hidden = true;
      then(this.checked());
    };
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      setOff();
    });
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        setOff();
      }
    });
    for (const item of GearCheck.ITEMS) {
      this.box(item).checked = false;
    }
    this.dialog.hidden = false;
    this.dialog.scrollTop = 0;
    this.box("crampons").focus({ preventScroll: true });
  }

  /** What the boxes say was checked. */
  private checked(): Kit {
    return {
      crampons: this.box("crampons").checked,
      lamp: this.box("lamp").checked,
      water: this.box("water").checked,
    };
  }

  private box(item: keyof Kit): HTMLInputElement {
    return this.find(`input[name="${item}"]`) as HTMLInputElement;
  }

  private find(selector: string): HTMLElement {
    return this.elements.find(`#gear ${selector}`.trim());
  }
}
