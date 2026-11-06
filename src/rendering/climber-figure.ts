import { Container, FillGradient, Graphics } from "pixi.js";

import type { ClimberView } from "../physics";
import type { BodyView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Beam } from "./beam";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Joint, Limb, Pose } from "./climber-pose";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";

/**
 * A climber drawn in metres with the feet at the origin, facing +x and flipped to face the way
 * they last walked: a figure in a down suit with its baffles, boots and crampons, a pack with its
 * bottle and an ice axe, a harness with the two cowstails, the jumar on the rope in the near hand
 * when clipped, hood, mask and goggles, and a headlamp. It's lit as one figure, as #125's scene
 * is: a rim of the hour's light on the side the sun is, the far side cold, and at night the lamp's
 * beam, soft, ahead and down the slope, with the pool it throws on the snow. Its joints are
 * `ClimberPose`'s, paced by the ground the physics has them cover, and its chest and breath cloud
 * `Breathing`'s, by the altitude and the body; a fallen climber goes over, and a dead one lies
 * flat and dim, with no words on the screen (#24). It reads the physics and the body each frame
 * and keeps only the picture's own: the pose, the breath, the way it faces and how far it's come.
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
  /** The headlamp's beam: how far it reaches, how wide it opens each side of its axis, how far
   * below the slope it tips, all in metres and radians, and how bright it is at its brightest. */
  private static readonly LAMP_REACH = 7;
  private static readonly LAMP_SPREAD = 0.26;
  private static readonly LAMP_DOWN = 0.3;
  private static readonly LAMP_ALPHA = 0.32;
  /** The pool the beam throws on the snow where it comes down, its length and depth, in metres,
   * and its brightness; and the halo round the lamp itself. */
  private static readonly POOL = { length: 3.4, depth: 0.7, alpha: 0.55 };
  private static readonly HALO = { radius: 0.22, alpha: 0.9 };
  /** How far the far side of the body is shaded, and how much of the sky's cold light it takes. */
  private static readonly FAR_SHADE = 0.25;
  private static readonly FAR_COLD = 0.22;
  /** The rim of light on the sun's side: how far past the body it shows, and how strong it is at
   * night, by day and in the glow of dawn and dusk. */
  private static readonly RIM_METRES = 0.025;
  private static readonly RIM_ALPHA = { night: 0.35, day: 0.45, glow: 0.95 };
  /** The rope through the jumar: how far ahead of the hand it comes up off the snow, and how
   * thick it's drawn. */
  private static readonly ROPE_AHEAD = 1.3;
  private static readonly ROPE_METRES = 0.06;
  private static readonly JUMAR_SIZE = { length: 0.14, width: 0.06 };
  /** The ice axe strapped to the pack: its shaft's length and its head's. */
  private static readonly AXE = { shaft: 0.62, head: 0.26 };

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly cone = ClimberFigure.drawCone();
  private readonly pool = ClimberFigure.drawPool();
  private readonly halo = ClimberFigure.drawHalo();
  private readonly rim = new Graphics();
  private readonly body = new Graphics();
  private readonly breath = new Graphics();
  private facing: 1 | -1 = 1;
  private travelled = 0;
  private last: Joint | null = null;
  /** The lamp's beam this frame, in the layer's metres, or none while it's off. */
  private shining: Beam | null = null;

  constructor(private readonly suit: number) {
    super();
    this.addChild(this.pool, this.cone, this.rim, this.body, this.halo, this.breath);
  }

  /** The headlamp's beam as last drawn, in the layer's metres: none by day, or once dead. */
  get beam(): Beam | null {
    return this.shining;
  }

  /** Puts the figure where the climber is and draws them as they are this frame, `seconds`
   * after the last, as the physics and the body show them, in the frame's light, on ground that
   * rises `rise` a metre to the right, and no smaller than `size` allows. */
  show(
    climber: ClimberView,
    body: BodyView,
    atmosphere: Atmosphere,
    seconds: number,
    size: LeastSize,
    rise = 0,
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
    const ahead = rise * this.facing;
    const pose = this.pose.advance(seconds, {
      travelled: this.travelled,
      moving: climber.moving,
      falling: climber.falling,
      dead: climber.dead,
      onRope: climber.first !== null,
      clipped: [climber.first, climber.second],
      onLadder: climber.ladder !== null,
      rise: ahead,
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
    this.draw(pose, atmosphere, climber.dead, ahead);
    const upright = !climber.dead && !climber.falling;
    this.drawLamp(pose, atmosphere, upright ? ahead : null, grown);
    this.drawBreath(pose, atmosphere, climber.dead);
  }

  private draw(pose: Pose, atmosphere: Atmosphere, dead: boolean, rise: number): void {
    const g = this.body;
    const { suit } = this;
    const { palette } = atmosphere;
    const cold = (colour: number): number =>
      Palette.mix(
        Palette.shaded(colour, ClimberFigure.FAR_SHADE),
        palette.skyTop,
        ClimberFigure.FAR_COLD,
      );
    const farSuit = cold(suit);
    const farBoots = cold(Palette.BOOTS);
    const [nearLeg, farLeg] = pose.legs;
    const [nearArm, farArm] = pose.arms;
    this.drawRim(pose, atmosphere, dead);
    g.clear();
    // The far side first: the far leg, the pack on the back with the axe, the far arm.
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
    ClimberFigure.jumar(g, pose, rise);
    // The near side: the near leg and arm, then the hood, the mask, the goggles and the lamp.
    ClimberFigure.limb(g, nearLeg, ClimberFigure.LEG, suit);
    ClimberFigure.boot(g, nearLeg, Palette.BOOTS);
    ClimberFigure.limb(g, nearArm, ClimberFigure.ARM, suit);
    ClimberFigure.mitten(g, nearArm.end, Palette.BOOTS);
    ClimberFigure.head(g, pose, suit, dead);
  }

  /** The rim of the hour's light along the body's edge on the side the sun is: the same shapes a
   * little wider and moved towards it, behind the body, so only that edge shows. */
  private drawRim(pose: Pose, atmosphere: Atmosphere, dead: boolean): void {
    const { light, palette } = atmosphere;
    const r = this.rim;
    r.clear();
    r.visible = !dead;
    if (dead) {
      return;
    }
    const strength = ClimberFigure.RIM_ALPHA;
    r.alpha =
      (strength.night + (strength.day - strength.night) * light.daylight) * (1 - light.glow) +
      strength.glow * light.glow;
    const edge = ClimberFigure.RIM_METRES;
    const side = light.glowSide * this.facing;
    const shift = (joint: Joint): Joint => ({ x: joint.x + side * edge, y: joint.y + edge * 0.4 });
    const shiftLimb = (limb: Limb): Limb => ({
      root: shift(limb.root),
      middle: shift(limb.middle),
      end: shift(limb.end),
    });
    for (const leg of pose.legs) {
      ClimberFigure.limb(r, shiftLimb(leg), ClimberFigure.LEG + edge, palette.rim);
    }
    for (const arm of pose.arms) {
      ClimberFigure.limb(r, shiftLimb(arm), ClimberFigure.ARM + edge, palette.rim);
    }
    const pelvis = shift(pose.pelvis);
    const shoulder = shift(pose.shoulder);
    const head = shift(pose.head);
    r.moveTo(pelvis.x, pelvis.y)
      .lineTo(shoulder.x, shoulder.y)
      .stroke({ width: ClimberFigure.TORSO + edge, color: palette.rim, cap: "round" });
    r.circle(head.x, head.y, ClimberPose.HEAD_RADIUS * 1.15 + edge / 2).fill(palette.rim);
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
    // The ice axe in its loop on the back of the pack, its head over the top.
    const { shaft, head } = ClimberFigure.AXE;
    const axeFoot = {
      x: middle.x + back.x * (width / 2) - up.x * (height / 2),
      y: middle.y + back.y * (width / 2) - up.y * (height / 2),
    };
    const axeTop = { x: axeFoot.x + up.x * shaft, y: axeFoot.y + up.y * shaft };
    g.moveTo(axeFoot.x, axeFoot.y)
      .lineTo(axeTop.x, axeTop.y)
      .stroke({ width: 0.03, color: Palette.AXE_SHAFT, cap: "round" });
    g.moveTo(axeTop.x - back.x * head * 0.35, axeTop.y - back.y * head * 0.35)
      .lineTo(axeTop.x + back.x * head * 0.65, axeTop.y + back.y * head * 0.65 - up.y * 0.04)
      .stroke({ width: 0.035, color: Palette.CRAMPONS, cap: "round" });
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
    for (const share of [0.22, 0.42, 0.62, 0.82]) {
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

  /** The jumar in the near hand on the rope, which comes up to it off the snow ahead, and its
   * sling from the harness. */
  private static jumar(g: Graphics, pose: Pose, rise: number): void {
    const alpha = Math.min(1, pose.holding * 1.25);
    if (alpha < 0.05) {
      return;
    }
    const hand = pose.arms[0].end;
    const aheadX = hand.x + ClimberFigure.ROPE_AHEAD;
    const ahead = { x: aheadX, y: rise * aheadX };
    const width = ClimberFigure.ROPE_METRES;
    const rope = (stroke: number, colour: number): void => {
      g.moveTo(hand.x, hand.y)
        .lineTo(ahead.x, ahead.y)
        .stroke({ width: stroke, color: colour, alpha, cap: "round" });
    };
    rope(width * 2, Palette.ROPE_SHADE);
    rope(width, Palette.ROPE);
    const tie = { x: pose.pelvis.x + ClimberFigure.TORSO * 0.33, y: pose.pelvis.y };
    g.moveTo(tie.x, tie.y)
      .lineTo(hand.x, hand.y)
      .stroke({ width: 0.025, color: Palette.JUMAR, alpha, cap: "round" });
    const along = Math.atan2(ahead.y - hand.y, ahead.x - hand.x);
    const { length, width: thick } = ClimberFigure.JUMAR_SIZE;
    const ux = Math.cos(along);
    const uy = Math.sin(along);
    const corner = (a: number, b: number): number[] => [
      hand.x + ux * a - uy * b,
      hand.y + uy * a + ux * b,
    ];
    g.poly([
      ...corner(-length * 0.2, thick / 2),
      ...corner(length * 0.8, thick / 2),
      ...corner(length * 0.8, -thick / 2),
      ...corner(-length * 0.2, -thick / 2),
    ]).fill({ color: Palette.JUMAR, alpha });
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

  /** The headlamp's light, as bright as the hour asks, while the climber is on their feet: the
   * halo round the lamp, the beam from the forehead along the slope and a little below it, and
   * the pool it throws where it comes down to the snow, on ground rising `rise` a metre ahead.
   * Drawn once, and only placed each frame; `grown` is the figure's scale in the layer. */
  private drawLamp(pose: Pose, atmosphere: Atmosphere, rise: number | null, grown: number): void {
    const { lamps } = atmosphere.light;
    const on = lamps > 0.01 && rise !== null;
    this.cone.visible = on;
    this.halo.visible = on;
    this.pool.visible = on;
    this.shining = null;
    if (!on) {
      return;
    }
    const from = ClimberFigure.lampAt(pose);
    const slope = Math.atan(rise);
    const angle = slope - ClimberFigure.LAMP_DOWN;
    const reach = ClimberFigure.LAMP_REACH;
    this.cone.position.set(from.x, from.y);
    this.cone.rotation = angle;
    this.cone.scale.set(reach);
    this.cone.alpha = ClimberFigure.LAMP_ALPHA * lamps;
    this.halo.position.set(from.x, from.y);
    this.halo.alpha = ClimberFigure.HALO.alpha * lamps;
    const beam = new Beam(from, angle, reach, ClimberFigure.LAMP_SPREAD, lamps);
    const pool = beam.meets((x) => rise * x);
    this.pool.visible = pool !== null;
    if (pool !== null) {
      const along = Math.hypot(pool.x - from.x, pool.y - from.y);
      this.pool.position.set(pool.x, pool.y);
      this.pool.rotation = slope;
      this.pool.alpha = ClimberFigure.POOL.alpha * lamps * (1 - along / (2 * reach));
    }
    // The same beam in the layer's metres, for the snow's grains to glint in.
    this.shining = new Beam(
      { x: this.x + this.facing * grown * from.x, y: this.y + grown * from.y },
      this.facing > 0 ? angle : Math.PI - angle,
      reach * grown,
      ClimberFigure.LAMP_SPREAD,
      lamps,
    );
  }

  /** The beam, drawn once along +x from the lamp, a metre long, to be turned and stretched: a wide
   * faint cone round narrower brighter ones, each fading out towards its end. */
  private static drawCone(): Graphics {
    const cone = new Graphics();
    for (const [share, alpha] of [
      [1, 0.4],
      [0.6, 0.4],
      [0.3, 0.35],
    ] as const) {
      const half = Math.tan(ClimberFigure.LAMP_SPREAD * share);
      cone.poly([0, 0, 1, -half, 1, half]).fill(
        ClimberFigure.radial({ x: 0, y: 0.5 }, 1, [
          [0, alpha],
          [0.45, alpha * 0.45],
          [1, 0],
        ]),
      );
    }
    cone.blendMode = "add";
    return cone;
  }

  /** The pool of the beam on the snow, drawn once round its middle, along the ground. */
  private static drawPool(): Graphics {
    const { length, depth } = ClimberFigure.POOL;
    const pool = new Graphics().ellipse(0, -depth * 0.15, length / 2, depth / 2).fill(
      ClimberFigure.radial({ x: 0.5, y: 0.5 }, 0.5, [
        [0, 1],
        [0.5, 0.4],
        [1, 0],
      ]),
    );
    pool.blendMode = "add";
    return pool;
  }

  /** The halo round the lamp, drawn once round it. */
  private static drawHalo(): Graphics {
    const halo = new Graphics().circle(0, 0, ClimberFigure.HALO.radius).fill(
      ClimberFigure.radial({ x: 0.5, y: 0.5 }, 0.5, [
        [0, 1],
        [0.25, 0.55],
        [1, 0],
      ]),
    );
    halo.blendMode = "add";
    return halo;
  }

  /** The lamp's light fading out from `centre` to `radius`, in the shape's own bounds, its
   * alpha at each stop. */
  private static radial(
    centre: Joint,
    radius: number,
    stops: readonly (readonly [number, number])[],
  ): FillGradient {
    return new FillGradient({
      type: "radial",
      center: centre,
      innerRadius: 0,
      outerCenter: centre,
      outerRadius: radius,
      colorStops: stops.map(([offset, alpha]) => ({
        offset,
        color: Palette.css(Palette.LAMP, alpha),
      })),
      textureSpace: "local",
    });
  }

  /** The breath cloud out of the mask on each breath out, drifting ahead and thinning, warm in
   * the lamp's light at night. */
  private drawBreath(pose: Pose, atmosphere: Atmosphere, dead: boolean): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const colour = Palette.mix(Palette.BREATH, Palette.LAMP, atmosphere.light.lamps * 0.6);
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const radius = ClimberPose.HEAD_RADIUS;
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    const x =
      pose.head.x + radius + ClimberFigure.BREATH_AHEAD + ClimberFigure.BREATH_DRIFT * share;
    const y = pose.head.y - radius * 0.2 + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: colour, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: colour, alpha: 0.3 * alpha });
  }
}
