import { Container } from "pixi.js";

import type { DeviceKind } from "../simulation";
import { ClimberPose } from "./climber-pose";
import type { DrawnDevice, Joint, Limb, Pose } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import type { DrawnTool } from "./ice-tools";

/** A figure's parts, each drawn once in the frame of what it's on (`FigureShapes`): each limb's
 * pair, the near one first, the boots, the pack and the torso, the neck, the head, the mask, in
 * the head's frame wherever it is, and the ice tools, the axe first, each in its own frame, once
 * as it's held and once strapped to the pack, behind the body. */
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
  readonly mask: Container;
  readonly tools: readonly [Container, Container];
  readonly strapped: readonly [Container, Container];
  /** The devices (#271), each in its own frame, held at the origin with its top along +y: the
   * one in the near hand shows. A rim of light has none. */
  readonly devices?: Readonly<Record<DeviceKind, Container>>;
}

/**
 * A climber's figure as a rig (#168): its parts drawn once, each in its own frame, and moved each
 * frame to where `ClimberPose` has its bones, so a stride costs no drawing. A limb is shaded from
 * one side of it to the other, and turned over to keep its lit side towards the light as it
 * swings. The mask is on the face while the oxygen flows, and hangs from its strap on the chest
 * while it doesn't (#87). Each ice tool is where `IceTools` has it, in the hand or on the pack;
 * the pack is on their back, or off it with the tools strapped to it (#241).
 * What the parts look like is the subclass's: the climber in their kit, or the rim of light round
 * them.
 */
export abstract class FigureRig<Parts extends RigParts = RigParts> extends Container {
  /** Where the light on the figure comes from, in its own frame: ahead of the climber, above. */
  static readonly LIGHT: Joint = { x: 0.62, y: 0.78 };
  /** The parts' shapes, cut once for every figure. */
  protected static readonly SHAPES = new FigureShapes();
  /** How far past square to the light a limb swings before its lit side turns over, so it
   * doesn't flicker there. */
  private static readonly TURN = 0.2;
  /** The mask off the face: its middle, in the head's frame, hangs at this point of the chest, in
   * the torso's, turned this far down from the torso's line, its valve below. */
  private static readonly HUNG = {
    middle: { x: 0.11, y: -0.07 },
    at: { x: 0.2, y: 0.42 },
    turn: -0.9,
  };

  /** How far back from the hand the wrist is, of the forearm: where a watch is worn. */
  private static readonly WRIST = 0.24;

  /** Whether the pack is on their back, with the tools strapped to it. */
  private packed = true;

  constructor(protected readonly parts: Parts) {
    super();
  }

  /** The pack on their back, or off it (#241): a rescuer leaves theirs to carry a casualty
   * there, and the casualty's is left where they lay. From the next time the parts are placed. */
  packOn(on: boolean): void {
    this.packed = on;
  }

  /** Moves the parts to the pose, the chest swollen by `swell` of its depth with the breath, the
   * mask on the face while the oxygen flows, `masked`, and on the chest while it doesn't. */
  place(pose: Pose, swell: number, masked: boolean): void {
    const { parts } = this;
    for (const side of [0, 1] as const) {
      const leg = pose.legs[side];
      const arm = pose.arms[side];
      FigureRig.bone(parts.thighs[side], leg.root, leg.middle);
      FigureRig.bone(parts.shins[side], leg.middle, leg.end);
      FigureRig.bone(parts.upperArms[side], arm.root, arm.middle);
      FigureRig.bone(parts.forearms[side], arm.middle, arm.end);
      FigureRig.foot(parts.boots[side], leg.end, pose.soles[side]);
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
    // The head nods down by `nod`: its x ahead turns towards its -y.
    parts.head.rotation = -pose.nod;
    parts.pack.visible = this.packed;
    FigureRig.wear(parts, masked);
    FigureRig.carry(parts, pose.tools, this.packed);
    FigureRig.hold(parts, pose.device, pose.arms[0]);
  }

  /** The device in the near hand, where the pose has it, its top the way it's held (#271): the
   * watch is on the wrist, a little back from the hand along the forearm, its face out from it. */
  private static hold({ devices }: RigParts, held: DrawnDevice | null, arm: Limb): void {
    if (devices === undefined) {
      return;
    }
    for (const [kind, part] of Object.entries(devices)) {
      part.visible = held !== null && held.kind === kind;
    }
    if (held === null) {
      return;
    }
    const part = devices[held.kind];
    if (held.kind !== "gps") {
      part.position.set(held.at.x, held.at.y);
      // Its top leans forward by `angle`: the layer's y is up, so the turn is the other way.
      part.rotation = -held.angle;
      return;
    }
    const { middle, end } = arm;
    const { WRIST } = FigureRig;
    part.position.set(end.x + (middle.x - end.x) * WRIST, end.y + (middle.y - end.y) * WRIST);
    part.rotation = Math.atan2(end.y - middle.y, end.x - middle.x);
  }

  /** Each ice tool where it's drawn: the part that's held where a hand has it, or the one on the
   * pack where it's strapped, while the pack is `on`; neither for a tool they don't carry. */
  private static carry(
    { tools, strapped }: RigParts,
    drawn: readonly DrawnTool[],
    on: boolean,
  ): void {
    for (const index of [0, 1] as const) {
      const tool = drawn[index];
      const held = tools[index];
      const packed = strapped[index];
      held.visible = tool !== undefined && tool.hand !== null;
      packed.visible = on && tool !== undefined && tool.hand === null;
      if (tool !== undefined) {
        const part = tool.hand === null ? packed : held;
        part.position.set(tool.grip.x, tool.grip.y);
        part.rotation = tool.angle;
      }
    }
  }

  /** The mask over the mouth and nose, where the head is; or off it, hanging on the chest. */
  private static wear({ mask, head, torso }: RigParts, masked: boolean): void {
    if (masked) {
      mask.position.set(head.x, head.y);
      mask.rotation = head.rotation;
      return;
    }
    const { middle, at, turn } = FigureRig.HUNG;
    const chest = FigureRig.at(torso, at);
    const rotation = torso.rotation + turn;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    mask.position.set(
      chest.x - (middle.x * cos - middle.y * sin),
      chest.y - (middle.x * sin + middle.y * cos),
    );
    mask.rotation = rotation;
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

  /** A boot on its sole under the ankle, turned as the sole is. */
  private static foot(part: Container, ankle: Joint, sole: number): void {
    part.position.set(
      ankle.x + ClimberPose.ANKLE * Math.sin(sole),
      ankle.y - ClimberPose.ANKLE * Math.cos(sole),
    );
    part.rotation = sole;
  }
}
