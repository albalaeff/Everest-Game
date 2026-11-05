import { Container, Graphics } from "pixi.js";

import type { ClimberView } from "../physics";
import type { BodyView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Joint, Limb, Pose } from "./climber-pose";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";

/**
 * A climber drawn in metres with the feet at the origin, facing +x and flipped to face the way
 * they last walked: a figure in a down suit, boots and crampons, a pack with its bottle, a
 * harness with the two cowstails, hood, mask and goggles, and a headlamp whose cone shows at
 * night. Its joints are `ClimberPose`'s, paced by the ground the physics has them cover, and its
 * chest and breath cloud `Breathing`'s, by the altitude and the body; a fallen climber goes over,
 * and a dead one lies flat and dim, with no words on the screen (#24). It reads the physics and
 * the body each frame and keeps only the picture's own: the pose, the breath, the way it faces
 * and how far it's come.
 */
export class ClimberFigure extends Container {
  /** From the soles to the top of the head. */
  static readonly HEIGHT_METRES = 1.77;
  private static readonly DEAD_ALPHA = 0.6;
  /** The limbs' and the body's widths, in metres. */
  private static readonly LEG = 0.17;
  private static readonly ARM = 0.13;
  private static readonly TORSO = 0.34;
  private static readonly BOOT = { length: 0.27, height: 0.12 };
  private static readonly CRAMPON_POINTS = 4;
  private static readonly PACK = { width: 0.28, height: 0.5 };
  private static readonly BOTTLE = { width: 0.1, height: 0.34 };
  private static readonly MITTEN = 0.08;
  /** How far the chest swells with a breath, as a share of the torso's width. */
  private static readonly CHEST_SWELL = 0.07;
  /** The breath cloud: how far ahead of the mask it forms, how big it gets, how far it drifts. */
  private static readonly BREATH_AHEAD = 0.16;
  private static readonly BREATH_RADIUS = 0.11;
  private static readonly BREATH_DRIFT = 0.18;
  /** The headlamp's cone: how far it reaches and how wide it opens, in metres, how far it tips
   * down onto the snow ahead, and how bright it is at its brightest. */
  private static readonly LAMP_REACH = 4.5;
  private static readonly LAMP_SPREAD = 1.3;
  private static readonly LAMP_DOWN = 0.35;
  private static readonly LAMP_ALPHA = 0.26;
  /** How far the far side of the body is shaded. */
  private static readonly FAR_SHADE = 0.25;

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly lamp = new Graphics();
  private readonly body = new Graphics();
  private readonly breath = new Graphics();
  private facing: 1 | -1 = 1;
  private travelled = 0;
  private last: Joint | null = null;

  constructor(private readonly suit: number) {
    super();
    this.addChild(this.lamp, this.body, this.breath);
  }

  /** Puts the figure where the climber is and draws them as they are this frame, `seconds`
   * after the last, as the physics and the body show them, in the frame's light, and no smaller
   * than `size` allows. */
  show(
    climber: ClimberView,
    body: BodyView,
    atmosphere: Atmosphere,
    seconds: number,
    size: LeastSize,
  ): void {
    this.position.set(climber.x, climber.y);
    if (climber.walking.includes("left")) {
      this.facing = -1;
    } else if (climber.walking.includes("right")) {
      this.facing = 1;
    }
    if (this.last !== null && !climber.falling) {
      this.travelled += Math.hypot(climber.x - this.last.x, climber.y - this.last.y);
    }
    this.last = { x: climber.x, y: climber.y };
    const grown = size.climber(ClimberFigure.HEIGHT_METRES);
    this.scale.set(this.facing * grown, grown);
    const pose = this.pose.advance(seconds, {
      travelled: this.travelled,
      moving: climber.moving,
      falling: climber.falling,
      dead: climber.dead,
      onRope: climber.first !== null,
      onLadder: climber.ladder !== null,
      tiredness: body.tiredness,
      pace: body.pace,
    });
    const moving = climber.moving && !climber.falling && !climber.dead;
    if (!climber.dead) {
      this.breathing.advance(seconds, Breathing.period(climber.altitude, body.tiredness, moving));
    }
    // Over onto the back, whichever way they face: the layer's y is up, so the sign is turned.
    this.rotation = pose.tilt * this.facing;
    this.alpha = climber.dead ? ClimberFigure.DEAD_ALPHA : 1;
    this.draw(pose, climber.dead);
    this.drawLamp(pose, atmosphere, climber.dead);
    this.drawBreath(pose, climber.dead);
  }

  private draw(pose: Pose, dead: boolean): void {
    const g = this.body;
    const { suit } = this;
    const farSuit = Palette.shaded(suit, ClimberFigure.FAR_SHADE);
    const farBoots = Palette.shaded(Palette.BOOTS, ClimberFigure.FAR_SHADE);
    const [nearLeg, farLeg] = pose.legs;
    const [nearArm, farArm] = pose.arms;
    g.clear();
    // The far side first: the far leg, the pack on the back, the far arm.
    ClimberFigure.limb(g, farLeg, ClimberFigure.LEG, farSuit);
    ClimberFigure.boot(g, farLeg, farBoots);
    ClimberFigure.pack(g, pose);
    ClimberFigure.limb(g, farArm, ClimberFigure.ARM, farSuit);
    ClimberFigure.mitten(g, farArm.end, farBoots);
    // The torso, swelling with each breath, its baffles and the harness.
    const swell = 1 + ClimberFigure.CHEST_SWELL * this.breathing.chest;
    g.moveTo(pose.pelvis.x, pose.pelvis.y)
      .lineTo(pose.shoulder.x, pose.shoulder.y)
      .stroke({ width: ClimberFigure.TORSO * swell, color: suit, cap: "round" });
    ClimberFigure.baffles(g, pose, suit);
    ClimberFigure.harness(g, pose);
    // The near side: the near leg and arm, then the hood, the mask, the goggles and the lamp.
    ClimberFigure.limb(g, nearLeg, ClimberFigure.LEG, suit);
    ClimberFigure.boot(g, nearLeg, Palette.BOOTS);
    ClimberFigure.limb(g, nearArm, ClimberFigure.ARM, suit);
    ClimberFigure.mitten(g, nearArm.end, Palette.BOOTS);
    ClimberFigure.head(g, pose, suit, dead);
  }

  private static limb(g: Graphics, limb: Limb, width: number, colour: number): void {
    g.moveTo(limb.root.x, limb.root.y)
      .lineTo(limb.middle.x, limb.middle.y)
      .lineTo(limb.end.x, limb.end.y)
      .stroke({ width, color: colour, cap: "round", join: "round" });
  }

  /** A boot on the foot, its toe forward, and the crampon's points under it. */
  private static boot(g: Graphics, leg: Limb, colour: number): void {
    const { length, height } = ClimberFigure.BOOT;
    const foot = leg.end;
    const back = foot.x - length * 0.4;
    const sole = foot.y - height * 0.25;
    g.roundRect(back, sole, length, height, 0.04).fill(colour);
    for (let point = 0; point < ClimberFigure.CRAMPON_POINTS; point += 1) {
      const x = back + length * ((point + 0.5) / ClimberFigure.CRAMPON_POINTS);
      g.moveTo(x, sole).lineTo(x, sole - 0.05);
    }
    g.stroke({ width: 0.025, color: Palette.CRAMPONS, cap: "round" });
  }

  private static mitten(g: Graphics, hand: Joint, colour: number): void {
    g.circle(hand.x, hand.y, ClimberFigure.MITTEN).fill(colour);
  }

  /** The pack on the back, hung from the shoulders along the spine, with the bottle in it. */
  private static pack(g: Graphics, pose: Pose): void {
    const { pelvis, shoulder } = pose;
    const dx = shoulder.x - pelvis.x;
    const dy = shoulder.y - pelvis.y;
    const spine = Math.hypot(dx, dy) || 1;
    const up = { x: dx / spine, y: dy / spine };
    // Behind the spine: its normal, which points to -x standing.
    const back = { x: -up.y, y: up.x };
    const { width, height } = ClimberFigure.PACK;
    const bottle = ClimberFigure.BOTTLE;
    const middle = {
      x: pelvis.x + up.x * spine * 0.55 + back.x * (ClimberFigure.TORSO / 2 + width * 0.35),
      y: pelvis.y + up.y * spine * 0.55 + back.y * (ClimberFigure.TORSO / 2 + width * 0.35),
    };
    const corners: readonly (readonly [number, number])[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const box = (at: Joint, w: number, h: number): number[] => {
      const points: number[] = [];
      for (const [sx, sy] of corners) {
        const across = (sx * w) / 2;
        const along = (sy * h) / 2;
        points.push(at.x + back.x * across + up.x * along, at.y + back.y * across + up.y * along);
      }
      return points;
    };
    g.poly(box(middle, width, height)).fill(Palette.PACK);
    const bottleAt = {
      x: middle.x + back.x * (width / 2 + bottle.width * 0.3) + up.x * 0.04,
      y: middle.y + back.y * (width / 2 + bottle.width * 0.3) + up.y * 0.04,
    };
    g.poly(box(bottleAt, bottle.width, bottle.height)).fill(Palette.BOTTLE);
    const valve = {
      x: bottleAt.x + up.x * (bottle.height / 2 + 0.025),
      y: bottleAt.y + up.y * (bottle.height / 2 + 0.025),
    };
    g.poly(box(valve, bottle.width * 0.5, 0.05)).fill(Palette.CRAMPONS);
  }

  /** The down suit's baffles: a few lines across the torso, in the suit's shade. */
  private static baffles(g: Graphics, pose: Pose, suit: number): void {
    const { pelvis, shoulder } = pose;
    const dx = shoulder.x - pelvis.x;
    const dy = shoulder.y - pelvis.y;
    const spine = Math.hypot(dx, dy) || 1;
    const across = { x: -dy / spine, y: dx / spine };
    const half = ClimberFigure.TORSO * 0.42;
    for (const share of [0.3, 0.55, 0.8]) {
      const x = pelvis.x + dx * share;
      const y = pelvis.y + dy * share;
      g.moveTo(x + across.x * half, y + across.y * half).lineTo(
        x - across.x * half,
        y - across.y * half,
      );
    }
    g.stroke({ width: 0.02, color: Palette.shaded(suit, 0.18), cap: "round" });
  }

  /** The harness around the hips, and the two cowstails hanging from it. */
  private static harness(g: Graphics, pose: Pose): void {
    const { pelvis } = pose;
    const half = ClimberFigure.TORSO * 0.55;
    g.moveTo(pelvis.x - half, pelvis.y + 0.02)
      .lineTo(pelvis.x + half, pelvis.y + 0.02)
      .stroke({ width: 0.05, color: Palette.HARNESS, cap: "round" });
    const tie = { x: pelvis.x + half * 0.6, y: pelvis.y };
    g.moveTo(tie.x, tie.y)
      .lineTo(tie.x + 0.08, tie.y - 0.2)
      .moveTo(tie.x, tie.y)
      .lineTo(tie.x + 0.16, tie.y - 0.14)
      .stroke({ width: 0.025, color: Palette.JUMAR, cap: "round" });
  }

  /** The hood over the head, the mask and the goggles on its face, and the headlamp's band. */
  private static head(g: Graphics, pose: Pose, suit: number, dead: boolean): void {
    const { head, shoulder } = pose;
    const radius = ClimberPose.HEAD_RADIUS;
    g.moveTo(shoulder.x, shoulder.y)
      .lineTo(head.x, head.y)
      .stroke({ width: radius * 1.6, color: suit, cap: "round" });
    g.circle(head.x, head.y, radius * 1.15).fill(suit);
    g.circle(head.x + radius * 0.45, head.y - radius * 0.1, radius * 0.75).fill(Palette.MASK);
    g.ellipse(head.x + radius * 0.55, head.y + radius * 0.4, radius * 0.5, radius * 0.32).fill(
      dead ? Palette.shaded(Palette.GOGGLES, 0.5) : Palette.GOGGLES,
    );
    const lamp = ClimberFigure.lampAt(pose);
    g.moveTo(head.x - radius * 0.9, lamp.y)
      .lineTo(lamp.x, lamp.y)
      .stroke({ width: 0.035, color: Palette.BOOTS });
    g.circle(lamp.x, lamp.y, 0.04).fill(Palette.LAMP);
  }

  /** Where the headlamp sits: on the forehead, over the goggles. */
  private static lampAt(pose: Pose): Joint {
    const radius = ClimberPose.HEAD_RADIUS;
    return { x: pose.head.x + radius * 0.95, y: pose.head.y + radius * 0.55 };
  }

  /** The headlamp's cone from the forehead, ahead and a little down, as bright as the hour asks:
   * a wide faint cone with a narrower brighter one inside it. */
  private drawLamp(pose: Pose, atmosphere: Atmosphere, dead: boolean): void {
    const { lamps } = atmosphere.light;
    this.lamp.clear();
    this.lamp.visible = lamps > 0.01 && !dead;
    if (!this.lamp.visible) {
      return;
    }
    const from = ClimberFigure.lampAt(pose);
    const reach = ClimberFigure.LAMP_REACH;
    const spread = ClimberFigure.LAMP_SPREAD;
    const tip = { x: from.x + reach, y: from.y - reach * ClimberFigure.LAMP_DOWN };
    const alpha = ClimberFigure.LAMP_ALPHA * lamps;
    this.lamp
      .poly([from.x, from.y, tip.x, tip.y - spread, tip.x, tip.y + spread * 0.6])
      .fill({ color: Palette.LAMP, alpha });
    this.lamp
      .poly([from.x, from.y, tip.x, tip.y - spread * 0.45, tip.x, tip.y + spread * 0.2])
      .fill({ color: Palette.LAMP, alpha: alpha * 0.7 });
  }

  /** The breath cloud out of the mask on each breath out, drifting ahead and thinning. */
  private drawBreath(pose: Pose, dead: boolean): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const radius = ClimberPose.HEAD_RADIUS;
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    const x =
      pose.head.x + radius + ClimberFigure.BREATH_AHEAD + ClimberFigure.BREATH_DRIFT * share;
    const y = pose.head.y - radius * 0.2 + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: Palette.BREATH, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: Palette.BREATH, alpha: 0.3 * alpha });
  }
}
