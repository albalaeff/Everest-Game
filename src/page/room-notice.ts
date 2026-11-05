import { PageElements } from "../input/page-elements";
import { RoomLink } from "./room-link";
import type { RoomTexts } from "./room-texts";

/** Why the page can't play the room, and [Back] says so. */
export type Stop = "unknown" | "full" | "stale" | "updating";

/**
 * Where a room's connection stands, at the top of the screen: connecting, lost, or why the room
 * turned the player away, with [Back] to the start. The room's code is said once, as the player
 * joins, with [Copy link] where the browser lets a page copy; then the notice goes, so it never
 * sits over the climb (#28).
 */
export class RoomNotice {
  static readonly JOINED_SECONDS = 15;

  private readonly notice: HTMLElement;
  private readonly text: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly back: HTMLElement;
  private hiding: number | null = null;

  constructor(
    private readonly window: Window,
    private readonly texts: RoomTexts,
  ) {
    const elements = new PageElements(window.document);
    this.notice = elements.find("#room");
    this.text = elements.find("#room span");
    this.copy = elements.find('#room [data-act="copy"]');
    this.back = elements.find('#room [data-act="back"]');
    this.back.textContent = texts.say("back");
    this.back.addEventListener("click", () => {
      window.location.assign(new RoomLink(window.location.href).without());
    });
    this.copy.addEventListener("click", () => {
      void this.copyLink();
    });
  }

  connecting(): void {
    this.show(this.texts.say("connecting"));
  }

  /** In the room: its code, said once, which goes after a while. */
  joined(code: string): void {
    this.show(this.texts.say("joined", { code }), { copy: this.canCopy() });
    this.hiding = this.window.setTimeout(() => {
      this.hide();
    }, RoomNotice.JOINED_SECONDS * 1000);
  }

  lost(): void {
    this.show(this.texts.say("lost"));
  }

  reloading(): void {
    this.show(this.texts.say("reloading"));
  }

  /** The room can't be played: why, and the way back to the start. */
  stopped(stop: Stop, code: string): void {
    this.show(this.texts.say(stop, { code }), { back: true });
  }

  hide(): void {
    this.cancelHiding();
    this.notice.hidden = true;
  }

  private show(text: string, buttons: { readonly copy?: boolean; readonly back?: boolean } = {}) {
    this.cancelHiding();
    this.text.textContent = text;
    this.copy.textContent = this.texts.say("copy-link");
    this.copy.hidden = buttons.copy !== true;
    this.back.hidden = buttons.back !== true;
    this.notice.hidden = false;
  }

  /** A page on the network, not on https or localhost, may not use the clipboard. */
  private canCopy(): boolean {
    return this.window.isSecureContext && "clipboard" in this.window.navigator;
  }

  private async copyLink(): Promise<void> {
    try {
      await this.window.navigator.clipboard.writeText(this.window.location.href);
      this.copy.textContent = this.texts.say("copied");
    } catch {
      // Refused: the link is in the address bar.
    }
  }

  private cancelHiding(): void {
    if (this.hiding !== null) {
      this.window.clearTimeout(this.hiding);
      this.hiding = null;
    }
  }
}
