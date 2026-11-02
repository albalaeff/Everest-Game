/** Which climber an action is for. Players' climbers and NPCs' are alike to the core. */
export type ClimberId = string;

interface ClimberAction {
  readonly climber: ClimberId;
}

type Vertical = "up" | "down";
type Horizontal = "left" | "right";

/**
 * Walks one of eight ways until another `walk` says otherwise: a held key is two actions. Left and
 * right go along the slope, up and down on ladders and ropes, and a diagonal is both at once.
 */
export interface Walk extends ClimberAction {
  readonly kind: "walk";
  readonly direction: Vertical | Horizontal | `${Vertical}-${Horizontal}` | "stop";
}

/** Sets the walking pace, until another `pace` says otherwise. */
export interface Pace extends ClimberAction {
  readonly kind: "pace";
  readonly pace: "rest-step" | "steady" | "faster";
}

/** Clips a cowstail onto the next rope. */
export interface Clip extends ClimberAction {
  readonly kind: "clip";
  readonly cowstail: "first" | "second";
}

/** Takes a cowstail off its rope, which is possible and dangerous. */
export interface Unclip extends ClimberAction {
  readonly kind: "unclip";
  readonly cowstail: "first" | "second";
}

/** Holds the jumar, sliding it along the fixed rope, or lets it go. */
export interface Jumar extends ClimberAction {
  readonly kind: "jumar";
  readonly held: boolean;
}

/** Places the ice axe or the crampons at a point on the slope, in metres. */
export interface Tool extends ClimberAction {
  readonly kind: "tool";
  readonly tool: "ice-axe" | "crampons";
  readonly x: number;
  readonly y: number;
}

/** Turns the oxygen flow up or down a notch. */
export interface Oxygen extends ClimberAction {
  readonly kind: "oxygen";
  readonly change: "up" | "down";
}

/** Checks symptoms, the pulse oximeter and the fingers. */
export interface CheckSelf extends ClimberAction {
  readonly kind: "check-self";
}

/** Says a ready phrase on the radio. */
export interface Radio extends ClimberAction {
  readonly kind: "radio";
  readonly channel: "guide" | "base-camp" | "group";
  readonly phrase: string;
}

/** Sets up a tent where the climber stands, in camp. */
export interface SetUpTent extends ClimberAction {
  readonly kind: "set-up-tent";
}

/**
 * Everything a climber can do: the spec's controls table (Gameplay). It's all the core ever hears:
 * the input layer (#18) turns keys, the mouse, touch and a gamepad into these, and an NPC's
 * agent sends the same. Plain data, because replays and the room server keep and send them.
 */
export type GameAction =
  Walk | Pace | Clip | Unclip | Jumar | Tool | Oxygen | CheckSelf | Radio | SetUpTent;
