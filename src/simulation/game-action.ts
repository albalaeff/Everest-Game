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

/** Turns to face out of the slope, toward the viewer, standing (#235): the first push back the
 * way a climber came, which the next `walk` turns into a walk, side-on again. */
export interface Turn extends ClimberAction {
  readonly kind: "turn";
  readonly toward: "viewer";
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

/** Hauls a partner who hangs on the rope below up to the edge, while held, or lets go (#209). */
export interface Haul extends ClimberAction {
  readonly kind: "haul";
  readonly held: boolean;
}

/** Places the ice axe or the crampons at a point on the slope, in metres. */
export interface Tool extends ClimberAction {
  readonly kind: "tool";
  readonly tool: "ice-axe" | "crampons";
  readonly x: number;
  readonly y: number;
}

/** In a camp: takes one of an item from its store into the pack, or leaves one there: a jumar, a
 * second ice tool, a litre of water, a bar of food or a bottle of oxygen (`Packs`). */
export interface PackChange extends ClimberAction {
  readonly kind: "pack";
  readonly item: "jumar" | "ice-tool" | "water" | "food" | "oxygen";
  readonly change: "take" | "leave";
}

/** Drinks from the water in the pack, or eats a bar of its food. */
export interface UseItem extends ClimberAction {
  readonly kind: "use";
  readonly item: "water" | "food";
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

/** Works the satellite tracker a climber carries (#260): starts its tracking or stops it, sends a
 * check-in to Base Camp, or raises its SOS. */
export interface Tracker extends ClimberAction {
  readonly kind: "tracker";
  readonly do: "track" | "stop" | "check-in" | "sos";
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
  | Walk
  | Turn
  | Pace
  | Clip
  | Unclip
  | Jumar
  | Haul
  | Tool
  | PackChange
  | UseItem
  | Oxygen
  | CheckSelf
  | Radio
  | Tracker
  | SetUpTent;

/**
 * A climber let go: stopped where they stand, at a steady pace, the jumar's slide and any haul let
 * go. What a
 * climber does when the releases of whoever steered them will never come: a room's player who
 * left, a climb alone resumed from a save made mid-stride (docs/conventions/room-server.md).
 */
export class LetGo {
  constructor(private readonly climber: ClimberId) {}

  actions(): readonly GameAction[] {
    const { climber } = this;
    return [
      { kind: "walk", climber, direction: "stop" },
      { kind: "pace", climber, pace: "steady" },
      { kind: "jumar", climber, held: false },
      { kind: "haul", climber, held: false },
    ];
  }
}
