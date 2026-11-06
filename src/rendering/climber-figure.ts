import { Container, FillGradient, Graphics } from "pixi.js";

import type { ClimberView, Point } from "../physics";
import type { BodyView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Beam } from "./beam";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Joint, Pose } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import type { ReadSlope } from "./climber-reading";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { RimRig } from "./rim-rig";
import type { Held } from "./rope-curve";
import type { SnowPuffs } from "./snow-puffs";
import { SteppedPoints } from "./stepped-points";
import type { BetweenSteps } from "./stepped-points";
import { SuitRig } from "./suit-rig";

/** A point the figure keeps and moves each frame. */
interface Spot {
  x: number;
  y: number;
}

/**
 * A climber drawn in metres from their point, facing +x and turned round to face the way they go
 * (docs/guidelines/graphics.md → The animation shows the body's state): a figure in their kit as
 * #125's scene draws one (`SuitRig`, #168), its parts drawn once and moved onto the bones, the
 * cowstails from the harness to the jumar and the carabiner on the rope drawn each frame, and the
 * mask on the face while their oxygen flows, hanging on the chest while it doesn't (#87). It's lit
 * as one figure: each part shaded from the light, the far limbs cold, a rim of the hour's light on
 * the side the sun is (`RimRig`), and at night the lamp's beam, soft, ahead and down the slope,
 * with the pool it throws on the snow. It's drawn between the steps, where `SteppedPoints` has the
 * climber and their carabiners, its joints `ClimberPose`'s as `ClimberReading` reads them, and its
 * chest and breath `Breathing`'s, by the altitude and the body; the breath blows downwind, and
 * each boot that comes down on the snow kicks up a puff. A dead climber lies dim, with no words on
 * the screen (#24). It keeps only the picture's own: the points between the steps, the pose, the
 * breath, the turn and the lamp's beam.
 */
export class ClimberFigure extends Container {
  /** From the soles to the top of the head. */
  static readonly HEIGHT_METRES = 1.77;
  private static readonly DEAD_ALPHA = 0.6;
  /** How long they take to turn round. */
  private static readonly TURN_SECONDS = 0.16;
  /** How far the chest swells with a breath, as a share of the torso's width. */
  private static readonly CHEST_SWELL = 0.07;
  /** The cowstails: how long they are at life size, and how wide. */
  private static readonly COWSTAIL_METRES = 0.8;
  private static readonly COWSTAIL_WIDTH = 0.025;
  /** The breath cloud: how far ahead of the mask's valve it forms, how big it gets, how far it
   * drifts ahead in a calm and downwind on the full gust. */
  private static readonly BREATH_AHEAD = 0.06;
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
  /** The rim of light on the sun's side: how far past the body it shows, and how strong it is at
   * night, by day and in the glow of dawn and dusk. */
  private static readonly RIM_METRES = 0.025;
  private static readonly RIM_ALPHA = { night: 0.35, day: 0.45, glow: 0.95 };

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly reading: ClimberReading;
  private readonly cone = ClimberFigure.drawCone();
  private readonly pool = ClimberFigure.drawPool();
  private readonly halo = ClimberFigure.drawHalo();
  private readonly rim = new RimRig(ClimberFigure.RIM_METRES);
  private readonly figure: SuitRig;
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
    suit: number,
    slope: ReadSlope,
    private readonly puffs: SnowPuffs,
  ) {
    super();
    this.reading = new ClimberReading(slope);
    this.figure = new SuitRig(suit);
    this.addChild(this.pool, this.cone, this.rim, this.figure, this.halo, this.breath);
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

  /** Draws them as they are this frame, `seconds` after the last, as the body shows them, the mask
   * on while their oxygen flows (`masked`), in the frame's light, no smaller than `size` allows,
   * and `sag` lower where a ladder gives under them. */
  show(
    body: BodyView,
    masked: boolean,
    atmosphere: Atmosphere,
    seconds: number,
    size: LeastSize,
    sag = 0,
  ): void {
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
    this.draw(pose, masked, atmosphere, climber.dead, grown, size);
    const upright = !climber.dead && !climber.falling;
    this.drawLamp(pose, atmosphere, upright ? state.ground : null);
    this.drawBreath(atmosphere, climber.dead, atmosphere.gust * facing);
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

  /** The kit on the pose, the chest swollen with the breath, the mask on the face or on the chest,
   * the far limbs in the hour's cold light; the cowstails no thinner than a line can be drawn,
   * however small the figure; and the rim behind it. */
  private draw(
    pose: Pose,
    masked: boolean,
    atmosphere: Atmosphere,
    dead: boolean,
    grown: number,
    size: LeastSize,
  ): void {
    const { figure } = this;
    const swell = ClimberFigure.CHEST_SWELL * this.breathing.chest;
    figure.recolour(atmosphere.palette);
    figure.place(pose, swell, masked);
    const thin = size.line(ClimberFigure.COWSTAIL_WIDTH * grown) / grown;
    figure.hold(pose, ClimberFigure.COWSTAIL_METRES / grown, thin);
    this.drawRim(pose, swell, masked, atmosphere, dead);
  }

  /** The rim of the hour's light along the body's edge on the side the sun is: the figure's
   * silhouette a little wider and moved towards it, behind the body, so only that edge shows. */
  private drawRim(
    pose: Pose,
    swell: number,
    masked: boolean,
    atmosphere: Atmosphere,
    dead: boolean,
  ): void {
    const { light, palette } = atmosphere;
    const { rim } = this;
    rim.visible = !dead;
    if (dead) {
      return;
    }
    const strength = ClimberFigure.RIM_ALPHA;
    rim.alpha =
      (strength.night + (strength.day - strength.night) * light.daylight) * (1 - light.glow) +
      strength.glow * light.glow;
    rim.tint = palette.rim;
    const edge = ClimberFigure.RIM_METRES;
    // The figure's x is the way it faces, and turns over halfway round.
    const side = light.glowSide * (this.turn >= 0 ? 1 : -1);
    rim.position.set(side * edge, edge * 0.4);
    rim.place(pose, swell, masked);
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
    const from = this.figure.lamp;
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

  /** The breath cloud out of the mouth, through the mask's valve while it's on, on each breath
   * out, drifting ahead, blown on the gust the way the wind blows, `downwind` of 1 the way they
   * face, and thinning; warm in the lamp's light at night. */
  private drawBreath(atmosphere: Atmosphere, dead: boolean, downwind: number): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const colour = Palette.mix(Palette.BREATH, Palette.LAMP, atmosphere.light.lamps * 0.6);
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    const mouth = this.figure.mouth;
    const calm = 1 - Math.abs(downwind);
    const x =
      mouth.x +
      ClimberFigure.BREATH_AHEAD +
      share * (ClimberFigure.BREATH_DRIFT * calm + ClimberFigure.BREATH_BLOWN * downwind);
    const y = mouth.y + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: colour, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: colour, alpha: 0.3 * alpha });
  }
}
