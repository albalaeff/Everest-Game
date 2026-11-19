import { Container, FillGradient, Graphics } from "pixi.js";

import type { ClimberView, Point } from "../physics";
import type { BodyView, HandView } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { Beam } from "./beam";
import { Breathing } from "./breathing";
import { ClimberPose } from "./climber-pose";
import type { Joint, Pose, PoseState } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import type { Beside, Mount, ReadSlope } from "./climber-reading";
import { Dressing } from "./dressing";
import { FacingTurn } from "./facing-turn";
import { FrontRig } from "./front-rig";
import type { IceChips } from "./ice-chips";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { RimRig } from "./rim-rig";
import type { Held } from "./rope-curve";
import { RopeGive } from "./rope-give";
import type { SnowPuffs } from "./snow-puffs";
import { SteppedPoints } from "./stepped-points";
import type { BetweenSteps } from "./stepped-points";
import { SuitRig } from "./suit-rig";
import { TentEntry } from "./tent-entry";
import type { Doorway, EntryLook } from "./tent-entry";

/** A point the figure keeps and moves each frame. */
interface Spot {
  x: number;
  y: number;
}

/** A cowstail's hold on its rope as the rope draws it (`Held`), filled again each frame. */
interface Grip {
  readonly on: Spot;
  readonly drawn: Spot;
  load: number;
  pulled: boolean;
  quiver: number;
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
 * each boot that comes down on the snow kicks up a puff. On a face of ice, each pick that strikes
 * in knocks chips off it, more and bigger where it bites poorly, and so do the front points as
 * they kick in. A dead climber lies dim, with no words on the screen (#24). Beside a climber at
 * the same spot, they're drawn a step aside (`Abreast`, #243). Hurt, their limb shows it and
 * what first aid has put on it (`Dressing`, #241); carried, they're drawn on their rescuer's
 * back, where the rescuer is drawn. It keeps only the picture's own: the points between the
 * steps, the step aside, the pose, the breath, the turn, the lamp's beam, and where their hips,
 * their hands and their hurt limb were drawn last.
 */
export class ClimberFigure extends Container {
  /** From the soles to the top of the head. */
  static readonly HEIGHT_METRES = 1.77;
  private static readonly DEAD_ALPHA = 0.6;
  /** How far the chest swells with a breath, as a share of the torso's width. */
  private static readonly CHEST_SWELL = 0.07;
  /** The cowstails: how long they are at life size, the jumar's an arm's length and the second
   * carabiner's a short sling, which holds it up off the snow (#202); and how wide. */
  private static readonly COWSTAIL_METRES = 0.8;
  private static readonly SLING_METRES = 0.5;
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
  /** How long the beam takes to swing most of the way round to where it's aimed (#222). */
  private static readonly LAMP_SWING_SECONDS = 0.15;
  /** How many rays across the cone find where the ground cuts it. */
  private static readonly LAMP_RAYS = 12;
  /** The pool the beam throws on the snow where it comes down, its length and depth, in metres,
   * and its brightness; and the halo round the lamp itself. */
  private static readonly POOL = { length: 3.4, depth: 0.7, alpha: 0.55 };
  private static readonly HALO = { radius: 0.22, alpha: 0.9 };
  /** The lamp of a climber who faces the viewer (#235), shining out of the picture: a glow round
   * it, its radius in metres, bright at the lamp and soon faint, so the face under it still reads,
   * with a few short rays; and the pool at their feet, as a share of the beam's and its
   * brightness. Never a beam across the picture, and never a white-out. */
  private static readonly GLOW = { radius: 0.5, alpha: 0.85, rays: 6, ray: 0.55, pool: 0.42 };
  /** How far behind and ahead of the feet the beam reads the slope's rise, and the steepest rise
   * it follows. */
  private static readonly RISE_METRES = 0.4;
  private static readonly MOST_RISE = 1.2;
  /** Where the front points are, in a boot's frame from the point of the sole under its ankle,
   * and the way the chips they kick off fly, out of the ice the climber faces and up. */
  private static readonly FRONT_POINTS: Joint = { x: 0.25, y: -0.02 };
  /** Where a figure seen from the front stands: on the climber's point. */
  private static readonly ON_THE_SPOT: Joint = { x: 0, y: 0 };
  private static readonly KICKED_OUT: Joint = { x: -0.95, y: 0.3 };
  /** The rim of light on the sun's side: how far past the body it shows, and how strong it is at
   * night, by day and in the glow of dawn and dusk. */
  private static readonly RIM_METRES = 0.025;
  private static readonly RIM_ALPHA = { night: 0.35, day: 0.45, glow: 0.95 };

  private readonly pose = new ClimberPose();
  private readonly breathing = new Breathing();
  private readonly reading: ClimberReading;
  /** The slope's ropes, for the anchors of the one that holds them. */
  private readonly ropes: ReadSlope;
  private readonly cone = ClimberFigure.drawCone();
  /** What of the cone shows: the fan the lamp lights, stopping at the ground (#202). */
  private readonly lit = new Graphics();
  private readonly pool = ClimberFigure.drawPool();
  private readonly halo = ClimberFigure.drawHalo();
  private readonly glow = ClimberFigure.drawGlow();
  private readonly rim = new RimRig(ClimberFigure.RIM_METRES);
  private readonly figure: SuitRig;
  /** What a hard landing left on a limb, and what first aid has put on it (#241). */
  private readonly dressing = new Dressing();
  /** Where their hips, the middle of their hands and their hurt limb are drawn this frame, in
   * the layer, and how far they lean (#241): what a casualty on their back rides on, where a
   * rope they haul runs to, and where their rescuer's hands work. */
  private readonly hipsAt: Spot = { x: 0, y: 0 };
  private readonly handsAt: Spot = { x: 0, y: 0 };
  private readonly woundAt: Spot = { x: 0, y: 0 };
  private wounded = false;
  private leaning = 0;
  /** The figure from the front, while they face the viewer, and how far round they've turned
   * (#235). */
  private readonly front: FrontRig;
  private readonly turning = new FacingTurn();
  private fromTheFront = false;
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
  /** Where the physics has them this frame, between the steps, and how far aside of it they're
   * drawn, beside a climber at the same spot (`Abreast`, #243). */
  private readonly trod: Spot = { x: 0, y: 0 };
  private readonly aside: Spot = { x: 0, y: 0 };
  private readonly first: Spot = { x: 0, y: 0 };
  private readonly second: Spot = { x: 0, y: 0 };
  private readonly drawn: {
    at: Spot;
    jumar: Spot | null;
    carabiner: Spot | null;
    grown: number;
    through: { facing: 1 | -1; down: number } | null;
    hand: HandView | null;
  } = { at: this.point, jumar: null, carabiner: null, grown: 1, through: null, hand: null };
  /** The jumar, where the physics has it on the rope and where the hand holds it, this frame, and
   * how much of the climber's weight the rope bears there (#232). */
  private readonly holding: Grip = {
    on: { x: 0, y: 0 },
    drawn: { x: 0, y: 0 },
    load: 0,
    pulled: false,
    quiver: 0,
  };
  /** The second carabiner, where the physics has it on the rope and where its sling holds it,
   * this frame (#202), and the weight on it. */
  private readonly hanging: Grip = {
    on: { x: 0, y: 0 },
    drawn: { x: 0, y: 0 },
    load: 0,
    pulled: false,
    quiver: 0,
  };
  /** How far the rope that holds them gives under their weight (#232). */
  private readonly give: RopeGive;
  private hangs = false;
  private readonly ball: Spot = { x: 0, y: 0 };
  private readonly chip: Spot = { x: 0, y: 0 };
  private readonly out: Spot = { x: 0, y: 0 };
  private readonly lamp: Spot = { x: 0, y: 0 };
  private climber: ClimberView | null = null;
  /** Their way into a tent and out of it, and how it looks this frame (#258). */
  private readonly entry = new TentEntry();
  private entered: EntryLook | null = null;
  private holds = false;
  /** The lamp's beam this frame, in the layer's metres, or none while it's off. */
  private shining: Beam | null = null;
  /** Where the headlamp points, in the figure's radians from the level ahead, while it's on. */
  private aim: number | null = null;

  constructor(
    suit: number,
    slope: ReadSlope,
    private readonly puffs: SnowPuffs,
    private readonly chips: IceChips,
    /** How far a fixed rope gives under a climber's weight, as a share of its loaded length
     * (`gear.fixed-rope-stretch`, #232). */
    ropeStretch: number,
    /** How big their pack is against a client's: a Sherpa's is bigger (#212). */
    pack = 1,
  ) {
    super();
    this.give = new RopeGive(ropeStretch);
    this.ropes = slope;
    this.reading = new ClimberReading(slope);
    this.figure = new SuitRig(suit, pack);
    this.front = new FrontRig(suit, pack, ClimberFigure.RIM_METRES);
    this.front.visible = false;
    this.glow.visible = false;
    this.addChild(
      this.pool,
      this.cone,
      this.lit,
      this.rim,
      this.figure,
      this.dressing,
      this.front,
      this.halo,
      this.glow,
      this.breath,
    );
    this.cone.mask = this.lit;
  }

  /** The headlamp's beam as last drawn, in the layer's metres: none by day, or off their feet. */
  get beam(): Beam | null {
    return this.shining;
  }

  /** Whether the figure is drawn from the front now, facing the viewer (#235). */
  get facesViewer(): boolean {
    return this.fromTheFront;
  }

  /** Where the climber is drawn this frame, between the steps. */
  get at(): Point {
    return this.point;
  }

  /** As they're drawn this frame, for a casualty they carry to ride on (#241): the way they
   * face, where their hips are and how far they lean. */
  get mount(): Mount {
    return { facing: this.reading.facing, hips: this.hipsAt, lean: this.leaning };
  }

  /** Where first aid goes on them, as they're drawn this frame, in the layer (#241): on their
   * hurt limb; none unhurt, or seen from the front. */
  get wound(): Point | null {
    return this.wounded ? this.woundAt : null;
  }

  /** The middle of their hands as they're drawn this frame, in the layer: a rescue line they
   * haul on runs to them (#241). */
  get hands(): Point {
    return this.handsAt;
  }

  /** The rescue line that holds them this frame, and its rope from the anchor down to where
   * they're tied in, in the layer; none off a line (#241). */
  get onLine(): { readonly line: string; readonly taut: readonly Point[] } | null {
    return this.reading.onLine;
  }

  /** Where the physics has the climber this frame, between the steps: where they're drawn, but
   * for a step aside. */
  get stands(): Point {
    return this.trod;
  }

  /** Draws them `by` this far aside of where they stand, from the next frame: beside a climber
   * at the same spot, on the ground there (`Abreast`, #243). */
  standAside(by: Point): void {
    this.aside.x = by.x;
    this.aside.y = by.y;
  }

  /** The rope their jumar is on, or none. */
  get rope(): string | null {
    return this.climber?.first ?? null;
  }

  /** The jumar on its rope this frame, for the rope to run through it: none when it's off. */
  get held(): Held | null {
    return this.holds ? this.holding : null;
  }

  /** The rope their second carabiner is on, or none. */
  get secondRope(): string | null {
    return this.climber?.second ?? null;
  }

  /** The second carabiner on its rope this frame, at its sling's end, for the rope to run through
   * it: none when it's off (#202). */
  get carried(): Held | null {
    return this.hangs ? this.hanging : null;
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
    this.trod.x = stepped.x(0);
    this.trod.y = stepped.y(0);
    this.point.x = this.trod.x + this.aside.x;
    this.point.y = this.trod.y + this.aside.y;
    this.first.x = stepped.x(1);
    this.first.y = stepped.y(1);
    this.second.x = stepped.x(2);
    this.second.y = stepped.y(2);
  }

  /** How they look on their way into a tent or out of it this frame (#258): none before the
   * first frame. */
  get passage(): EntryLook | null {
    return this.entered;
  }

  /** Draws them as they are this frame, `seconds` after the last, as the body shows them, the mask
   * on while their oxygen flows (`masked`), in the frame's light, no smaller than `size` allows,
   * `sag` lower where a ladder gives under them, and their headlamp shining if it's `lit`. In a
   * tent, `doorway`'s, they're not drawn: on their way through its door they go down on hands and
   * knees and crawl, and are gone behind its fly (#258). `beside` is whom a rescue has them with
   * (#241): on their rescuer's back, or at their casualty's limb. `hand` is the device they
   * took out, as the rule has it (#271), or none. */
  show(
    body: BodyView,
    masked: boolean,
    atmosphere: Atmosphere,
    seconds: number,
    size: LeastSize,
    sag = 0,
    lit = true,
    doorway: Doorway | null = null,
    beside: Beside = ClimberReading.ALONE,
    hand: HandView | null = null,
  ): void {
    const { climber, drawn } = this;
    if (climber === null) {
      return;
    }
    const sheltered = climber.sheltered && !climber.dead && !climber.falling;
    const entry = this.entry.advance(seconds, sheltered, this.trod.x, doorway);
    this.entered = entry;
    this.point.x = this.trod.x + this.aside.x + entry.shift;
    this.visible = !entry.inside || entry.passing;
    drawn.through =
      entry.passing && entry.facing !== null ? { facing: entry.facing, down: entry.down } : null;
    const grown = size.climber(ClimberFigure.HEIGHT_METRES);
    drawn.grown = grown;
    drawn.jumar = climber.first === null ? null : this.first;
    drawn.carabiner = climber.second === null ? null : this.second;
    drawn.hand = hand;
    const state = this.reading.read(climber, body, drawn, beside);
    // Hauled up a rescue line, they're drawn where the taut rope brings them (#279).
    if (climber.hauled) {
      const { drawnAt } = this.reading;
      this.point.x = drawnAt.x;
      this.point.y = drawnAt.y;
    }
    const pose = this.pose.advance(seconds, state);
    const { facing } = this.reading;
    // Turning round, the figure narrows to its edge and opens the other way; turning to face
    // the viewer, it narrows a quarter turn and the picture from the front opens in its place
    // (#235): on their feet only, and at no rescue's work.
    const afoot = !climber.falling && !climber.dead && !climber.down;
    const atWork = climber.helping !== null || climber.carrying !== null;
    // With a device out they're seen from the side, where the hand that holds it shows (#271).
    const towardViewer = climber.towardViewer && afoot && !atWork && state.device == null;
    // A rescuer leaves their pack to carry a casualty on their back, and the casualty's stays
    // where they lay (#241).
    const packed = climber.carrying === null && climber.carriedBy === null;
    this.figure.packOn(packed);
    this.rim.packOn(packed);
    const turned = this.turning.advance(seconds, facing, towardViewer);
    const fromTheFront = turned.front > 0;
    this.fromTheFront = fromTheFront;
    const across = (fromTheFront ? turned.front : turned.side) * grown;
    this.scale.set(across, grown);
    // Over the way they face: the layer's y is up, so the turn is the other way round.
    this.rotation = fromTheFront ? 0 : -pose.tilt * facing;
    // Their weight on the rope, it gives under them (#232): they sink, bob and hang still.
    const borne = this.borne(climber);
    this.give.advance(seconds, borne === null ? 0 : 1, borne ?? 0);
    const offset = fromTheFront ? ClimberFigure.ON_THE_SPOT : pose.offset;
    this.position.set(
      this.point.x + across * offset.x,
      this.point.y - sag - this.give.metres + grown * offset.y,
    );
    const moving = climber.moving && !climber.falling && !climber.dead;
    if (!climber.dead) {
      this.breathing.advance(seconds, Breathing.period(climber.altitude, body.tiredness, moving));
    }
    this.alpha = climber.dead ? ClimberFigure.DEAD_ALPHA : entry.shown;
    // Hanging with both cowstails on the one rope, they hang from one point of it (#243).
    const together = borne !== null && climber.first !== null && climber.second === climber.first;
    // Down on the snow, the cowstails that are off lie on it beside them (#241).
    const sat = climber.down && !climber.falling && !climber.hauled && climber.carriedBy === null;
    const floor = sat && !climber.dead ? pose.pelvis.y - ClimberPose.SEAT : null;
    this.draw(pose, masked, atmosphere, climber.dead, grown, size, together, floor);
    this.dress(pose, climber);
    // On hands and knees through a tent's door, the lamp lights the ground under their nose.
    const upright = !climber.dead && !climber.falling && entry.down < 0.5;
    this.drawLamp(pose, atmosphere, upright && lit ? state : null, seconds);
    this.drawBreath(atmosphere, climber.dead, atmosphere.gust * facing, lit);
    // Facing the viewer, the jumar hangs on its cowstail and the rope lies where it lay.
    this.holds = climber.first !== null && pose.jumar !== null && !fromTheFront;
    if (pose.jumar !== null) {
      this.holding.on.x = this.first.x;
      this.holding.on.y = this.first.y;
      // Hauling, the rope runs through both hands, pulled in hand over hand (#239); held tight
      // with nobody on it, a ladder's line, it's in both hands too.
      const [near, far] = pose.arms;
      const inHand = climber.haulHeld && !climber.falling && !climber.dead;
      const grip = inHand
        ? { x: (near.end.x + far.end.x) / 2, y: (near.end.y + far.end.y) / 2 }
        : pose.jumar;
      this.inLayer(grip, this.holding.drawn);
    }
    const carabiner = this.figure.carabiner;
    this.hangs = climber.second !== null && carabiner !== null && !fromTheFront;
    if (carabiner !== null) {
      this.hanging.on.x = this.second.x;
      this.hanging.on.y = this.second.y;
      this.inLayer(carabiner, this.hanging.drawn);
    }
    this.load(climber, pose, borne !== null);
    if (state.ladder === null && !climber.falling && !climber.dead) {
      this.kick(pose, grown);
    }
    this.knock(pose, state.onIce === true && upright, grown);
  }

  /** What their injuries show on the near limbs, and where their hips, their hands and their
   * hurt limb are drawn, in the layer (#241). From the front, a figure on their feet, nothing
   * shows: a sprain's wrap is under the gaiter's line there. */
  private dress(pose: Pose, climber: ClimberView): void {
    const { dressing, fromTheFront } = this;
    dressing.visible = !fromTheFront;
    if (!fromTheFront) {
      dressing.show(pose, climber.injuries);
    }
    this.inLayer(pose.pelvis, this.hipsAt);
    this.leaning = pose.lean;
    const [near, far] = pose.arms;
    this.inLayer(
      { x: (near.end.x + far.end.x) / 2, y: (near.end.y + far.end.y) / 2 },
      this.handsAt,
    );
    const wound = fromTheFront || climber.dead ? null : Dressing.wound(pose, climber.injuries);
    this.wounded = wound !== null;
    if (wound !== null) {
      this.inLayer(wound, this.woundAt);
    }
  }

  /** How much rope bears the climber's weight, in metres, from the cowstail that holds them to
   * the anchor above it (#232): hanging on the rope after a slip, or lowering down a step on it;
   * none on their feet, whose own weight is on their boots. */
  private borne(climber: ClimberView): number | null {
    const weighted = !climber.dead && (climber.hanging || climber.lowering);
    const rope = weighted ? (climber.first ?? climber.second) : null;
    if (rope === null) {
      return null;
    }
    const on = climber.first === null ? this.second : this.first;
    const points = this.ropes.rope(rope);
    const [from, to] = [points[0], points[points.length - 1]];
    if (from === undefined || to === undefined) {
      return null;
    }
    const anchor = from.y >= to.y ? from : to;
    return Math.hypot(anchor.x - on.x, anchor.y - on.y);
  }

  /** The weight on each cowstail's rope this frame (#232): all of it on the one that holds a
   * climber who hangs or lowers, the jumar's if it's on, with the quiver of its coming taut; on
   * their feet, the arm's pull on the jumar between its strokes; and a rope held tight by hand,
   * the haul held, taut both ways from the hands on it: to whoever hangs on it, hauled up, and
   * back to its anchor (#239), or a ladder's line with nobody to haul. */
  private load(climber: ClimberView, pose: Pose, weighted: boolean): void {
    const { holding, hanging } = this;
    const onJumar = weighted && climber.first !== null;
    const apart = climber.second !== climber.first;
    const tight = climber.haulHeld && !climber.falling && !climber.dead;
    holding.load = onJumar || tight ? 1 : pose.pull;
    holding.pulled = tight;
    holding.quiver = onJumar ? this.give.quiver : 0;
    hanging.load = weighted && (climber.first === null || apart) ? 1 : 0;
    hanging.pulled = false;
    hanging.quiver = weighted && climber.first === null ? this.give.quiver : 0;
  }

  /** Chips of ice knocked off where each pick struck in this frame, and, `onIce`, where each
   * boot's front points kicked in. */
  private knock(pose: Pose, onIce: boolean, grown: number): void {
    for (const { at, into, poor } of pose.strikes) {
      this.inLayer(at, this.chip);
      this.wayInLayer({ x: -into.x, y: -into.y }, this.out);
      this.chips.burst(
        this.chip.x,
        this.chip.y,
        this.out.x,
        this.out.y,
        grown,
        poor ? "poor" : "pick",
      );
      // And a little cloud of the ice's dust, more where it shatters.
      this.puffs.kick(this.chip.x, this.chip.y, grown * (poor ? 0.75 : 0.5));
    }
    if (!onIce) {
      return;
    }
    for (const leg of [0, 1] as const) {
      if (pose.landed[leg]) {
        const ankle = pose.legs[leg].end;
        const sole = pose.soles[leg];
        const cos = Math.cos(sole);
        const sin = Math.sin(sole);
        const { x, y } = ClimberFigure.FRONT_POINTS;
        const under = y - ClimberPose.ANKLE;
        this.inLayer(
          { x: ankle.x + x * cos - under * sin, y: ankle.y + x * sin + under * cos },
          this.chip,
        );
        this.wayInLayer(ClimberFigure.KICKED_OUT, this.out);
        this.chips.burst(this.chip.x, this.chip.y, this.out.x, this.out.y, grown, "kick");
      }
    }
  }

  /** Which way a way of the figure's goes in the layer, a length of 1. */
  private wayInLayer(way: Joint, into: Spot): void {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const { x: across, y: grown } = this.scale;
    const x = cos * across * way.x - sin * grown * way.y;
    const y = sin * across * way.x + cos * grown * way.y;
    const length = Math.hypot(x, y) || 1;
    into.x = x / length;
    into.y = y / length;
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

  /** Where a point of the layer is in the figure's metres, standing upright: a carabiner on its
   * rope, for the cowstail drawn to it. */
  private inFigure(spot: Spot): Joint {
    const { x: across, y: grown } = this.scale;
    return {
      x: (spot.x - this.position.x) / (across || 1),
      y: (spot.y - this.position.y) / (grown || 1),
    };
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
   * however small the figure, both to one point of the rope `together`, lying on the snow
   * `floor` high where they sit on it; and the rim behind it. */
  private draw(
    pose: Pose,
    masked: boolean,
    atmosphere: Atmosphere,
    dead: boolean,
    grown: number,
    size: LeastSize,
    together = false,
    floor: number | null = null,
  ): void {
    const { figure, front } = this;
    const swell = ClimberFigure.CHEST_SWELL * this.breathing.chest;
    figure.visible = !this.fromTheFront;
    front.visible = this.fromTheFront;
    if (this.fromTheFront) {
      const thin = size.line(ClimberFigure.COWSTAIL_WIDTH * grown) / grown;
      front.place(swell, masked, atmosphere.palette.skyHorizon);
      front.hold(
        this.climber?.first == null ? null : this.inFigure(this.first),
        this.climber?.second == null ? null : this.inFigure(this.second),
        thin,
      );
      this.drawRim(pose, swell, masked, atmosphere, dead);
      return;
    }
    figure.recolour(atmosphere.palette);
    figure.place(pose, swell, masked);
    const thin = size.line(ClimberFigure.COWSTAIL_WIDTH * grown) / grown;
    figure.hold(
      pose,
      {
        jumar: ClimberFigure.COWSTAIL_METRES / grown,
        carabiner: ClimberFigure.SLING_METRES / grown,
      },
      thin,
      together,
      floor,
    );
    this.drawRim(pose, swell, masked, atmosphere, dead);
  }

  /** The rim of the hour's light along the body's edge on the side the sun is: the figure's
   * silhouette a little wider and moved towards it, behind the body, so only that edge shows;
   * seen from the front, the front figure's own (#235). */
  private drawRim(
    pose: Pose,
    swell: number,
    masked: boolean,
    atmosphere: Atmosphere,
    dead: boolean,
  ): void {
    const { light, palette } = atmosphere;
    const { rim, front, fromTheFront } = this;
    const strength = ClimberFigure.RIM_ALPHA;
    const alpha =
      (strength.night + (strength.day - strength.night) * light.daylight) * (1 - light.glow) +
      strength.glow * light.glow;
    const edge = ClimberFigure.RIM_METRES;
    rim.visible = !dead && !fromTheFront;
    // From the front, the figure's x is the viewer's right, whichever way they faced.
    front.light(!dead && fromTheFront, palette.rim, alpha, {
      x: light.glowSide * edge,
      y: edge * 0.4,
    });
    if (dead || fromTheFront) {
      return;
    }
    rim.alpha = alpha;
    rim.tint = palette.rim;
    // The figure's x is the way it faces, and turns over halfway round.
    const side = light.glowSide * this.turning.facing;
    rim.position.set(side * edge, edge * 0.4);
    rim.place(pose, swell, masked);
  }

  /** The headlamp's light, as bright as the hour asks, while the climber is on their feet, from
   * the pose's `state`: the halo round the lamp, the beam from the forehead along the slope the
   * boots stand on and a little below it, as far as the ground lets it, a wall's face or the snow
   * (#202), and the pool it throws where it comes down to them, ahead of the climber's point. Drawn
   * once, and only placed each frame. */
  private drawLamp(
    pose: Pose,
    atmosphere: Atmosphere,
    state: PoseState | null,
    seconds: number,
  ): void {
    const { lamps } = atmosphere.light;
    const on = lamps > 0.01 && state !== null;
    const outward = on && this.fromTheFront;
    this.cone.visible = on && !outward;
    this.halo.visible = on && !outward;
    this.pool.visible = on;
    this.glow.visible = outward;
    this.pool.scale.set(outward ? ClimberFigure.GLOW.pool : 1);
    this.shining = null;
    if (!on) {
      this.aim = null;
      return;
    }
    if (outward) {
      // Facing the viewer, the lamp shines out of the picture (#235): a glow round it and a pool
      // at their feet, no beam across the slope.
      const { GLOW, POOL } = ClimberFigure;
      this.aim = null;
      this.lit.clear();
      this.glow.position.set(FrontRig.LAMP.x, FrontRig.LAMP.y);
      this.glow.alpha = GLOW.alpha * lamps;
      this.pool.position.set(0, 0);
      this.pool.rotation = 0;
      this.pool.alpha = POOL.alpha * lamps;
      return;
    }
    // The ground from where the figure stands, in its metres: the boots', which the beam tips
    // along, and as it is, walls and all, which it lights.
    const { offset } = pose;
    const under = (x: number): number => state.ground(x + offset.x) - offset.y;
    const lights = (x: number): number => state.terrain(x + offset.x) - offset.y;
    const slope = Math.atan(ClimberFigure.rise(under));
    const from = this.figure.lamp;
    // Up a wall the beam goes where the eyes look, across the top as they come level with it
    // (#222); elsewhere along the slope the boots stand on. It swings round over a moment.
    const aim = (pose.gaze ?? slope) - ClimberFigure.LAMP_DOWN;
    const swing = 1 - Math.exp(-Math.max(seconds, 0) / ClimberFigure.LAMP_SWING_SECONDS);
    this.aim = this.aim === null ? aim : this.aim + (aim - this.aim) * swing;
    const angle = this.aim;
    const reach = ClimberFigure.LAMP_REACH;
    this.cone.position.set(from.x, from.y);
    this.cone.rotation = angle;
    this.cone.scale.set(reach);
    this.cone.alpha = ClimberFigure.LAMP_ALPHA * lamps;
    this.halo.position.set(from.x, from.y);
    this.halo.alpha = ClimberFigure.HALO.alpha * lamps;
    const beam = new Beam(from, angle, reach, ClimberFigure.LAMP_SPREAD, lamps);
    // The cone as far as the ground lets it: none into the ice of a wall, or under the snow.
    const fan = beam.fan(lights, ClimberFigure.LAMP_RAYS);
    this.lit.clear();
    this.cone.visible = fan.length > 0;
    if (fan.length > 0) {
      this.lit.poly(fan.flatMap(({ x, y }) => [x, y])).fill(0xffffff);
    }
    const pool = beam.meets(lights);
    this.pool.visible = pool !== null;
    if (pool !== null) {
      const along = Math.hypot(pool.x - from.x, pool.y - from.y);
      this.pool.position.set(pool.x, pool.y);
      // Along what it lights: the snow's slope, or a wall's face standing up.
      const near = ClimberFigure.RISE_METRES / 4;
      this.pool.rotation = Math.atan2(lights(pool.x + near) - lights(pool.x - near), 2 * near);
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

  /** The glow of a lamp that shines out of the picture (#235), drawn once round it: bright at the
   * lamp and faint a hand's breadth out, and a few short rays through it, fainter still. */
  private static drawGlow(): Graphics {
    const { radius, rays, ray } = ClimberFigure.GLOW;
    const glow = new Graphics().circle(0, 0, radius).fill(
      ClimberFigure.radial({ x: 0.5, y: 0.5 }, 0.5, [
        [0, 1],
        [0.12, 0.6],
        [0.3, 0.16],
        [0.65, 0.05],
        [1, 0],
      ]),
    );
    for (let index = 0; index < rays; index += 1) {
      const angle = (Math.PI * index) / rays + Math.PI / (2 * rays);
      const along = { x: Math.cos(angle) * ray, y: Math.sin(angle) * ray };
      const across = { x: -Math.sin(angle) * 0.012, y: Math.cos(angle) * 0.012 };
      glow
        .poly([across.x, across.y, along.x, along.y, -across.x, -across.y, -along.x, -along.y])
        .fill({ color: Palette.LAMP, alpha: index % 2 === 0 ? 0.16 : 0.09 });
    }
    glow.blendMode = "add";
    return glow;
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
   * face, and thinning; warm in the lamp's light at night, while it's `lit`. */
  private drawBreath(atmosphere: Atmosphere, dead: boolean, downwind: number, lit: boolean): void {
    this.breath.clear();
    if (dead || !this.breathing.exhaling) {
      return;
    }
    const glow = lit ? atmosphere.light.lamps * 0.6 : 0;
    const colour = Palette.mix(Palette.BREATH, Palette.LAMP, glow);
    const { from, to } = Breathing.EXHALE;
    const share = (this.breathing.where - from) / (to - from);
    const size = ClimberFigure.BREATH_RADIUS * (0.4 + 0.6 * share);
    // Facing the viewer, the breath comes out towards them, and drifts only on the wind.
    const outward = this.fromTheFront;
    const mouth = outward ? FrontRig.MOUTH : this.figure.mouth;
    const calm = outward ? 0 : 1 - Math.abs(downwind);
    const x =
      mouth.x +
      (outward ? 0 : ClimberFigure.BREATH_AHEAD) +
      share * (ClimberFigure.BREATH_DRIFT * calm + ClimberFigure.BREATH_BLOWN * downwind);
    const y = mouth.y + 0.08 * share;
    const alpha = 1 - share;
    this.breath.circle(x, y, size).fill({ color: colour, alpha: 0.45 * alpha });
    this.breath
      .circle(x - size * 0.6, y - size * 0.3, size * 0.7)
      .fill({ color: colour, alpha: 0.3 * alpha });
  }
}
