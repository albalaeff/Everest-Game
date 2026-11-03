import { PageElements } from "../input/page-elements";
import { RoomCode } from "../room/room-code";
import type { RoomTexts } from "./room-texts";

/** What the player chose at the start. */
export type StartChoice =
  | { readonly kind: "alone"; readonly fresh: boolean }
  | { readonly kind: "together" }
  | { readonly kind: "join"; readonly code: RoomCode };

/**
 * Where a climb begins, once the disclaimer is read: [Alone], which goes on with the climb saved
 * on the device, with [Start over] beside it for a new one; [Together: a new room]; or a room's
 * code and [Join]. A code that can't be one is said at once, without asking the room server.
 */
export class StartMenu {
  private static readonly TEXTS = [
    "title",
    "alone",
    "start-over",
    "together",
    "code",
    "join",
  ] as const;

  private readonly elements: PageElements;

  constructor(
    document: Document,
    private readonly texts: RoomTexts,
  ) {
    this.elements = new PageElements(document);
    for (const text of StartMenu.TEXTS) {
      this.element(`[data-text="${text}"]`).textContent = texts.say(text);
    }
  }

  /** Shows it, and starts the choice once it's made; `saved`: a climb alone is saved on the
   * device, which [Alone] goes on with. */
  show(saved: boolean, then: (choice: StartChoice) => void): void {
    const menu = this.element("");
    const input = this.elements.find("#start input") as HTMLInputElement;
    const chosen = (choice: StartChoice): void => {
      if (menu.hidden) {
        return;
      }
      menu.hidden = true;
      then(choice);
    };
    const alone = this.element('[data-text="alone"]');
    const startOver = this.element('[data-text="start-over"]');
    startOver.hidden = !saved;
    alone.addEventListener("click", () => {
      chosen({ kind: "alone", fresh: false });
    });
    startOver.addEventListener("click", () => {
      chosen({ kind: "alone", fresh: true });
    });
    this.element('[data-text="together"]').addEventListener("click", () => {
      chosen({ kind: "together" });
    });
    input.addEventListener("input", () => {
      input.setCustomValidity("");
    });
    this.element("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const code = RoomCode.parse(input.value);
      if (code === null) {
        input.setCustomValidity(this.texts.say("unknown", input.value.trim()));
        input.reportValidity();
        return;
      }
      chosen({ kind: "join", code });
    });
    menu.hidden = false;
    alone.focus();
  }

  private element(selector: string): HTMLElement {
    return this.elements.find(`#start ${selector}`.trim());
  }
}
