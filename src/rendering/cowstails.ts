import type { Clip, Joint, Pose } from "./climber-pose";
import { RopeBeside } from "./rope-beside";

/**
 * Where the two cowstails' gear is this frame, in the figure's metres (`ClimberPose`): the first
 * ends in the jumar, the second in a carabiner, both tied in at the harness's belay loop.
 * Unclipped, each hangs at the hip. Clipped, the jumar is in the near hand while the pose holds
 * it, the rope lifted through it off the snow behind the climber and down to the snow ahead; where
 * the hand doesn't, up a wall, at the rope's end or in a fall, it's on the rope, slid along it as
 * far as its sling reaches. The carabiner runs on that rope below the jumar, or just ahead of the
 * feet where the rope isn't lifted. A clip is seen to happen: the hand takes the gear off the rope
 * or the hip, holds it at the anchor as the climber bends to it, and puts it on the next rope, or
 * back at the hip. Pure, so it's tested in Node.
 */
export class Cowstails {
  /** Where the slings are tied in, from the pelvis: the belay loop at the harness's front. */
  private static readonly LOOP: Joint = { x: 0.1, y: 0.02 };
  /** Where the jumar and the carabiner hang unclipped, from the pelvis. */
  private static readonly STOWED: readonly [Joint, Joint] = [
    { x: 0.04, y: -0.17 },
    { x: 0.15, y: -0.12 },
  ];
  /** How far along the rope from the belay loop the jumar's sling reaches, where no hand holds it. */
  private static readonly SLUNG = 0.5;
  /** How far the hand must hold the jumar to lift the rope through it; less, and the rope is where
   * it lies: let go as the jumar goes onto a wall's rope, it's under this before the clip puts it
   * there. */
  private static readonly LIFTED = 0.1;
  /** How far the rope through the jumar comes up off the snow behind the feet, and how far ahead
   * of the jumar it lies on the snow again, in metres along it. */
  private static readonly BEHIND = 0.5;
  private static readonly AHEAD = 1.3;
  /** How far ahead of the feet the carabiner runs on the snow, in metres along the rope. */
  private static readonly CARABINER_AHEAD = 0.4;
  /** A clip's share by which the hand has taken the gear, and from which it puts it on. */
  private static readonly TAKEN = 0.25;
  private static readonly PUT = 0.5;

  /** Where both slings are tied in. */
  readonly loop: Joint;
  readonly jumar: Joint;
  readonly carabiner: Joint;
  /** The rope through the jumar, off the snow behind, through it, and down to the snow ahead;
   * none while the jumar is off the rope. */
  readonly through: readonly Joint[];

  /** The gear of a climber in `pose`, on the ropes `ropes` lays beside them by id. */
  constructor(pose: Pose, ropes: (id: string) => RopeBeside) {
    const { pelvis, holding, clips } = pose;
    const [near, far] = pose.arms;
    const [jumarClip, carabinerClip] = clips;
    const feet: Joint = { x: 0, y: 0 };
    const at = (from: Joint): Joint => ({ x: pelvis.x + from.x, y: pelvis.y + from.y });
    const loop = at(Cowstails.LOOP);
    const [jumarStowed, carabinerStowed] = Cowstails.STOWED.map(at) as [Joint, Joint];
    this.loop = loop;
    this.jumar = Cowstails.moved(jumarClip, near.end, (id) =>
      id === null
        ? jumarStowed
        : Cowstails.between(ropes(id).ahead(loop, Cowstails.SLUNG), near.end, holding),
    );
    const jumarOn = Cowstails.on(jumarClip);
    const rope = jumarOn === null ? null : ropes(jumarOn);
    this.through =
      rope === null || holding < Cowstails.LIFTED
        ? []
        : [
            rope.ahead(feet, -Cowstails.BEHIND),
            this.jumar,
            rope.ahead(this.jumar, Cowstails.AHEAD),
          ];
    const lifted = this.through.length > 0 ? new RopeBeside(this.through) : null;
    this.carabiner = Cowstails.moved(carabinerClip, far.end, (id) => {
      if (id === null) {
        return carabinerStowed;
      }
      if (id === jumarOn && lifted !== null) {
        return lifted.nearest(loop);
      }
      return ropes(id).ahead(feet, Cowstails.CARABINER_AHEAD);
    });
  }

  /** The rope a cowstail's gear is on now in its clip, or none. */
  private static on(clip: Clip): string | null {
    return clip.share < Cowstails.PUT ? clip.from : clip.to;
  }

  /** Where a cowstail's gear is in its clip: taken from its place on the rope it came off, or the
   * hip, into the hand, held there, and put in its place on the rope it goes to, or the hip. */
  private static moved(clip: Clip, hand: Joint, place: (id: string | null) => Joint): Joint {
    const { share } = clip;
    if (share < Cowstails.PUT) {
      return Cowstails.between(place(clip.from), hand, Cowstails.eased(share / Cowstails.TAKEN));
    }
    const putting = (share - Cowstails.PUT) / Cowstails.TAKEN;
    return Cowstails.between(hand, place(clip.to), Cowstails.eased(putting));
  }

  /** A share from 0 to 1 eased in and out, held at the ends. */
  private static eased(share: number): number {
    const held = Math.min(Math.max(share, 0), 1);
    return held * held * (3 - 2 * held);
  }

  private static between(from: Joint, to: Joint, share: number): Joint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }
}
