import { Container, Graphics } from "pixi.js";

import type { ClimberView } from "../physics";
import type { LeastSize } from "./least-size";

/**
 * A climber's silhouette, in metres with the feet at the origin: a bright suit, a backpack and a
 * mask, facing the way they last walked, and off their feet in a fall. A still stand-in until the
 * animation comes with the final style (#86).
 */
export class ClimberFigure extends Container {
  static readonly PLAYER_SUIT = 0xe8412c;
  static readonly OTHER_SUIT = 0xf5c518;
  private static readonly BOOTS = 0x202020;
  private static readonly PACK = 0x2a2f36;
  private static readonly MASK = 0x15181c;
  private static readonly GOGGLES = 0x9fd3ff;
  /** How far over a fallen climber lies. */
  private static readonly FALLEN_RADIANS = 1.2;
  /** From the soles to the top of the head. */
  private static readonly HEIGHT_METRES = 1.77;

  private facing: 1 | -1 = 1;

  constructor(suit: number) {
    super();
    const graphics = new Graphics();
    graphics.roundRect(-0.52, 0.86, 0.28, 0.6, 0.08).fill(ClimberFigure.PACK);
    graphics.rect(-0.22, 0, 0.14, 0.82).fill(suit);
    graphics.rect(0.06, 0, 0.14, 0.82).fill(suit);
    graphics.rect(-0.26, 0, 0.22, 0.14).fill(ClimberFigure.BOOTS);
    graphics.rect(0.04, 0, 0.24, 0.14).fill(ClimberFigure.BOOTS);
    graphics.roundRect(-0.28, 0.78, 0.56, 0.72, 0.12).fill(suit);
    graphics.roundRect(0.18, 0.95, 0.14, 0.5, 0.06).fill(suit);
    graphics.circle(0.02, 1.62, 0.15).fill(suit);
    graphics.circle(0.08, 1.6, 0.09).fill(ClimberFigure.MASK);
    graphics.circle(0.1, 1.68, 0.05).fill(ClimberFigure.GOGGLES);
    this.addChild(graphics);
  }

  /** Puts the figure where the climber is, as the physics shows them this frame, and no smaller
   * than `size` allows. */
  show(climber: ClimberView, size: LeastSize): void {
    this.position.set(climber.x, climber.y);
    if (climber.walking.includes("left")) {
      this.facing = -1;
    } else if (climber.walking.includes("right")) {
      this.facing = 1;
    }
    const grown = size.climber(ClimberFigure.HEIGHT_METRES);
    this.scale.set(this.facing * grown, grown);
    this.rotation = climber.falling ? ClimberFigure.FALLEN_RADIANS * this.facing : 0;
  }
}
