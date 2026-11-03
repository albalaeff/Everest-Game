import type { ClimberId, ExpeditionSave, GameAction } from "../simulation";

/** An action without its climber: the room gives it the sender's, whatever the message said. */
type WithoutClimber<Action> = Action extends GameAction ? Omit<Action, "climber"> : never;
export type Unsigned = WithoutClimber<GameAction>;

/** The first thing a browser says in a room: who it is across reconnections, and which build of
 * the game it runs. */
export interface Hello {
  readonly type: "hello";
  /** The player's own, made and kept by their browser for the room: the seat is theirs by it. */
  readonly token: string;
  readonly version: string;
}

/** What the player did since the last message, for the room's next step. */
export interface Actions {
  readonly type: "actions";
  readonly actions: readonly Unsigned[];
}

export type ClientMessage = Hello | Actions;

/** The room's answer to `hello`: the player's climber, and the expedition to go on from, without
 * its log. */
export interface Welcome {
  readonly type: "welcome";
  readonly code: string;
  readonly climber: ClimberId;
  readonly save: ExpeditionSave;
}

/** One step the room took, with every climber's actions in it: each browser takes the same. */
export interface Step {
  readonly type: "step";
  readonly step: number;
  readonly actions: readonly GameAction[];
}

export type ServerMessage = Welcome | Step;

/** Why a room turned a player away. */
export type Refusal = "unknown" | "full" | "reload";

/**
 * How a room closes a socket: the WebSocket's close code, which the browser reads from its close
 * event. Three of them are refusals; any other code is a connection lost, to be tried again.
 */
export class CloseCode {
  /** No room has this code. */
  static readonly UNKNOWN = new CloseCode(4404, "unknown");
  /** Every climber of the scenario has a player. */
  static readonly FULL = new CloseCode(4409, "full");
  /** The browser runs another build of the game than the room: it reloads, once. */
  static readonly RELOAD = new CloseCode(4426, "reload");
  /** A message that isn't the protocol's, or came before `hello`. */
  static readonly BAD_MESSAGE = new CloseCode(4400, null);

  private static readonly REFUSALS = [CloseCode.UNKNOWN, CloseCode.FULL, CloseCode.RELOAD];

  private constructor(
    readonly code: number,
    readonly refusal: Refusal | null,
  ) {}

  /** The refusal a close code stands for, or null for a connection merely lost. */
  static refusalOf(code: number): Refusal | null {
    return CloseCode.REFUSALS.find((close) => close.code === code)?.refusal ?? null;
  }
}

/** What a field of an action may hold: one of some words, or a value of a type. */
type Field = readonly string[] | "boolean" | "number" | "string";
type Shape = Readonly<Record<string, Field>>;

/**
 * The room's protocol: JSON text each way, read here into messages, or nothing. The room never
 * trusts a browser: a field more or less, a direction that isn't one, a number that isn't finite,
 * and the message is refused whole, since every browser in the room would run the action it
 * passed on. The browser reads the room's messages with the same care, in case of a server that
 * isn't ours.
 */
export class Protocol {
  /** The most actions one message carries: a step's worth from one player, with room to spare. */
  static readonly MAX_ACTIONS = 100;
  /** The longest text a message may carry: a version, a radio phrase. */
  static readonly MAX_TEXT = 200;
  private static readonly TOKEN = /^[\w-]{8,64}$/;

  /** Whether a text is a player's token: letters, digits, `_` and `-`, 8 to 64 of them. */
  static isToken(text: string): boolean {
    return Protocol.TOKEN.test(text);
  }

  /** Every action's fields, by its kind: the spec's controls table, as `game-action.ts` has it. */
  private static readonly SHAPES: Readonly<Record<GameAction["kind"], Shape>> = {
    walk: {
      direction: [
        "up",
        "down",
        "left",
        "right",
        "up-left",
        "up-right",
        "down-left",
        "down-right",
        "stop",
      ],
    },
    pace: { pace: ["rest-step", "steady", "faster"] },
    clip: { cowstail: ["first", "second"] },
    unclip: { cowstail: ["first", "second"] },
    jumar: { held: "boolean" },
    tool: { tool: ["ice-axe", "crampons"], x: "number", y: "number" },
    oxygen: { change: ["up", "down"] },
    "check-self": {},
    radio: { channel: ["guide", "base-camp", "group"], phrase: "string" },
    "set-up-tent": {},
  };

  /** What a browser sent, or null for anything that isn't a message of the protocol. */
  fromClient(text: string): ClientMessage | null {
    const message = this.json(text);
    if (message === null) {
      return null;
    }
    if (message.type === "hello") {
      const { token, version } = message;
      if (
        typeof token === "string" &&
        Protocol.isToken(token) &&
        typeof version === "string" &&
        version.length > 0 &&
        version.length <= Protocol.MAX_TEXT
      ) {
        return { type: "hello", token, version };
      }
      return null;
    }
    if (message.type === "actions") {
      const given: unknown = message.actions;
      if (!Array.isArray(given) || given.length > Protocol.MAX_ACTIONS) {
        return null;
      }
      const actions = given.map((action: unknown) => this.action(action));
      return actions.every((action): action is Unsigned => action !== null)
        ? { type: "actions", actions }
        : null;
    }
    return null;
  }

  /** What the room sent, or null for anything else. */
  fromServer(text: string): ServerMessage | null {
    const message = this.json(text);
    if (message === null) {
      return null;
    }
    if (message.type === "welcome") {
      const { code, climber, save } = message;
      if (typeof code === "string" && typeof climber === "string" && this.record(save) !== null) {
        return { type: "welcome", code, climber, save: save as ExpeditionSave };
      }
      return null;
    }
    if (message.type === "step") {
      const { step, actions } = message;
      if (typeof step === "number" && Number.isInteger(step) && Array.isArray(actions)) {
        return { type: "step", step, actions: actions as GameAction[] };
      }
    }
    return null;
  }

  /** An action in one of the shapes, without its climber; null for anything else. */
  private action(value: unknown): Unsigned | null {
    const record = this.record(value);
    const kind: unknown = record?.kind;
    if (record === null || typeof kind !== "string" || !Protocol.isKind(kind)) {
      return null;
    }
    const shape = Protocol.SHAPES[kind];
    const fields = Object.keys(record).filter((field) => field !== "kind" && field !== "climber");
    if (fields.length !== Object.keys(shape).length) {
      return null;
    }
    const action: Record<string, unknown> = { kind };
    for (const [field, allowed] of Object.entries(shape)) {
      const given: unknown = record[field];
      if (!Protocol.fits(given, allowed)) {
        return null;
      }
      action[field] = given;
    }
    return action as unknown as Unsigned;
  }

  private json(text: string): Record<string, unknown> | null {
    try {
      return this.record(JSON.parse(text));
    } catch {
      return null;
    }
  }

  private record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private static isKind(kind: string): kind is GameAction["kind"] {
    return Object.hasOwn(Protocol.SHAPES, kind);
  }

  private static fits(value: unknown, allowed: Field): boolean {
    if (allowed === "boolean") {
      return typeof value === "boolean";
    }
    if (allowed === "number") {
      return typeof value === "number" && Number.isFinite(value);
    }
    if (allowed === "string") {
      return typeof value === "string" && value.length <= Protocol.MAX_TEXT;
    }
    return typeof value === "string" && allowed.includes(value);
  }
}
