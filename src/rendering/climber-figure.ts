import { Container, FillGradient, Graphics } from "pixi.js";

import type { ClimberView, Point } from "../physics";
import type { BodyView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Beam } from "./beam";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Joint, Limb, Pose } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import type { ReadSlope } from "./climber-reading";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";
import type { Held } from "./rope-curve";
import type { SnowPuffs } from "./snow-puffs";
import { SteppedPoints } from "./stepped-points";
import type { BetweenSteps } from "./stepped-points";

/** A point the figure keeps and moves each frame. */
interface Spot {
  x: number;
  y: number;
}

/**
 * A climber drawn in metres from their point, facing +x and turned round to face the way they go
 * (docs/guidelines/graphics.md → The animation shows the body's state): a figure in a down suit
 * with its baffles, boots and crampons, a pack with its bottle and an ice axe, a harness with its
 * two cowstails, the jumar on the first, hood, mask and goggles, and a headlamp. It's lit as one
 * figure, as #125's scene is: a rim of the hour's light on the side the sun is, the far side cold,
 * and at night the lamp's beam, soft, ahead and down the slope, with the pool it throws on the
 * snow. It's drawn between the steps, where `SteppedPoints` has the climber and their carabiners,
 * its joints `ClimberPose`'s as `ClimberReading` reads them, and its chest and breath
 * `Breathing`'s, by the altitude and the body; the breath blows downwind, and each boot that comes
 * down on the snow kicks up a puff. A dead climber lies dim, with no words on the screen (#24). It
 * keeps only the picture's own: the points between the steps, the pose, the breath, the turn and
 * the lamp's beam.
 */
export class ClimberFigure extends Container {
  /** From the soles to the top of the head. */
  static readonly HEIGHT_METRES = 1.77;
  private static readonly DEAD_ALPHA = 0.6;
  /** How long they take to turn round. */
  private static readonly TURN_SECONDS = 0.16;
  /** The limbs' and the body's widths, in metres. */
  private static readonly LEG = 0.17;
  private static readonly ARM = 0.13;
  private static readonly TORSO = 0.34;
  /** A boot round its ankle, its sole the ankle's height under it, x and y in turn: heel to toe
   * along the sole, then back over the toe cap and the cuff. */
  private static readonly BOOT: readonly number[] = [
    -0.09, -0.08, 0.17, -0.08, 0.21, -0.055, 0.19, -0.02, 0.07, 0, 0.05, 0.07, -0.07, 0.07, -0.1,
    -0.03,
  ];
  /** The crampon's points under the sole, from the ankle along it, and how far they stick out. */
  private static readonly CRAMPON_POINTS: readonly number[] = [-0.06, 0.01, 0.08, 0.15];
  private static readonly CRAMPON_LENGTH = 0.035;
  private static readonly PACK = { width: 0.28, height: 0.5 };
  private static readonly BOTTLE = { width: 0.1, height: 0.34 };
  private static readonly MITTEN = 0.08;
  /** How far the chest swells with a breath, as a share of the torso's width. */
  private static readonly CHEST_SWELL = 0.07;
  /** The cowstails: how long they are at life size, how far ahead of the pelvis they're tied
   * into the harness, and how wide they are; how far one off the rope hangs. */
  private static readonly COWSTAIL_METRES = 0.8;
  private static readonly TIE_AHEAD = 0.12;
  private static readonly COWSTAIL_WIDTH = 0.025;
  private static readonly HANGING = { down: 0.26, ahead: 0.05 };
  /** The jumar along its cowstail, back and ahead of where it's held, and how thick; a
   * carabiner's ring. */
  private static readonly JUMAR = { back: 0.05, ahead: 0.09, width: 0.045 };
  private static readonly CARABINER = 0.03;
  /** The breath cloud: how far ahead of the mask it forms, how big it gets, how far it drifts
   * ahead in a calm and downwind on the full gust. */
  private static readonly BREATH_AHEAD = 0.16;
  private static readonly BREATH_RADIUS = 0.11;
  private static readonly BREATH_DRIFT = 0.18;
  private static readonly BREATH_BLOWN = 0.45;
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
  /** How far behind and ahead of the feet the beam reads the slope's rise, and the steepest rise
   * it follows. */
  private static readonly RISE_METRES = 0.4;
  private static readonly MOST_RISE = 1.2;
  /** How far the far side of the body is shaded, and how much of the sky's cold light it takes. */
  private static readonly FAR_SHADE = 0.25;
  private static readonly FAR_COLD = 0.22;
  /** The rim of light on the sun's side: how far past the body it shows, and how strong it is at
   * night, by day and in the glow of dawn and dusk. */
  private static readonly RIM_METRES = 0.025;
  private static readonly RIM_ALPHA = { night: 0.35, day: 0.45, glow: 0.95 };
  /** The ice axe strapped to the pack: its shaft's length and its head's. */
  private static readonly AXE = { shaft: 0.62, head: 0.26 };

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly reading: ClimberReading;
  private readonly cone = ClimberFigure.drawCone();
  private readonly pool = ClimberFigure.drawPool();
  private readonly halo = ClimberFigure.drawHalo();
  private readonly rim = new Graphics();
  private readonly body = new Graphics();
  private readonly breath = new Graphics();
  /** The climber's point, the jumar's carabiner and the second's, as the last step left them, and
   * drawn between the steps. */
  private readonly stepped = new SteppedPoints();
  private readonly spots: readonly [Spot, Spot, Spot] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private readonly point: Spot = { x: 0, y: 0 };
  private readonly first: Spot = { x: 0, y: 0 };
  private readonly second: Spot = { x: 0, y: 0 };
  private readonly drawn: { at: Spot; jumar: Spot | null; carabiner: Spot | null; grown: number } =
    { at: this.point, jumar: null, carabiner: null, grown: 1 };
  /** The jumar, where the physics has it on the rope and where the hand holds it, this frame. */
  private readonly holding: { readonly on: Spot; readonly drawn: Spot } = {
    on: { x: 0, y: 0 },
    drawn: { x: 0, y: 0 },
  };
  private readonly ball: Spot = { x: 0, y: 0 };
  private readonly lamp: Spot = { x: 0, y: 0 };
  private climber: ClimberView | null = null;
  private holds = false;
  /** How far round they've turned: 1 facing right, -1 left. */
  private turn = 1;
  /** The lamp's beam this frame, in the layer's metres, or none while it's off. */
  private shining: Beam | null = null;

  constructor(
    private readonly suit: number,
    slope: ReadSlope,
    private readonly puffs: SnowPuffs,
  ) {
    super();
    this.reading = new ClimberReading(slope);
    this.addChild(this.pool, this.cone, this.rim, this.body, this.halo, this.breath);
  }

  /** The headlamp's beam as last drawn, in the layer's metres: none by day, or off their feet. */
  get beam(): Beam | null {
    return this.shining;
  }

  /** Where the climber is drawn this frame, between the steps. */
  get at(): Point {
    return this.point;
  }

  /** The rope their jumar is on, or none. */
  get rope(): string | null {
    return this.climber?.first ?? null;
  }

  /** The jumar on its rope this frame, for the rope to run through it: none when it's off. */
  get held(): Held | null {
    return this.holds ? this.holding : null;
  }

  /** The climber as the physics shows them after the frame's steps, `between` them. */
  move(climber: ClimberView, between: BetweenSteps): void {
    this.climber = climber;
    const [point, first, second] = this.spots;
    const firstAt = climber.firstAt ?? climber;
    const secondAt = climber.secondAt ?? climber;
    point.x = climber.x;
    point.y = climber.y;
    first.x = firstAt.x;
    first.y = firstAt.y;
    second.x = secondAt.x;
    second.y = secondAt.y;
    const { stepped } = this;
    stepped.follow(this.spots, between);
    this.point.x = stepped.x(0);
    this.point.y = stepped.y(0);
    this.first.x = stepped.x(1);
    this.first.y = stepped.y(1);
    this.second.x = stepped.x(2);
    this.second.y = stepped.y(2);
  }

  /** Draws them as they are this frame, `seconds` after the last, as the body shows them, in the
   * frame's light, no smaller than `size` allows, and `sag` lower where a ladder gives under them.
   */
  show(body: BodyView, atmosphere: Atmosphere, seconds: number, size: LeastSize, sag = 0): void {
    const { climber, drawn } = this;
    if (climber === null) {
      return;
    }
    const grown = size.climber(ClimberFigure.HEIGHT_METRES);
    drawn.grown = grown;
    drawn.jumar = climber.first === null ? null : this.first;
    drawn.carabiner = climber.second === null ? null : this.second;
    const state = this.reading.read(climber, body, drawn);
    const pose = this.pose.advance(seconds, state);
    const { facing } = this.reading;
    const turning = (2 * Math.max(seconds, 0)) / ClimberFigure.TURN_SECONDS;
    this.turn =
      facing > this.turn
        ? Math.min(this.turn + turning, facing)
        : Math.max(this.turn - turning, facing);
    // Turning round, the figure narrows to its edge and opens the other way.
    const across = Math.sin((this.turn * Math.PI) / 2) * grown;
    this.scale.set(across, grown);
    // Over the way they face: the layer's y is up, so the turn is the other way round.
    this.rotation = -pose.tilt * facing;
    this.position.set(
      this.point.x + across * pose.offset.x,
      this.point.y - sag + grown * pose.offset.y,
    );
    const moving = climber.moving && !climber.falling && !climber.dead;
    if (!climber.dead) {
      this.breathing.advance(seconds, Breathing.period(climber.altitude, body.tiredness, moving));
    }
    this.alpha = climber.dead ? ClimberFigure.DEAD_ALPHA : 1;
    this.draw(pose, atmosphere, climber.dead, grown, size);
    const upright = !climber.dead && !climber.falling;
    this.drawLamp(pose, atmosphere, upright ? state.ground : null);
    this.drawBreath(pose, atmosphere, climber.dead, atmosphere.gust * facing);
    this.holds = climber.first !== null && pose.jumar !== null;
    if (pose.jumar !== null) {
      this.holding.on.x = this.first.x;
      this.holding.on.y = this.first.y;
      this.inLayer(pose.jumar, this.holding.drawn);
    }
    if (state.ladder === null && !climber.falling && !climber.dead) {
      this.kick(pose, grown);
    }
  }

  /** A puff of snow under each boot that came down this frame, at its ball. */
  private kick(pose: Pose, grown: number): void {
    for (const leg of [0, 1] as const) {
      const ankle = pose.legs[leg].end;
      const sole = pose.soles[leg];
      if (pose.landed[leg]) {
        const cos = Math.cos(sole);
        const sin = Math.sin(sole);
        const ball = ClimberPose.BALL;
        const under = -ClimberPose.ANKLE;
        this.inLayer(
          { x: ankle.x + ball * cos - under * sin, y: ankle.y + ball * sin + under * cos },
          this.ball,
        );
        this.puffs.kick(this.ball.x, this.ball.y, grown);
      }
    }
  }

  /** Where a point of the figure's is in the layer. */
  private inLayer(joint: Joint, into: Spot): void {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const { x: across, y: grown } = this.scale;
    into.x = this.position.x + cos * across * joint.x - sin * grown * joint.y;
    into.y = this.position.y + sin * across * joint.x + cos * grown * joint.y;
  }

  private draw(
    pose: Pose,
    atmosphere: Atmosphere,
    dead: boolean,
    grown: number,
    size: LeastSize,
  ): void {
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
    const [nearSole, farSole] = pose.soles;
    this.drawRim(pose, atmosphere, dead);
    g.clear();
    // The far side first: the far leg, the pack on the back with the axe, the far arm.
    ClimberFigure.limb(g, farLeg, ClimberFigure.LEG, farSuit);
    ClimberFigure.boot(g, farLeg.end, farSole, farBoots);
    ClimberFigure.pack(g, pose);
    ClimberFigure.limb(g, farArm, ClimberFigure.ARM, farSuit);
    ClimberFigure.mitten(g, farArm.end, farBoots);
    // The torso, swelling with each breath, its baffles, the harness and the cowstails.
    const swell = 1 + ClimberFigure.CHEST_SWELL * this.breathing.chest;
    g.moveTo(pose.pelvis.x, pose.pelvis.y)
      .lineTo(pose.shoulder.x, pose.shoulder.y)
      .stroke({ width: ClimberFigure.TORSO * swell, color: suit, cap: "round" });
    ClimberFigure.baffles(g, pose, suit);
    // A cowstail no thinner than a line can be drawn, however small the figure.
    const thin = size.line(ClimberFigure.COWSTAIL_WIDTH * grown) / grown;
    ClimberFigure.harness(g, pose, ClimberFigure.COWSTAIL_METRES / grown, thin);
    // The near side: the near leg and arm, then the hood, the mask, the goggles and the lamp.
    ClimberFigure.limb(g, nearLeg, ClimberFigure.LEG, suit);
    ClimberFigure.boot(g, nearLeg.end, nearSole, Palette.BOOTS);
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
    // The figure's x is the way it faces, and turns over halfway round.
    const side = light.glowSide * (this.turn >= 0 ? 1 : -1);
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

  /** A boot on the ankle, its sole along what it stands on, and the crampon's points under it. */
  private static boot(g: Graphics, ankle: Joint, sole: number, colour: number): void {
    const cos = Math.cos(sole);
    const sin = Math.sin(sole);
    const shape = ClimberFigure.BOOT;
    for (let index = 0; index + 1 < shape.length; index += 2) {
      const x = shape[index] ?? 0;
      const y = shape[index + 1] ?? 0;
      const px = ankle.x + x * cos - y * sin;
      const py = ankle.y + x * sin + y * cos;
      if (index === 0) {
        g.moveTo(px, py);
      } else {
        g.lineTo(px, py);
      }
    }
    g.closePath().fill(colour);
    const under = -ClimberPose.ANKLE;
    const out = under - ClimberFigure.CRAMPON_LENGTH;
    for (const along of ClimberFigure.CRAMPON_POINTS) {
      g.moveTo(ankle.x + along * cos - under * sin, ankle.y + along * sin + under * cos).lineTo(
        ankle.x + along * cos - out * sin,
        ankle.y + along * sin + out * cos,
      );
    }
    g.stroke({ width: 0.025, color: Palette.CRAMPONS, cap: "round" });
  }

  private static mitten(g: Graphics, hand: Joint, colour: number): void {
    g.circle(hand.x, hand.y, ClimberFigure.MITTEN).fill(colour);
  }

  /** Up the spine, and behind it: its normal, which points to -x standing. */
  private static spine(pose: Pose): { readonly up: Joint; readonly back: Joint; length: number } {
    const { pelvis, shoulder } = pose;
    const dx = shoulder.x - pelvis.x;
    const dy = shoulder.y - pelvis.y;
    const length = Math.hypot(dx, dy) || 1;
    const up = { x: dx / length, y: dy / length };
    return { up, back: { x: -up.y, y: up.x }, length };
  }

  /** The pack on the back, hung from the shoulders along the spine, with the bottle in it and the
   * ice axe strapped on. */
  private static pack(g: Graphics, pose: Pose): void {
    const { pelvis } = pose;
    const { up, back, length: spine } = ClimberFigure.spine(pose);
    const { width, height } = ClimberFigure.PACK;
    const bottle = ClimberFigure.BOTTLE;
    const middle = {
      x: pelvis.x + up.x * spine * 0.55 + back.x * (ClimberFigure.TORSO / 2 + width * 0.35),
      y: pelvis.y + up.y * spine * 0.55 + back.y * (ClimberFigure.TORSO / 2 + width * 0.35),
    };
    const box = (at: Joint, w: number, h: number): void => {
      const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
      for (let index = 0; index < corners.length; index += 2) {
        const across = ((corners[index] ?? 0) * w) / 2;
        const along = ((corners[index + 1] ?? 0) * h) / 2;
        const x = at.x + back.x * across + up.x * along;
        const y = at.y + back.y * across + up.y * along;
        if (index === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.closePath();
    };
    box(middle, width, height);
    g.fill(Palette.PACK);
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
    box(bottleAt, bottle.width, bottle.height);
    g.fill(Palette.BOTTLE);
    box(
      {
        x: bottleAt.x + up.x * (bottle.height / 2 + 0.025),
        y: bottleAt.y + up.y * (bottle.height / 2 + 0.025),
      },
      bottle.width * 0.5,
      0.05,
    );
    g.fill(Palette.CRAMPONS);
  }

  /** The down suit's baffles: a few lines across the torso, in the suit's shade. */
  private static baffles(g: Graphics, pose: Pose, suit: number): void {
    const { pelvis, shoulder } = pose;
    const { back } = ClimberFigure.spine(pose);
    const half = ClimberFigure.TORSO * 0.42;
    for (const share of [0.22, 0.42, 0.62, 0.82]) {
      const x = pelvis.x + (shoulder.x - pelvis.x) * share;
      const y = pelvis.y + (shoulder.y - pelvis.y) * share;
      g.moveTo(x + back.x * half, y + back.y * half).lineTo(x - back.x * half, y - back.y * half);
    }
    g.stroke({ width: 0.02, color: Palette.shaded(suit, 0.18), cap: "round" });
  }

  /** The harness round the hips, and the cowstails `length` long from its tie at the front: to
   * the jumar in the hand and the second carabiner where they're on the rope, slack or taut, and
   * hanging where they're off. */
  private static harness(g: Graphics, pose: Pose, length: number, width: number): void {
    const { pelvis, tilt } = pose;
    const { back } = ClimberFigure.spine(pose);
    const half = ClimberFigure.TORSO * 0.55;
    g.moveTo(pelvis.x + back.x * half, pelvis.y + back.y * half + 0.02)
      .lineTo(pelvis.x - back.x * half, pelvis.y - back.y * half + 0.02)
      .stroke({ width: 0.05, color: Palette.HARNESS, cap: "round" });
    const tie = {
      x: pelvis.x - back.x * ClimberFigure.TIE_AHEAD,
      y: pelvis.y - back.y * ClimberFigure.TIE_AHEAD,
    };
    // Down, in the figure's turned frame: what a slack cowstail sags toward.
    const down = { x: Math.sin(tilt), y: -Math.cos(tilt) };
    const { HANGING } = ClimberFigure;
    const off = (ahead: number): Joint => ({
      x: tie.x + down.x * HANGING.down + ahead,
      y: tie.y + down.y * HANGING.down,
    });
    const jumar = pose.jumar ?? off(HANGING.ahead);
    const carabiner = pose.carabiner ?? off(-HANGING.ahead);
    ClimberFigure.cowstail(g, tie, jumar, pose.jumar === null ? HANGING.down * 2 : length, down);
    ClimberFigure.cowstail(
      g,
      tie,
      carabiner,
      pose.carabiner === null ? HANGING.down * 2 : length,
      down,
    );
    g.stroke({ width, color: Palette.HARNESS, cap: "round", join: "round" });
    // The jumar along its cowstail, where the hand holds it; the carabiners' rings.
    const dx = jumar.x - tie.x;
    const dy = jumar.y - tie.y;
    const away = Math.hypot(dx, dy) || 1;
    const { JUMAR } = ClimberFigure;
    g.moveTo(jumar.x - (dx / away) * JUMAR.back, jumar.y - (dy / away) * JUMAR.back)
      .lineTo(jumar.x + (dx / away) * JUMAR.ahead, jumar.y + (dy / away) * JUMAR.ahead)
      .stroke({ width: Math.max(JUMAR.width, width), color: Palette.JUMAR, cap: "round" });
    g.circle(carabiner.x, carabiner.y, ClimberFigure.CARABINER).stroke({
      width: width * 0.8,
      color: Palette.JUMAR,
    });
  }

  /** A cowstail `length` long from the harness to `to`: a curve that sags `down` between them as
   * far as its slack lets it, straight when it's taut. In pieces: a curve's own are too few at the
   * figure's metres. */
  private static cowstail(g: Graphics, from: Joint, to: Joint, length: number, down: Joint): void {
    const apart = Math.hypot(to.x - from.x, to.y - from.y);
    const sag = Math.sqrt(Math.max(length * length - apart * apart, 0)) / 2;
    const controlX = (from.x + to.x) / 2 + down.x * 2 * sag;
    const controlY = (from.y + to.y) / 2 + down.y * 2 * sag;
    const pieces = 8;
    g.moveTo(from.x, from.y);
    for (let piece = 1; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      const s = 1 - t;
      g.lineTo(
        s * s * from.x + 2 * s * t * controlX + t * t * to.x,
        s * s * from.y + 2 * s * t * controlY + t * t * to.y,
      );
    }
  }

  /** A point on the face, turned with the head as it nods: x ahead and y up from its middle. */
  private static face(pose: Pose, x: number, y: number): Joint {
    const cos = Math.cos(pose.nod);
    const sin = Math.sin(pose.nod);
    return { x: pose.head.x + x * cos + y * sin, y: pose.head.y - x * sin + y * cos };
  }

  /** The hood over the head, the mask and the goggles on its face, and the headlamp's band. */
  private static head(g: Graphics, pose: Pose, suit: number, dead: boolean): void {
    const { head, shoulder } = pose;
    const radius = ClimberPose.HEAD_RADIUS;
    g.moveTo(shoulder.x, shoulder.y)
      .lineTo(head.x, head.y)
      .stroke({ width: radius * 1.6, color: suit, cap: "round" });
    g.circle(head.x, head.y, radius * 1.15).fill(suit);
    const mask = ClimberFigure.face(pose, radius * 0.45, -radius * 0.1);
    g.circle(mask.x, mask.y, radius * 0.75).fill(Palette.MASK);
    const goggles = ClimberFigure.face(pose, radius * 0.55, radius * 0.4);
    g.ellipse(goggles.x, goggles.y, radius * 0.5, radius * 0.32).fill(
      dead ? Palette.shaded(Palette.GOGGLES, 0.5) : Palette.GOGGLES,
    );
    const band = ClimberFigure.face(pose, -radius * 0.9, radius * 0.55);
    const lamp = ClimberFigure.lampAt(pose);
    g.moveTo(band.x, band.y).lineTo(lamp.x, lamp.y).stroke({ width: 0.035, color: Palette.BOOTS });
    g.circle(lamp.x, lamp.y, 0.04).fill(Palette.LAMP);
  }

  /** Where the headlamp sits: on the forehead, over the goggles. */
  private static lampAt(pose: Pose): Joint {
    const radius = ClimberPose.HEAD_RADIUS;
    return ClimberFigure.face(pose, radius * 0.95, radius * 0.55);
  }

  /** The headlamp's light, as bright as the hour asks, while the climber is on their feet: the
   * halo round the lamp, the beam from the forehead along the slope and a little below it, and
   * the pool it throws where it comes down to the snow, the `ground` the pose stands on, ahead of
   * the climber's point. Drawn once, and only placed each frame. */
  private drawLamp(
    pose: Pose,
    atmosphere: Atmosphere,
    ground: ((ahead: number) => number) | null,
  ): void {
    const { lamps } = atmosphere.light;
    const on = lamps > 0.01 && ground !== null;
    this.cone.visible = on;
    this.halo.visible = on;
    this.pool.visible = on;
    this.shining = null;
    if (!on) {
      return;
    }
    // The ground from where the figure stands, in its metres.
    const { offset } = pose;
    const under = (x: number): number => ground(x + offset.x) - offset.y;
    const slope = Math.atan(ClimberFigure.rise(under));
    const from = ClimberFigure.lampAt(pose);
    const angle = slope - ClimberFigure.LAMP_DOWN;
    const reach = ClimberFigure.LAMP_REACH;
    this.cone.position.set(from.x, from.y);
    this.cone.rotation = angle;
    this.cone.scale.set(reach);
    this.cone.alpha = ClimberFigure.LAMP_ALPHA * lamps;
    this.halo.position.set(from.x, from.y);
    this.halo.alpha = ClimberFigure.HALO.alpha * lamps;
    const beam = new Beam(from, angle, reach, ClimberFigure.LAMP_SPREAD, lamps);
    const pool = beam.meets(under);
    this.pool.visible = pool !== null;
    if (pool !== null) {
      const along = Math.hypot(pool.x - from.x, pool.y - from.y);
      this.pool.position.set(pool.x, pool.y);
      this.pool.rotation = slope;
      this.pool.alpha = ClimberFigure.POOL.alpha * lamps * (1 - along / (2 * reach));
    }
    // The same beam in the layer's metres, for the snow's grains to glint in: the figure's x is
    // the way it faces, and it turns over with the figure.
    this.inLayer(from, this.lamp);
    const ahead = this.scale.x >= 0 ? angle : Math.PI - angle;
    this.shining = new Beam(
      { x: this.lamp.x, y: this.lamp.y },
      ahead + this.rotation,
      reach * this.scale.y,
      ClimberFigure.LAMP_SPREAD,
      lamps,
    );
  }

  /** How far the ground `under` the figure rises a metre ahead: of the ground just behind the feet
   * and just ahead, the gentler, so a climber at the foot of a wall shines on the snow before it,
   * and no steeper than a slope walked up. */
  private static rise(under: (x: number) => number): number {
    const reach = ClimberFigure.RISE_METRES;
    const here = under(0);
    const behind = (here - under(-reach)) / reach;
    const ahead = (under(reach) - here) / reach;
    const gentler = Math.abs(behind) < Math.abs(ahead) ? behind : ahead;
    const most = ClimberFigure.MOST_RISE;
    return Math.min(Math.max(gentler, -most), most);
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

  /** The breath cloud out of the mask on each breath out, drifting ahead, blown on the gust the
   * way the wind blows, `downwind` of 1 the way they face, and thinning; warm in the lamp's light
   * at night. */
  private drawBreath(pose: Pose, atmosphere: Atmosphere, dead: boolean, downwind: number): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const colour = Palette.mix(Palette.BREATH, Palette.LAMP, atmosphere.light.lamps * 0.6);
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const radius = ClimberPose.HEAD_RADIUS;
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    const mouth = ClimberFigure.face(pose, radius + ClimberFigure.BREATH_AHEAD, -radius * 0.2);
    const calm = 1 - Math.abs(downwind);
    const x =
      mouth.x + share * (ClimberFigure.BREATH_DRIFT * calm + ClimberFigure.BREATH_BLOWN * downwind);
    const y = mouth.y + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: colour, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: colour, alpha: 0.3 * alpha });
  }
}
