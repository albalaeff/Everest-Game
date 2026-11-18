import type { ClimberId, Tool } from "../simulation";
import type { PlayerAction } from "./player-action";
import type { SeenClimber } from "./slope-view";

export type ControlName =
  | "check-self"
  | "radio"
  | "devices"
  | "inventory"
  | "set-up-tent"
  | "oxygen-down"
  | "oxygen-up"
  | "clip-first"
  | "clip-second"
  | "jumar"
  | "haul"
  | "view-farther"
  | "view-closer";

/**
 * One action of the spec's controls table on every device: an action more is a row more. `keys` are
 * `KeyboardEvent.code`s, so they stay put on a Russian layout, and `gamepadButton` an index of the
 * Gamepad API's standard mapping. `group` says where its button goes on the page. A control with
 * a `release` is held. A press may depend on what the player sees of their climber: a clip key
 * takes its cowstail off once it's on a rope.
 */
export interface Control {
  readonly name: ControlName;
  readonly keys: readonly string[];
  readonly keyName: string;
  readonly gamepadButton: number;
  readonly group: "menu" | "oxygen" | "view" | "thumb";
  readonly press: (climber: ClimberId, seen: SeenClimber) => PlayerAction;
  readonly release?: (climber: ClimberId) => PlayerAction;
}

export const CONTROLS: readonly Control[] = [
  {
    name: "check-self",
    keys: ["Tab"],
    keyName: "Tab",
    gamepadButton: 8,
    group: "menu",
    press: (climber) => ({ kind: "check-self", climber }),
  },
  {
    name: "radio",
    keys: ["KeyQ"],
    keyName: "Q",
    gamepadButton: 1,
    group: "menu",
    press: () => ({ kind: "panel", panel: "radio" }),
  },
  {
    // The devices on the harness and the wrist (#260): the radio's key opens them at the radio.
    name: "devices",
    keys: ["KeyG"],
    keyName: "G",
    gamepadButton: 10,
    group: "menu",
    press: () => ({ kind: "panel", panel: "devices" }),
  },
  {
    name: "inventory",
    keys: ["KeyI"],
    keyName: "I",
    gamepadButton: 9,
    group: "menu",
    press: () => ({ kind: "panel", panel: "inventory" }),
  },
  {
    name: "set-up-tent",
    keys: ["KeyT"],
    keyName: "T",
    gamepadButton: 5,
    group: "menu",
    press: (climber) => ({ kind: "set-up-tent", climber }),
  },
  {
    name: "oxygen-down",
    keys: ["Minus", "NumpadSubtract"],
    keyName: "-",
    gamepadButton: 13,
    group: "oxygen",
    press: (climber) => ({ kind: "oxygen", climber, change: "down" }),
  },
  {
    name: "oxygen-up",
    keys: ["Equal", "NumpadAdd"],
    keyName: "+",
    gamepadButton: 12,
    group: "oxygen",
    press: (climber) => ({ kind: "oxygen", climber, change: "up" }),
  },
  {
    name: "clip-first",
    keys: ["KeyE"],
    keyName: "E",
    gamepadButton: 2,
    group: "thumb",
    press: (climber, seen) => ({
      kind: seen.first === null ? "clip" : "unclip",
      climber,
      cowstail: "first",
    }),
  },
  {
    name: "clip-second",
    keys: ["KeyR"],
    keyName: "R",
    gamepadButton: 3,
    group: "thumb",
    press: (climber, seen) => ({
      kind: seen.second === null ? "clip" : "unclip",
      climber,
      cowstail: "second",
    }),
  },
  {
    name: "jumar",
    keys: ["Space"],
    keyName: "Space",
    gamepadButton: 0,
    group: "thumb",
    press: (climber) => ({ kind: "jumar", climber, held: true }),
    release: (climber) => ({ kind: "jumar", climber, held: false }),
  },
  {
    // Pulling a partner who hangs on the rope out, held (#209).
    name: "haul",
    keys: ["KeyF"],
    keyName: "F",
    gamepadButton: 4,
    group: "thumb",
    press: (climber) => ({ kind: "haul", climber, held: true }),
    release: (climber) => ({ kind: "haul", climber, held: false }),
  },
  {
    name: "view-farther",
    keys: ["KeyZ"],
    keyName: "Z",
    gamepadButton: 14,
    group: "view",
    press: () => ({ kind: "view", change: "farther" }),
  },
  {
    name: "view-closer",
    keys: ["KeyX"],
    keyName: "X",
    gamepadButton: 15,
    group: "view",
    press: () => ({ kind: "view", change: "closer" }),
  },
];

type SteeringKey = "up" | "down" | "left" | "right" | "faster" | "restStep";

/** The keys that steer, held together: Ctrl is out, since Ctrl+W closes the browser's tab. */
export const STEERING_KEYS: Readonly<Record<SteeringKey, readonly string[]>> = {
  up: ["KeyW"],
  down: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  faster: ["ShiftLeft", "ShiftRight"],
  restStep: ["KeyC"],
};

/** The triggers: a gamepad has nothing to point with, so a tool goes just ahead of the climber. */
export const TOOL_BUTTONS: readonly { readonly button: number; readonly tool: Tool["tool"] }[] = [
  { button: 7, tool: "ice-axe" },
  { button: 6, tool: "crampons" },
];
