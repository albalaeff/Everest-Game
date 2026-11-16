import { PageElements } from "../input/page-elements";
import { RoomCode } from "../room/room-code";
import type { MenuPicture } from "./menu/menu-picture";
import type { MenuTexts } from "./menu/menu-texts";
import type { RoomTexts } from "./room-texts";

/** What the player chose at the start. */
export type StartChoice =
  | { readonly kind: "alone"; readonly fresh: boolean }
  | { readonly kind: "together" }
  | { readonly kind: "join"; readonly code: RoomCode };

/**
 * The game's main menu, where a climb begins once the disclaimer is read: the mountain before
 * dawn with the route drawn on it (`MenuPicture`), the game's name and its motto, and over them
 * the start's choices: [Alone], which goes on with the climb saved on the device, with [Start
 * over] beside it for a new one; [Together: a new room]; or a room's code and [Join]. Under
 * [Alone] and [Together] it says who climbs with the player, `sherpa` by name. A code that can't
 * be one is said at once, without asking the room server.
 */
export class StartMenu {
  /** The room's words on the menu, and the menu's own, each on the element named for it. */
  private static readonly ROOM = ["alone", "start-over", "together", "code", "join"] as const;
  private static readonly OWN = ["route", "name", "motto", "together-with"] as const;

  private readonly elements: PageElements;

  constructor(
    document: Document,
    private readonly texts: RoomTexts,
    menu: MenuTexts,
    sherpa: string,
    private readonly picture: MenuPicture,
  ) {
    this.elements = new PageElements(document);
    for (const text of StartMenu.ROOM) {
      this.element(`[data-text="${text}"]`).textContent = texts.say(text);
    }
    for (const text of StartMenu.OWN) {
      this.element(`[data-text="${text}"]`).textContent = menu.say(text);
    }
    this.element('[data-text="alone-with"]').textContent = menu.say("alone-with", { name: sherpa });
    this.element(".menu-choices").setAttribute("aria-label", texts.say("title"));
  }

  /** Shows it, and starts the choice once it's made; `saved`: a climb alone is saved on the
   * device, which [Alone] goes on with. */
  show(saved: boolean, then: (choice: StartChoice) => void): void {
    const menu = this.element("");
    const stage = this.element(".menu-stage");
    const input = this.elements.find("#start input") as HTMLInputElement;
    const chosen = (choice: StartChoice): void => {
      if (menu.hidden) {
        return;
      }
      menu.hidden = true;
      // The picture goes with the menu, so nothing of it moves behind the climb.
      stage.replaceChildren();
      then(choice);
    };
    const alone = this.element('[data-act="alone"]');
    const startOver = this.element('[data-act="start-over"]');
    startOver.hidden = !saved;
    alone.addEventListener("click", () => {
      chosen({ kind: "alone", fresh: false });
    });
    startOver.addEventListener("click", () => {
      chosen({ kind: "alone", fresh: true });
    });
    this.element('[data-act="together"]').addEventListener("click", () => {
      chosen({ kind: "together" });
    });
    input.addEventListener("input", () => {
      input.setCustomValidity("");
    });
    this.element("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const code = RoomCode.parse(input.value);
      if (code === null) {
        input.setCustomValidity(this.texts.say("unknown", { code: input.value.trim() }));
        input.reportValidity();
        return;
      }
      chosen({ kind: "join", code });
    });
    this.picture.show(stage);
    menu.hidden = false;
    alone.focus();
  }

  private element(selector: string): HTMLElement {
    return this.elements.find(`#start ${selector}`.trim());
  }
}
