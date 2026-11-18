import { Graphics } from "pixi.js";

import type { Injury } from "../physics";
import type { Joint, Limb, Pose } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import { Palette } from "./palette";

/** What shows on a hurt limb: whether it bleeds still, and what first aid has put on it. */
export interface Dressed {
  readonly part: Injury["part"];
  readonly bleeding: boolean;
  readonly tourniquet: boolean;
  readonly splint: boolean;
  readonly wrap: boolean;
}

/**
 * What a hard landing left on a climber's limb and what first aid has put on it (#241), drawn on
 * the figure's near leg or arm each frame, in the figure's metres: the blood on a bone broken
 * through the skin, until a tourniquet is on; the tourniquet, a dark strap high on the limb with
 * its rod; the splint, a strip of orange foam along the shin or the forearm, bound on with turns
 * of wrap, a broken arm's hung from the neck in a sling; and a sprain's bandage, wound round the
 * ankle or the wrist. A sprain not yet wrapped shows nothing: they limp. It keeps nothing.
 */
export class Dressing extends Graphics {
  /** Where up a limb's upper bone the tourniquet goes, as a share from its root, and how wide its
   * strap and how long its rod are, in metres. */
  private static readonly TOURNIQUET = { at: 0.3, width: 0.045, rod: 0.09 };
  /** The splint: from how far up the lower bone to how far down it, as shares; how far it stands
   * off the limb's side; how thick it is; and where its turns of wrap go round it. */
  private static readonly SPLINT = {
    from: -0.12,
    to: 0.94,
    off: 0.012,
    thick: 0.03,
    turns: [0.06, 0.34, 0.62, 0.88],
    wrap: 0.04,
  };
  /** A sprain's bandage: the turns round the joint at the limb's end, as shares of the lower bone
   * from its root, and how wide each is. */
  private static readonly BANDAGE = { turns: [0.8, 0.9, 1], width: 0.045 };
  /** The blood: spots this big along the lower bone, at these shares of it and this far to the
   * side of it. */
  private static readonly BLOOD: readonly { at: number; off: number; radius: number }[] = [
    { at: 0.42, off: 0.02, radius: 0.034 },
    { at: 0.55, off: -0.015, radius: 0.026 },
    { at: 0.33, off: -0.03, radius: 0.018 },
  ];
  private static readonly SLING_WIDTH = 0.03;

  /** What shows for these injuries, a limb at a time: nothing for a sprain until it's wrapped. */
  static of(injuries: readonly Injury[]): readonly Dressed[] {
    return injuries
      .map(({ part, kind, tourniquet, splinted }) => ({
        part,
        bleeding: kind === "open-fracture" && !tourniquet,
        tourniquet,
        splint: kind !== "sprain" && splinted,
        wrap: kind === "sprain" && splinted,
      }))
      .filter(({ bleeding, tourniquet, splint, wrap }) => bleeding || tourniquet || splint || wrap);
  }

  /** Where first aid goes on a climber in this `pose` with these injuries: the middle of the
   * near shin or forearm that's broken, or the joint that's sprained; the leg's before the arm's,
   * and none unhurt. */
  static wound(pose: Pose, injuries: readonly Injury[]): Joint | null {
    const hurt = injuries.find(({ part }) => part === "leg") ?? injuries[0];
    if (hurt === undefined) {
      return null;
    }
    const limb = hurt.part === "leg" ? pose.legs[0] : pose.arms[0];
    return hurt.kind === "sprain" ? limb.end : Dressing.along(limb.middle, limb.end, 0.5);
  }

  /** Draws what shows for `injuries` on the near limbs of `pose`. */
  show(pose: Pose, injuries: readonly Injury[]): void {
    this.clear();
    for (const dressed of Dressing.of(injuries)) {
      const leg = dressed.part === "leg";
      const limb = leg ? pose.legs[0] : pose.arms[0];
      const down = FigureShapes.DOWN[leg ? "shin" : "forearm"];
      const upper = FigureShapes.DOWN[leg ? "thigh" : "upperArm"];
      if (dressed.bleeding) {
        this.bleed(limb);
      }
      if (dressed.splint) {
        if (!leg) {
          this.sling(limb, pose.shoulder);
        }
        this.splint(limb, (down.root + down.end) / 2);
      }
      if (dressed.wrap) {
        this.bandage(limb, down.end);
      }
      if (dressed.tourniquet) {
        this.tourniquet(limb, (upper.root + upper.end) / 2);
      }
    }
  }

  /** The blood on the lower bone, soaked through the suit. */
  private bleed({ middle, end }: Limb): void {
    for (const { at, off, radius } of Dressing.BLOOD) {
      const spot = Dressing.beside(middle, end, at, off);
      this.circle(spot.x, spot.y, radius);
    }
    this.fill(Palette.BLOOD);
  }

  /** The tourniquet round the upper bone, `half` its thickness there: the strap, and its rod
   * along the limb, turned tight. */
  private tourniquet({ root, middle }: Limb, half: number): void {
    const { at, width, rod } = Dressing.TOURNIQUET;
    const [from, to] = [
      Dressing.beside(root, middle, at, half),
      Dressing.beside(root, middle, at, -half),
    ];
    this.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width, color: Palette.TOURNIQUET, cap: "butt" });
    const length = Math.hypot(middle.x - root.x, middle.y - root.y) || 1;
    const share = rod / 2 / length;
    const [start, finish] = [
      Dressing.beside(root, middle, at - share, half * 0.3),
      Dressing.beside(root, middle, at + share, half * 0.3),
    ];
    this.moveTo(start.x, start.y)
      .lineTo(finish.x, finish.y)
      .stroke({ width: width * 0.3, color: Palette.TOURNIQUET_ROD, cap: "round" });
  }

  /** The splint along the lower bone, on the side that shows, `half` the limb's thickness off
   * its middle, bound on with turns of wrap right round the limb. */
  private splint({ middle, end }: Limb, half: number): void {
    const { from, to, off, thick, turns, wrap } = Dressing.SPLINT;
    const side = half + off;
    const [start, finish] = [
      Dressing.beside(middle, end, from, side),
      Dressing.beside(middle, end, to, side),
    ];
    this.moveTo(start.x, start.y)
      .lineTo(finish.x, finish.y)
      .stroke({ width: thick + 0.012, color: Palette.SPLINT_EDGE, cap: "round" });
    this.moveTo(start.x, start.y)
      .lineTo(finish.x, finish.y)
      .stroke({ width: thick, color: Palette.SPLINT, cap: "round" });
    for (const turn of turns) {
      const [over, under] = [
        Dressing.beside(middle, end, turn, side + thick / 2),
        Dressing.beside(middle, end, turn + 0.03, -half),
      ];
      this.moveTo(over.x, over.y)
        .lineTo(under.x, under.y)
        .stroke({ width: wrap, color: Palette.BANDAGE, cap: "butt" });
    }
  }

  /** A sprain's bandage, wound round the joint at the limb's end, `half` its thickness there. */
  private bandage({ middle, end }: Limb, half: number): void {
    const { turns, width } = Dressing.BANDAGE;
    turns.forEach((turn, index) => {
      // Each turn crosses the one before, as a figure of eight does.
      const lean = index % 2 === 0 ? 0.04 : -0.04;
      const [over, under] = [
        Dressing.beside(middle, end, turn + lean, half),
        Dressing.beside(middle, end, turn - lean, -half),
      ];
      this.moveTo(over.x, over.y)
        .lineTo(under.x, under.y)
        .stroke({
          width,
          color: index % 2 === 0 ? Palette.BANDAGE : Palette.BANDAGE_SHADE,
          cap: "butt",
        });
    });
  }

  /** A broken arm's sling: from the wrist up to the neck, behind the splint. */
  private sling({ middle, end }: Limb, shoulder: Joint): void {
    const wrist = Dressing.along(middle, end, 0.85);
    const elbow = Dressing.along(middle, end, 0.1);
    this.moveTo(elbow.x, elbow.y)
      .lineTo(shoulder.x, shoulder.y + 0.02)
      .lineTo(wrist.x, wrist.y)
      .stroke({ width: Dressing.SLING_WIDTH, color: Palette.BANDAGE_SHADE, join: "round" });
  }

  /** The point `share` of the way along a bone. */
  private static along(from: Joint, to: Joint, share: number): Joint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  /** The point `share` of the way along a bone and `off` to its left, looking along it. */
  private static beside(from: Joint, to: Joint, share: number, off: number): Joint {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: from.x + dx * share - (dy / length) * off,
      y: from.y + dy * share + (dx / length) * off,
    };
  }
}
