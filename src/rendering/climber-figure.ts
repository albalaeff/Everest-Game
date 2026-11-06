import { Container, FillGradient, Graphics } from "pixi.js";

import type { ClimberView } from "../physics";
import type { BodyView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Beam } from "./beam";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Ground, Joint, Pose } from "./climber-pose";
import type { Underfoot } from "./footing";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { RimRig } from "./rim-rig";
import { SuitRig } from "./suit-rig";

/**
 * A climber drawn in metres with the feet at the origin, facing +x and flipped to face the way
 * they last walked: `SuitRig`'s figure in their kit, as #125's scene draws one (#168), lit as one
 * figure: a rim of the hour's light on the side the sun is (`RimRig`), the far side cold, and at
 * night the headlamp's beam, soft, where the head looks, with the pool it throws on the snow. Its
 * joints are `ClimberPose`'s, paced by the ground the physics has them cover, its boots on the
 * snow under them (`Footing`), and its chest and breath cloud `Breathing`'s, by the altitude and
 * the body; a fallen climber goes over, and a dead one lies flat and dim, with no words on the
 * screen (#24). It reads the physics and the body each frame and keeps only the picture's own:
 * the pose, the breath, the way it faces and how far it's come.
 */
export class ClimberFigure extends Container {
  /** From the soles to the top of the head. */
  static readonly HEIGHT_METRES = 1.77;
  private static readonly DEAD_ALPHA = 0.6;
  /** How far the chest swells with a breath, as a share of the torso's depth. */
  private static readonly CHEST_SWELL = 0.07;
  /** How far behind and ahead the slope the figure leans into is read: about a stride, so the
   * snow's smallest bumps don't sway it. */
  private static readonly RISE_METRES = 0.5;
  /** The breath cloud: how far ahead of the mask it forms, how big it gets, how far it drifts. */
  private static readonly BREATH_AHEAD = 0.06;
  private static readonly BREATH_RADIUS = 0.11;
  private static readonly BREATH_DRIFT = 0.18;
  /** The headlamp's beam: how far it reaches, how wide it opens each side of its axis, in metres
   * and radians, and how bright it is at its brightest. */
  private static readonly LAMP_REACH = 7;
  private static readonly LAMP_SPREAD = 0.26;
  private static readonly LAMP_ALPHA = 0.32;
  /** The pool the beam throws on the snow where it comes down, its length and depth, in metres,
   * and its brightness; and the halo round the lamp itself. */
  private static readonly POOL = { length: 3.4, depth: 0.7, alpha: 0.55 };
  private static readonly HALO = { radius: 0.22, alpha: 0.9 };
  /** The rim of light on the sun's side: how far past the body it shows, and how strong it is at
   * night, by day and in the glow of dawn and dusk. */
  private static readonly RIM_METRES = 0.025;
  private static readonly RIM_ALPHA = { night: 0.35, day: 0.45, glow: 0.95 };

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly cone = ClimberFigure.drawCone();
  private readonly pool = ClimberFigure.drawPool();
  private readonly halo = ClimberFigure.drawHalo();
  private readonly rim = new RimRig(ClimberFigure.RIM_METRES);
  private readonly figure: SuitRig;
  private readonly breath = new Graphics();
  private facing: 1 | -1 = 1;
  private travelled = 0;
  private last: Joint | null = null;
  /** The lamp's beam this frame, in the layer's metres, or none while it's off. */
  private shining: Beam | null = null;

  constructor(suit: number) {
    super();
    this.figure = new SuitRig(suit);
    this.addChild(this.pool, this.cone, this.rim, this.figure, this.halo, this.breath);
  }

  /** The headlamp's beam as last drawn, in the layer's metres: none by day, or once dead. */
  get beam(): Beam | null {
    return this.shining;
  }

  /** Puts the figure where the climber is and draws them as they are this frame, `seconds`
   * after the last, as the physics and the body show them, in the frame's light, on the snow
   * `underfoot`, and no smaller than `size` allows. */
  show(
    climber: ClimberView,
    body: BodyView,
    atmosphere: Atmosphere,
    seconds: number,
    size: LeastSize,
    underfoot: Underfoot,
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
    const { facing } = this;
    this.scale.set(facing * grown, grown);
    // The snow in the figure's own metres, ahead the way it faces, however big it's drawn.
    const ground: Ground = (x) => underfoot(facing * x * grown) / grown;
    const reach = ClimberFigure.RISE_METRES;
    const rise = (ground(reach) - ground(-reach)) / (2 * reach);
    const pose = this.pose.advance(seconds, {
      travelled: this.travelled,
      moving: climber.moving,
      falling: climber.falling,
      dead: climber.dead,
      onRope: climber.first !== null,
      clipped: [climber.first, climber.second],
      onLadder: climber.ladder !== null,
      rise,
      ground,
      tiredness: body.tiredness,
      pace: body.pace,
    });
    const moving = climber.moving && !climber.falling && !climber.dead;
    if (!climber.dead) {
      this.breathing.advance(seconds, Breathing.period(climber.altitude, body.tiredness, moving));
    }
    // Over onto the back, whichever way they face: the layer's y is up, so the sign is turned.
    this.rotation = pose.tilt * facing;
    this.alpha = climber.dead ? ClimberFigure.DEAD_ALPHA : 1;
    const swell = ClimberFigure.CHEST_SWELL * this.breathing.chest;
    this.figure.recolour(atmosphere.palette);
    this.figure.place(pose, swell);
    this.figure.hold(pose, ground);
    this.drawRim(pose, swell, atmosphere, climber.dead);
    const upright = !climber.dead && !climber.falling;
    this.drawLamp(atmosphere, upright ? pose.gaze : null, ground, grown);
    this.drawBreath(atmosphere, climber.dead);
  }

  /** The rim of the hour's light along the body's edge on the side the sun is: the figure's
   * silhouette a little wider, behind it and moved towards the light, so only that edge shows. */
  private drawRim(pose: Pose, swell: number, atmosphere: Atmosphere, dead: boolean): void {
    const { rim } = this;
    rim.visible = !dead;
    if (dead) {
      return;
    }
    const { light, palette } = atmosphere;
    const strength = ClimberFigure.RIM_ALPHA;
    rim.alpha =
      (strength.night + (strength.day - strength.night) * light.daylight) * (1 - light.glow) +
      strength.glow * light.glow;
    rim.tint = palette.rim;
    const edge = ClimberFigure.RIM_METRES;
    rim.position.set(light.glowSide * this.facing * edge, edge * 0.4);
    rim.place(pose, swell);
  }

  /** The headlamp's light, as bright as the hour asks, while the climber is on their feet: the
   * halo round the lamp, the beam from the forehead `angle` above the level, where the head looks,
   * and the pool it throws where it comes down to the snow on the `ground`. Drawn once, and only
   * placed each frame; `grown` is the figure's scale in the layer. */
  private drawLamp(
    atmosphere: Atmosphere,
    angle: number | null,
    ground: Ground,
    grown: number,
  ): void {
    const { lamps } = atmosphere.light;
    const on = lamps > 0.01 && angle !== null;
    this.cone.visible = on;
    this.halo.visible = on;
    this.pool.visible = on;
    this.shining = null;
    if (!on) {
      return;
    }
    const from = this.figure.lamp;
    const reach = ClimberFigure.LAMP_REACH;
    this.cone.position.set(from.x, from.y);
    this.cone.rotation = angle;
    this.cone.scale.set(reach);
    this.cone.alpha = ClimberFigure.LAMP_ALPHA * lamps;
    this.halo.position.set(from.x, from.y);
    this.halo.alpha = ClimberFigure.HALO.alpha * lamps;
    const beam = new Beam(from, angle, reach, ClimberFigure.LAMP_SPREAD, lamps);
    const pool = beam.meets(ground);
    this.pool.visible = pool !== null;
    if (pool !== null) {
      const along = Math.hypot(pool.x - from.x, pool.y - from.y);
      const half = ClimberFigure.POOL.length / 4;
      this.pool.position.set(pool.x, pool.y);
      this.pool.rotation = Math.atan((ground(pool.x + half) - ground(pool.x - half)) / (2 * half));
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

  /** The breath cloud out of the mask's valve on each breath out, drifting ahead and thinning,
   * warm in the lamp's light at night. */
  private drawBreath(atmosphere: Atmosphere, dead: boolean): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const colour = Palette.mix(Palette.BREATH, Palette.LAMP, atmosphere.light.lamps * 0.6);
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    const valve = this.figure.valve;
    const x = valve.x + ClimberFigure.BREATH_AHEAD + ClimberFigure.BREATH_DRIFT * share;
    const y = valve.y - ClimberPose.HEAD_RADIUS * 0.1 + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: colour, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: colour, alpha: 0.3 * alpha });
  }
}
