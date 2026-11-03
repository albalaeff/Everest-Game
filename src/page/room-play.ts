import type { Refusal, Welcome } from "../room/messages";
import { RoomCode } from "../room/room-code";
import type { ReloadOnce } from "./reload-once";
import type { RoomListener } from "./room-client";
import { RoomLink } from "./room-link";
import type { RoomNotice } from "./room-notice";

/**
 * A room as the page shows it: the notice of where the connection stands, the link to share
 * written into the address bar once the room welcomes the player, and the climb played from
 * then on, by `play`. A room that asks for a reload gets one, once; the climb goes on after a
 * connection lost, from the room's fresh save.
 */
export class RoomPlay implements RoomListener {
  constructor(
    private readonly window: Window,
    private readonly notice: RoomNotice,
    private readonly reloads: ReloadOnce,
    /** The room joined, or null for a new one, whose code the welcome names. */
    private readonly code: RoomCode | null,
    private readonly play: (welcome: Welcome) => void,
  ) {}

  welcomed(welcome: Welcome, again: boolean): void {
    this.reloads.forget();
    if (again) {
      this.notice.hide();
      return;
    }
    const code = RoomCode.parse(welcome.code);
    if (code !== null) {
      const { history, location } = this.window;
      history.replaceState(null, "", new RoomLink(location.href).to(code));
    }
    this.notice.joined(welcome.code);
    this.play(welcome);
  }

  refused(refusal: Refusal): void {
    if (refusal !== "reload") {
      this.notice.stopped(refusal, this.code?.text ?? "");
    } else if (this.reloads.attempt()) {
      this.notice.reloading();
    } else {
      this.notice.stopped("updating", "");
    }
  }

  lost(): void {
    this.notice.lost();
  }
}
