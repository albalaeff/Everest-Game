import { Expedition, SimulationClock, StepPacer } from "../simulation";
import type { ClimberId, ExpeditionSave, GameAction, Rule, Scenario } from "../simulation";
import { CloseCode, Protocol } from "./messages";
import type { Hello, Step, Welcome } from "./messages";

/** A player's connection, as far as the room uses it: the Durable Object's WebSocket, or a fake
 * in tests. */
export interface Socket {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** A room's whole state, as the server keeps it: the expedition, and whose climber each is. */
export interface RoomSave {
  readonly code: string;
  readonly expedition: ExpeditionSave;
  /** Each seat taken: the player's token, and their climber. */
  readonly seats: readonly (readonly [token: string, climber: ClimberId])[];
}

/**
 * One room: the expedition its players share, run by the server's clock
 * (docs/conventions/room-server.md). A player who says hello is seated on a climber of the
 * scenario, in the order of joining, and the seat stays theirs by their token: a reload or a lost
 * connection gets the same climber back. A tick takes the steps the real time owes, each with the
 * actions sent since the last, and sends every step to every player, so every browser runs the
 * same simulation. With nobody in it the room pauses, and keeps its state for whoever comes back.
 * It knows no network and no clock: the Durable Object hands it sockets and seconds.
 */
export class Room {
  /** How much real time one tick counts at most: a server stalled longer loses the rest, rather
   * than racing to catch up. */
  static readonly MAX_TICK_SECONDS = 1;

  private readonly protocol = new Protocol();
  private readonly seats: Map<string, ClimberId>;
  /** Each socket, and the token it said hello with, or null before it has. */
  private readonly sockets = new Map<Socket, string | null>();
  private readonly pacer = new StepPacer(Room.MAX_TICK_SECONDS * SimulationClock.STEPS_PER_SECOND);
  private queued: GameAction[] = [];

  private constructor(
    readonly code: string,
    private readonly expedition: Expedition,
    seats: Iterable<readonly [string, ClimberId]>,
    private readonly version: string,
  ) {
    this.seats = new Map(seats);
  }

  /** A new room on a new expedition; `version` is the build of the game its players must run. */
  static create(code: string, scenario: Scenario, rules: readonly Rule[], version: string): Room {
    return new Room(code, Expedition.start(scenario, rules), [], version);
  }

  static resume(save: RoomSave, rules: readonly Rule[], version: string): Room {
    return new Room(save.code, Expedition.resume(save.expedition, rules), save.seats, version);
  }

  /** How many steps the expedition has taken. */
  get step(): number {
    return this.expedition.step;
  }

  /** How many players are in: seated, on an open socket. The room is paused at none. */
  get players(): number {
    return [...this.sockets.values()].filter((token) => token !== null).length;
  }

  /** A socket that just connected: its player is in once it says hello. */
  connect(socket: Socket): void {
    this.sockets.set(socket, null);
  }

  /** What a socket sent. Anything but the protocol, or anything before hello, closes it. */
  hear(socket: Socket, text: string): void {
    const message = this.protocol.fromClient(text);
    const token = this.sockets.get(socket);
    if (message === null || token === undefined) {
      this.refuse(socket, CloseCode.BAD_MESSAGE, "Not a message of the room's");
      return;
    }
    if (message.type === "hello") {
      this.welcome(socket, message);
      return;
    }
    if (token === null) {
      this.refuse(socket, CloseCode.BAD_MESSAGE, "Say hello first");
      return;
    }
    const climber = this.seats.get(token);
    if (climber !== undefined) {
      for (const action of message.actions) {
        this.queued.push({ ...action, climber });
      }
    }
  }

  /** A socket that closed: its player's seat stays theirs. */
  leave(socket: Socket): void {
    this.sockets.delete(socket);
  }

  /** `realSeconds` more have gone by: takes the steps due, and sends each to every player, with
   * the actions in it. Returns how many it took: none while nobody's in. */
  tick(realSeconds: number): number {
    if (this.players === 0) {
      return 0;
    }
    const steps = this.pacer.due(Math.min(realSeconds, Room.MAX_TICK_SECONDS));
    for (let taken = 0; taken < steps; taken += 1) {
      const actions = taken === 0 ? this.queued : [];
      if (taken === 0) {
        this.queued = [];
      }
      const message: Step = { type: "step", step: this.expedition.step, actions };
      this.expedition.advance(actions);
      this.broadcast(JSON.stringify(message));
    }
    return steps;
  }

  save(): RoomSave {
    return { code: this.code, expedition: this.expedition.save(), seats: [...this.seats] };
  }

  private welcome(socket: Socket, hello: Hello): void {
    if (hello.version !== this.version) {
      this.refuse(socket, CloseCode.RELOAD, `The room runs build ${this.version}`);
      return;
    }
    const climber = this.seat(hello.token);
    if (climber === null) {
      this.refuse(socket, CloseCode.FULL, "Every climber has a player");
      return;
    }
    this.sockets.set(socket, hello.token);
    const message: Welcome = {
      type: "welcome",
      code: this.code,
      climber,
      save: { ...this.expedition.save(), actions: [] },
    };
    socket.send(JSON.stringify(message));
  }

  /** The token's climber: the one it had, or the first free one in the scenario's order. */
  private seat(token: string): ClimberId | null {
    const taken = this.seats.get(token);
    if (taken !== undefined) {
      return taken;
    }
    const seated = new Set(this.seats.values());
    const free = this.expedition.scenario.climbers.find((climber) => !seated.has(climber));
    if (free === undefined) {
      return null;
    }
    this.seats.set(token, free);
    return free;
  }

  private refuse(socket: Socket, close: CloseCode, reason: string): void {
    this.sockets.delete(socket);
    socket.close(close.code, reason);
  }

  private broadcast(text: string): void {
    for (const [socket, token] of this.sockets) {
      if (token !== null) {
        socket.send(text);
      }
    }
  }
}
