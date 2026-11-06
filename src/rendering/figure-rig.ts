import { Container } from "pixi.js";

import { ClimberPose } from "./climber-pose";
import type { Foot, Joint, Pose } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";

/** A figure's parts, each drawn once in the frame of what it's on (`FigureShapes`): each limb's
 * pair, the near one first, the boots, the pack and the torso, the neck and the head. */
export interface RigParts {
  readonly thighs: readonly [Container, Container];
  readonly shins: readonly [Container, Container];
  readonly boots: readonly [Container, Container];
  readonly upperArms: readonly [Container, Container];
  readonly forearms: readonly [Container, Container];
  readonly pack: Container;
  readonly torso: Container;
  readonly neck: Container;
  readonly head: Container;
}

/**
 * A climber's figure as a rig (#168): its parts drawn once, each in its own frame, and moved each
 * frame to where `ClimberPose` has its bones, so a stride costs no drawing. A limb is shaded from
 * one side of it to the other, and turned over to keep its lit side towards the light as it
 * swings. What the parts look like is the subclass's: the climber in their kit, or the rim of
 * light round them.
 */
export abstract class FigureRig<Parts extends RigParts = RigParts> extends Container {
  /** Where the light on the figure comes from, in its own frame: ahead of the climber, above. */
  static readonly LIGHT: Joint = { x: 0.62, y: 0.78 };
  /** The parts' shapes, cut once for every figure. */
  protected static readonly SHAPES = new FigureShapes();
  /** How far past square to the light a limb swings before its lit side turns over, so it
   * doesn't flicker there. */
  private static readonly TURN = 0.2;

  constructor(protected readonly parts: Parts) {
    super();
  }

  /** Moves the parts to the pose, the chest swollen by `swell` of its depth with the breath. */
  place(pose: Pose, swell: number): void {
    const { parts } = this;
    for (const side of [0, 1] as const) {
      const leg = pose.legs[side];
      const arm = pose.arms[side];
      FigureRig.bone(parts.thighs[side], leg.root, leg.middle);
      FigureRig.bone(parts.shins[side], leg.middle, leg.end);
      FigureRig.bone(parts.upperArms[side], arm.root, arm.middle);
      FigureRig.bone(parts.forearms[side], arm.middle, arm.end);
      FigureRig.foot(parts.boots[side], pose.feet[side]);
    }
    const { pelvis, shoulder, head } = pose;
    const spine = Math.atan2(shoulder.y - pelvis.y, shoulder.x - pelvis.x) - Math.PI / 2;
    for (const part of [parts.pack, parts.torso]) {
      part.position.set(pelvis.x, pelvis.y);
      part.rotation = spine;
    }
    parts.torso.scale.x = 1 + swell;
    FigureRig.bone(parts.neck, shoulder, head);
    parts.head.position.set(head.x, head.y);
    parts.head.rotation = pose.gaze;
  }

  /** Where a point of a part's own frame is in the figure's, as the part was last placed. */
  protected static at(part: Container, local: Joint): Joint {
    const cos = Math.cos(part.rotation);
    const sin = Math.sin(part.rotation);
    const x = local.x * part.scale.x;
    const y = local.y * part.scale.y;
    return { x: part.x + x * cos - y * sin, y: part.y + x * sin + y * cos };
  }

  /** A part along a bone, from the joint it hangs from to the next. Its lit side is its +y, which
   * faces (−sin, cos) of the bone's angle, and is turned over once that's away from the light. */
  private static bone(part: Container, from: Joint, to: Joint): void {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    part.position.set(from.x, from.y);
    part.rotation = angle;
    const towards = -Math.sin(angle) * FigureRig.LIGHT.x + Math.cos(angle) * FigureRig.LIGHT.y;
    if (towards < -FigureRig.TURN) {
      part.scale.y = -1;
    } else if (towards > FigureRig.TURN) {
      part.scale.y = 1;
    }
  }

  /** A boot on its sole under the ankle, turned as the foot is. */
  private static foot(part: Container, foot: Foot): void {
    const { ankle, angle } = foot;
    part.position.set(
      ankle.x + ClimberPose.ANKLE * Math.sin(angle),
      ankle.y - ClimberPose.ANKLE * Math.cos(angle),
    );
    part.rotation = angle;
  }
}
