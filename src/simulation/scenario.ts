import type { ClimberId } from "./game-action";
import type { RuleStates } from "./rule";

/**
 * An expedition before it starts (docs/conventions.md → Time and chance): plain data, the same
 * form in a content file, a save and a message.
 */
export interface Scenario {
  /** A whole number that every draw of chance follows from. The page picks a new one for each
   * new expedition, so no two are alike; an old one comes back only to replay. */
  readonly seed: number;
  /** Who climbs, players and NPCs alike. This order settles whose actions go first in a step. */
  readonly climbers: readonly ClimberId[];
  /** The climbers an agent steers (#212), a Sherpa: never a player's seat. None if it's left out,
   * as in the saves from before them. */
  readonly npcs?: readonly ClimberId[];
  /** Each rule's start state, in the form of its save. Conditions set in advance, such as harsh
   * weather, go here, and hold on every seed. */
  readonly start: RuleStates;
}
