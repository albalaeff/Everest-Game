import type { Mountain } from "../content/mountain";
import { SimulationClock } from "../simulation";
import { CloseCode } from "./messages";
import { Room } from "./room";
import type { Socket } from "./room";
import type { RoomStorage } from "./room-storage";

/** The object's clock, as far as the host uses it: an interval of the Durable Object's, or a
 * test's. */
export interface Ticker {
  /** Calls `tick` a step's time apart, with the real seconds since the last call, until `stop`.
   * Starting it while it runs changes nothing. */
  start(tick: (seconds: number) => void): void;
  stop(): void;
}

/**
 * A room as its Durable Object keeps it (docs/conventions/room-server.md): loaded from the
 * object's storage once, made when the worker draws its code, and run by the object's clock
 * while anyone's in. It stores the room when a player takes a seat, every ten seconds of play,
 * and at the pause, when the last player leaves, so a player who comes back finds the climb where
 * it was. A room nobody took a seat in is never stored. A room this build can't go on with is
 * kept as it is, never deleted, and whoever comes is told so. The object around it holds the
 * sockets, the clock and the storage; everything it decides is here, where Node can test it.
 */
export class RoomHost {
  static readonly SAVE_EVERY_STEPS = 10 * SimulationClock.STEPS_PER_SECOND;

  private room: Room | null = null;
  /** A room is stored that this build can't go on with. */
  private stale = false;
  private ticking = false;
  private unsaved = 0;

  constructor(
    private readonly storage: RoomStorage,
    private readonly mountain: Mountain,
    private readonly version: string,
    private readonly ticker: Ticker,
  ) {}

  /** Loads the room stored, if there is one. */
  async load(): Promise<void> {
    const save = await this.storage.load();
    if (save === null) {
      return;
    }
    try {
      this.room = Room.resume(save, this.mountain.rules().all, this.version);
    } catch {
      this.stale = true;
    }
  }

  /** Makes the room the worker drew `code` for, on a new expedition from `seed`: false when the
   * code is taken. */
  create(code: string, seed: number): boolean {
    if (this.room !== null || this.stale) {
      return false;
    }
    const rules = this.mountain.rules().all;
    this.room = Room.create(code, this.mountain.scenario(seed), rules, this.version);
    return true;
  }

  /** A socket that just connected: it's turned away at once when there's no room to play. */
  connect(socket: Socket): void {
    if (this.room === null) {
      const close = this.stale ? CloseCode.STALE : CloseCode.UNKNOWN;
      socket.close(close.code, this.stale ? "Saved by an older build" : "No such room");
      return;
    }
    this.room.connect(socket);
  }

  hear(socket: Socket, text: string): void {
    const { room } = this;
    if (room === null) {
      return;
    }
    const seated = room.seated;
    room.hear(socket, text);
    if (room.seated > seated) {
      void this.store(room);
    }
    this.settle(room);
  }

  leave(socket: Socket): void {
    const { room } = this;
    if (room === null) {
      return;
    }
    room.leave(socket);
    this.settle(room);
  }

  /** The clock runs while anyone's in; the last one out pauses the room, stored as it stands. */
  private settle(room: Room): void {
    if (room.players > 0 && !this.ticking) {
      this.ticking = true;
      this.ticker.start((seconds) => {
        this.tick(room, seconds);
      });
    } else if (room.players === 0 && this.ticking) {
      this.ticking = false;
      this.ticker.stop();
      void this.store(room);
    }
  }

  private tick(room: Room, seconds: number): void {
    this.unsaved += room.tick(seconds);
    if (this.unsaved >= RoomHost.SAVE_EVERY_STEPS) {
      void this.store(room);
    }
  }

  private async store(room: Room): Promise<void> {
    this.unsaved = 0;
    await this.storage.store(room.save());
  }
}
