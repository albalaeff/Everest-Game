import { GameActionSink } from "../input/player-action";
import { CloseCode, Protocol } from "../room/messages";
import type { Actions, Hello, Refusal, Step, Welcome } from "../room/messages";
import { RoomCode } from "../room/room-code";
import { Expedition, SimulationClock } from "../simulation";
import type { GameAction, Rule } from "../simulation";
import type { Played } from "./game-loop";
import type { RoomServer } from "./room-server";

/** What a socket reports to the client. */
export interface SocketEvents {
  opened(): void;
  heard(text: string): void;
  closed(code: number): void;
}

/** A browser's WebSocket, as far as the client uses it: the browser's own, or a test's fake. */
export interface ClientSocket {
  send(text: string): void;
  close(): void;
  listen(events: SocketEvents): void;
}

/** What the page does around the client: opens sockets, and waits. */
export interface Browser {
  connect(url: string): ClientSocket;
  /** Runs `then` after `seconds`. */
  after(seconds: number, then: () => void): void;
}

/** What the page hears from the client. */
export interface RoomListener {
  /** In the room, with the expedition to draw: at first, and `again` after a connection lost. */
  welcomed(welcome: Welcome, again: boolean): void;
  refused(refusal: Refusal): void;
  /** The connection is lost, and the client is trying again. */
  lost(): void;
}

/**
 * A room as this browser plays it (docs/conventions/room-server.md): the WebSocket to the room,
 * the expedition the room's welcome hands over, and the steps the room sends, taken each frame in
 * the room's order, so this browser shows what every other one does. The player's actions go to
 * the room, never into the expedition here: they come back in a step. A connection lost is tried
 * again every two seconds with the same token, to the room the welcome named, and the welcome
 * that follows is a fresh save, so nothing missed is missed for long; a refusal ends it.
 */
export class RoomClient extends GameActionSink implements Played {
  static readonly RETRY_SECONDS = 2;
  /** The most steps kept between two frames, a minute's: a tab away for longer is quicker to
   * resume from a fresh save than to catch up. */
  static readonly MAX_BUFFERED = 60 * SimulationClock.STEPS_PER_SECOND;

  private readonly protocol = new Protocol();
  private socket: ClientSocket | null = null;
  /** The socket the room has welcomed: the player's actions wait for it. */
  private welcomedOn: ClientSocket | null = null;
  private played: Expedition | null = null;
  private buffered: Step[] = [];
  private queued: GameAction[] = [];
  private over = false;

  /** `code`: the room to join, or null to open a new one, whose code the welcome then names.
   * `hello`: the player's token and the game's version, said on every connection. */
  constructor(
    private readonly server: RoomServer,
    private code: RoomCode | null,
    private readonly hello: Hello,
    private readonly rules: readonly Rule[],
    private readonly browser: Browser,
    private readonly listener: RoomListener,
  ) {
    super();
  }

  /** The expedition as the room last handed it over, or null before the welcome. */
  get expedition(): Expedition | null {
    return this.played;
  }

  /** Connects, and keeps connecting until the room refuses or the player leaves. */
  join(): void {
    this.connect();
  }

  leave(): void {
    this.over = true;
    this.socket?.close();
    this.socket = null;
  }

  /** What the player did: for the room, with the next frame. A page request isn't sent. */
  protected queue(action: GameAction): void {
    this.queued.push(action);
  }

  /** Takes the room's steps that have come since the last frame, and sends the player's actions. */
  advance(): void {
    const { played, socket } = this;
    if (played === null || socket === null || socket !== this.welcomedOn) {
      return;
    }
    for (const step of this.buffered) {
      if (step.step !== played.step) {
        this.resync();
        return;
      }
      played.advance(step.actions);
    }
    this.buffered = [];
    if (this.queued.length > 0) {
      const message: Actions = { type: "actions", actions: this.queued };
      socket.send(JSON.stringify(message));
      this.queued = [];
    }
  }

  private connect(): void {
    const { code, server } = this;
    const socket = this.browser.connect(code === null ? server.newRoom() : server.room(code));
    this.socket = socket;
    socket.listen({
      opened: () => {
        socket.send(JSON.stringify(this.hello));
      },
      heard: (text) => {
        if (this.socket === socket) {
          this.hear(socket, text);
        }
      },
      closed: (code) => {
        if (this.socket === socket) {
          this.socket = null;
          this.closed(code);
        }
      },
    });
  }

  private hear(socket: ClientSocket, text: string): void {
    const message = this.protocol.fromServer(text);
    if (message === null) {
      this.resync();
    } else if (message.type === "welcome") {
      const again = this.played !== null;
      this.played = Expedition.resume(message.save, this.rules);
      this.code = RoomCode.parse(message.code) ?? this.code;
      this.welcomedOn = socket;
      this.buffered = [];
      this.listener.welcomed(message, again);
    } else {
      this.buffered.push(message);
      if (this.buffered.length > RoomClient.MAX_BUFFERED) {
        this.resync();
      }
    }
  }

  private closed(code: number): void {
    const refusal = CloseCode.refusalOf(code);
    if (refusal !== null) {
      this.over = true;
      this.listener.refused(refusal);
    } else if (!this.over) {
      this.retry();
    }
  }

  /** Drops the connection for a fresh save: a step the expedition here can't follow. */
  private resync(): void {
    const { socket } = this;
    if (socket === null) {
      return;
    }
    this.socket = null;
    socket.close();
    this.retry();
  }

  private retry(): void {
    this.buffered = [];
    this.listener.lost();
    this.browser.after(RoomClient.RETRY_SECONDS, () => {
      if (!this.over && this.socket === null) {
        this.connect();
      }
    });
  }
}
