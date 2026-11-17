import type { Texts } from "../../interface/texts";

/** The names of the main menu's words, as content/menu.json has them: what the picture is, the
 * route's name, the game's and its motto, who climbs with each choice, and the route's places. */
export type MenuTextName =
  | "picture"
  | "route"
  | "name"
  | "motto"
  | "alone-with"
  | "together-with"
  | "base-camp"
  | "camp-1"
  | "camp-2"
  | "camp-3"
  | "south-col"
  | "south-col-camp"
  | "balcony"
  | "south-summit"
  | "hillary-step"
  | "summit";

/** The main menu's words, in one language of content/menu.json: `alone-with` names the Sherpa
 * where it has `{name}`. */
export type MenuTexts = Texts<MenuTextName>;
