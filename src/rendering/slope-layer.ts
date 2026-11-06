import { Graphics, Particle, ParticleContainer, Texture } from "pixi.js";

import type { ClimberView, Point, SlopePhysics, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import type { Body, ClimberId, ObjectiveHazards } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import { CampSigns } from "./camp-signs";
import type { CampStretch } from "./camp-signs";
import { ClimberFigure } from "./climber-figure";
import { ClimberPose } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import { Drift } from "./drift";
import { HazardDrawing } from "./hazard-drawing";
import { LadderBow } from "./ladder-bow";
import { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { PrayerFlags } from "./prayer-flags";
import { RopeCurve } from "./rope-curve";
import type { Held } from "./rope-curve";
import { SlopeDetails } from "./slope-details";
import { SnowPuffs } from "./snow-puffs";
import { SteppedPoints } from "./stepped-points";
import type { BetweenSteps } from "./stepped-points";

interface DrawnRope {
  readonly id: string;
  readonly graphics: Graphics;
  /** Its chain as drawn between the steps, and the curve the picture draws through it. */
  readonly chain: SteppedPoints;
  readonly curve: RopeCurve;
  /** The jumars on it this frame, and how many there were when it was last drawn. */
  readonly held: Held[];
  heldBefore: number;
  /** Whether it hung free of the snow anywhere when it was last drawn, and on what gust; whether
   * it's to be drawn again once it's in view. */
  free: boolean;
  gustBefore: number;
  stale: boolean;
}

interface DrawnLadder {
  readonly id: string;
  readonly start: Point;
  readonly finish: Point;
  readonly length: number;
  /** Whether it lies across a crevasse, rather than up a wall: one across gives under a climber,
   * and has a hand line. */
  readonly across: boolean;
  readonly graphics: Graphics;
  /** How it gives, how far along it each climber on it is drawn this frame, and whether it was
   * drawn bowed. */
  readonly bow: LadderBow;
  readonly loads: number[];
  bowed: boolean;
}

interface DrawnClimber {
  readonly id: ClimberId;
  readonly figure: ClimberFigure;
  /** The climber as the physics showed them after the frame's steps. */
  view: ClimberView | null;
}

/** The stretch of the slope in view, in metres across, with a margin each side. */
interface InView {
  readonly left: number;
  readonly right: number;
}

/**
 * The slope itself, at the camera's own depth: the ground as the physics has it, its snow marked
 * with sastrugi and the boot track of the climbers before, its walls of ice, its ladders, its
 * ropes with their pickets, its hazards, the camps' tents, lit from inside at night, the prayer
 * flags over Base Camp, and every climber on it, drawn by `ClimberFigure`; the snow their boots
 * kick up, the spindrift the wind blows along the snow around the camera, and the veil of a cloudy
 * day behind the slope. In the picture alone, the ground runs on level past the section's ends, so
 * the view far out shows no cliff there. What moves is drawn between the steps
 * (docs/guidelines/graphics.md → Motion): the climbers and the ropes, which `RopeCurve` draws
 * smooth, through the jumar in a climber's hand, and swaying on the gust where they hang free; a
 * ladder across a crevasse gives under the climbers on it. The snow and what marks it are drawn
 * once in white and tinted by the hour's light; the lines and the ground's edge when the scale
 * changes, since they never get thinner than `LeastSize` allows; a rope or a ladder when it moves
 * too, and the tents and the flags while the wind blows on them, in view; and the climbers and
 * what comes down each frame.
 */
export class SlopeLayer extends ParallaxLayer {
  private static readonly SURFACE_METRES = 0.15;
  private static readonly ROPE_METRES = 0.07;
  /** The dark edge under the rope, as a share of its width each side. */
  private static readonly ROPE_EDGE = 0.5;
  private static readonly ANCHOR_METRES = 0.12;
  private static readonly PICKET = { length: 0.6, width: 0.06 };
  private static readonly LADDER_HALF_WIDTH = 0.2;
  private static readonly RAIL_METRES = 0.05;
  /** A ladder's rails, bowed, are drawn in so many pieces; a hand line across a crevasse is
   * this wide, on posts this much over the line, and sags so far in its middle by itself. */
  private static readonly BOW_PIECES = 12;
  private static readonly HAND_LINE = { width: 0.03, over: 0.1, sag: 0.03 };
  private static readonly TENT_EDGE_METRES = 0.08;
  private static readonly TENT_GLOW_METRES = 1.6;
  private static readonly TENT_GLOW_ALPHA = 0.35;
  /** How far the full gust pushes in the middle of a tent's side, and how often it comes and
   * goes; a side's curve is drawn in so many pieces. */
  private static readonly RIPPLE_METRES = 0.07;
  private static readonly RIPPLE_HZ = 0.5;
  private static readonly SIDE_PIECES = 8;
  /** The camp the prayer flags fly over; their mast's width and their strings'. */
  private static readonly FLAGS_OVER = "base-camp";
  private static readonly MAST_METRES = 0.08;
  private static readonly STRING_METRES = 0.02;
  /** How deep the snow's shade runs under the surface, and how strong it is. */
  private static readonly SHADE_METRES = 1.2;
  private static readonly SHADE_ALPHA = 0.12;
  private static readonly SASTRUGI_METRES = 0.06;
  private static readonly SASTRUGI_ALPHA = 0.6;
  private static readonly PRINT = { length: 0.14, width: 0.05 };
  private static readonly WALL_METRES = 0.6;
  private static readonly WALL_EDGE_METRES = 0.1;
  /** How far below its lowest point the ground is filled. */
  private static readonly BELOW_METRES = 80;
  /** How far the ground runs on, level, past each end of the section: wider than 100 m of slope
   * on the widest screen. */
  private static readonly RUN_OUT_METRES = 300;
  /** How far past the screen's edges a rope or a camp counts as in view. */
  private static readonly MARGIN_METRES = 3;
  /** The spindrift: how far each side of the camera it blows, how high over the snow, how big,
   * how fast at the full gust, and from what gust it shows. */
  private static readonly DRIFT_SPAN = 120;
  private static readonly DRIFT_HEIGHT = { min: 0.05, max: 1.6 };
  private static readonly DRIFT_SIZE = { min: 0.05, max: 0.14 };
  private static readonly DRIFT_SPEED = { min: 4, max: 14 };
  private static readonly DRIFT_FROM_GUST = 0.05;
  private static readonly DRIFT_ALPHA = 0.8;

  private readonly ground: readonly Point[];
  private readonly veil = new Graphics();
  private readonly snow = new Graphics();
  private readonly shade = new Graphics();
  private readonly sastrugi = new Graphics();
  private readonly track = new Graphics();
  private readonly walls = new Graphics();
  private readonly wallEdges = new Graphics();
  private readonly surface = new Graphics();
  private readonly tentGlow = new Graphics();
  private readonly tentShapes: readonly (readonly Point[])[];
  private readonly tentGraphics = new Graphics();
  private readonly flags: PrayerFlags | null;
  private readonly flagGraphics = new Graphics();
  /** How far across each tent, and the flags' strings, reach. */
  private readonly campSpans: readonly InView[];
  private readonly ladders: readonly DrawnLadder[];
  private readonly ropes: readonly DrawnRope[];
  private readonly figures: readonly DrawnClimber[];
  private readonly playerFigure: ClimberFigure | null;
  private readonly puffs = new SnowPuffs();
  private readonly puffGraphics = new Graphics();
  private readonly hazards: HazardDrawing;
  private readonly drift: Drift;
  private readonly driftContainer: ParticleContainer;
  private readonly motes: readonly Particle[];
  /** How many tents stand in the camps. */
  readonly tents: number;
  /** The scale the lines were last drawn at, in pixels a metre: none yet. */
  private drawnAt = 0;
  private tintedWith: Atmosphere | null = null;
  /** The scale and the gust the camps were last drawn at: none yet; whether puffs were drawn. */
  private campsDrawnAt = 0;
  private campGust = 0;
  private puffsShown = false;
  private readonly heightAt = (x: number): number => this.physics.terrain.height(x);
  private readonly drawPuff = (x: number, y: number, radius: number, alpha: number): void => {
    this.puffGraphics.circle(x, y, radius).fill({ color: 0xffffff, alpha });
  };
  private readonly drawFlag = (
    colour: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ): void => {
    this.flagGraphics
      .moveTo(x0, y0)
      .lineTo(x1, y1)
      .lineTo(x2, y2)
      .lineTo(x3, y3)
      .closePath()
      .fill(Palette.PRAYER_FLAGS[colour] ?? Palette.TENT);
  };

  constructor(
    private readonly physics: SlopePhysics,
    hazards: ObjectiveHazards,
    private readonly body: Body,
    camps: readonly CampStretch[],
    climbers: readonly ClimberId[],
    player: ClimberId,
    seed: number,
    motes: number,
  ) {
    super("slope", { x: 1, y: 1 });
    const { terrain } = physics;
    this.addChild(this.veil);
    this.hazards = new HazardDrawing(hazards, terrain);
    this.ground = SlopeLayer.runOut(terrain);
    this.drawSnow();
    this.drawDetails(new SlopeDetails(terrain, seed));
    this.addChild(
      this.snow,
      this.shade,
      this.sastrugi,
      this.walls,
      this.wallEdges,
      this.track,
      this.surface,
      this.hazards.standing,
      this.tentGlow,
      this.flagGraphics,
      this.tentGraphics,
    );
    const signs = new CampSigns(terrain);
    this.tentShapes = camps.flatMap((camp) => signs.tents(camp));
    this.tents = this.tentShapes.length;
    SlopeLayer.glow(this.tentShapes, this.tentGlow);
    const flown = camps.find(({ id }) => id === SlopeLayer.FLAGS_OVER);
    this.flags = flown === undefined ? null : new PrayerFlags(terrain, flown);
    this.campSpans = [...this.tentShapes, ...(this.flags?.strings ?? [])].map((points) =>
      SlopeLayer.across(points),
    );
    this.ladders = physics.ladders.map((id) => {
      const [start, finish] = physics.ladder(id);
      if (start === undefined || finish === undefined) {
        throw new RangeError("A ladder needs two ends to draw");
      }
      const length = Math.hypot(finish.x - start.x, finish.y - start.y);
      const graphics = new Graphics();
      this.addChild(graphics);
      const across = Math.abs(finish.y - start.y) < length / 2;
      const bow = new LadderBow(length);
      return { id, start, finish, length, across, graphics, bow, loads: [], bowed: false };
    });
    this.ropes = physics.ropes.map((id) => {
      const graphics = new Graphics();
      this.addChild(graphics);
      return {
        id,
        graphics,
        chain: new SteppedPoints(),
        curve: new RopeCurve(),
        held: [],
        heldBefore: 0,
        free: false,
        gustBefore: 0,
        stale: true,
      };
    });
    this.figures = climbers.map((id) => {
      const suit = id === player ? Palette.PLAYER_SUIT : Palette.OTHER_SUIT;
      const figure = new ClimberFigure(suit, physics, this.puffs);
      this.addChild(figure);
      return { id, figure, view: null };
    });
    this.playerFigure = this.figures.find(({ id }) => id === player)?.figure ?? null;
    this.addChild(this.puffGraphics);
    this.drift = new Drift(
      {
        count: motes,
        from: -SlopeLayer.DRIFT_SPAN / 2,
        to: SlopeLayer.DRIFT_SPAN / 2,
        height: SlopeLayer.DRIFT_HEIGHT,
        size: SlopeLayer.DRIFT_SIZE,
        speed: SlopeLayer.DRIFT_SPEED,
      },
      SeededRandom.fromSeed(seed + 3),
    );
    const texture = Texture.WHITE;
    this.driftContainer = new ParticleContainer({
      dynamicProperties: {
        position: true,
        vertex: false,
        rotation: false,
        uvs: false,
        color: false,
      },
    });
    this.motes = this.drift.motes.map((mote) => {
      const particle = new Particle({
        texture,
        x: mote.x,
        y: mote.y,
        scaleX: mote.size / texture.width,
        scaleY: (mote.size * 0.5) / texture.height,
        anchorX: 0.5,
        anchorY: 0.5,
      });
      this.driftContainer.addParticle(particle);
      return particle;
    });
    this.addChild(this.driftContainer, this.hazards.falling);
  }

  /** How many climbers are drawn. */
  get climbers(): number {
    return this.figures.length;
  }

  /** Whether a hazard is going now, which shakes the picture. */
  get shaking(): boolean {
    return this.hazards.going;
  }

  /** Where the player is drawn this frame, between the steps: what the camera follows. */
  get player(): Point | null {
    return this.playerFigure?.at ?? null;
  }

  /** The ropes and the climbers as the frame's steps left them, drawn `between` the steps. */
  move(between: BetweenSteps): void {
    for (const rope of this.ropes) {
      rope.chain.follow(this.physics.rope(rope.id), between);
    }
    for (const climber of this.figures) {
      climber.view = this.physics.climber(climber.id);
      climber.figure.move(climber.view, between);
    }
  }

  /** Each frame, `seconds` after the last, as the camera sees it and in this frame's air: the
   * snow in the hour's light, the lines at the camera's scale, the climbers as they are, the
   * ladders under them and the ropes through their hands, the camps in the wind, the snow they
   * kick up, the spindrift on the gust, and what's coming down. */
  draw(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    this.hazards.draw(seconds);
    this.light(atmosphere);
    const { pixelsPerMetre } = camera;
    const size = new LeastSize(pixelsPerMetre);
    const rescaled = pixelsPerMetre !== this.drawnAt;
    if (rescaled) {
      this.drawnAt = pixelsPerMetre;
      this.drawSurface(size);
    }
    const view = SlopeLayer.inView(camera);
    this.puffs.advance(seconds, atmosphere.gust);
    this.load();
    for (const { id, figure, view: climber } of this.figures) {
      const sag = this.sagUnder(climber, figure.at);
      figure.show(this.body.climber(id), atmosphere, seconds, size, sag);
    }
    for (const ladder of this.ladders) {
      if (rescaled || ladder.bowed || ladder.loads.length > 0) {
        this.drawLadder(ladder, size);
      }
    }
    this.drawRopes(size, rescaled, atmosphere, view);
    const { gust, elapsed } = atmosphere;
    const campsDue = this.campsDrawnAt !== pixelsPerMetre || gust > 0 || this.campGust > 0;
    if (campsDue && this.campsInView(view)) {
      this.campsDrawnAt = pixelsPerMetre;
      this.drawCamps(gust, elapsed, size);
    }
    this.drawPuffs();
    this.blow(seconds, camera, atmosphere);
    this.drawVeil(camera, atmosphere);
  }

  /** The snow and the ice in the hour's light: tinted again when the colours change. */
  private light(atmosphere: Atmosphere): void {
    if (this.tintedWith === null || atmosphere.recoloured(this.tintedWith)) {
      const { palette } = atmosphere;
      this.snow.tint = palette.snowTint;
      this.shade.tint = palette.snowDeep;
      this.sastrugi.tint = palette.snowShade;
      this.track.tint = palette.track;
      this.walls.tint = palette.iceWall;
      this.wallEdges.tint = palette.iceEdge;
      this.surface.tint = palette.snowCrest;
      this.hazards.standing.tint = palette.snowTint;
      this.hazards.falling.tint = palette.snowTint;
      this.driftContainer.tint = palette.snowCrest;
      this.puffGraphics.tint = palette.snowCrest;
    }
    this.tintedWith = atmosphere;
    this.tentGlow.alpha = atmosphere.light.lamps * SlopeLayer.TENT_GLOW_ALPHA;
    this.tentGlow.visible = this.tentGlow.alpha > 0.01;
  }

  /** Where along each ladder across a crevasse each climber on it is drawn, this frame. */
  private load(): void {
    for (const ladder of this.ladders) {
      ladder.loads.length = 0;
    }
    for (const { figure, view } of this.figures) {
      const ladder = this.ladderUnder(view);
      ladder?.loads.push(SlopeLayer.alongLadder(ladder, figure.at));
    }
  }

  /** The ladder across a crevasse a climber is on, on their feet, or none. */
  private ladderUnder(view: ClimberView | null): DrawnLadder | null {
    if (view === null || view.ladder === null || view.falling || view.dead) {
      return null;
    }
    for (const ladder of this.ladders) {
      if (ladder.id === view.ladder) {
        return ladder.across ? ladder : null;
      }
    }
    return null;
  }

  /** How far the ladder under a climber drawn `at` gives there. */
  private sagUnder(view: ClimberView | null, at: Point): number {
    const ladder = this.ladderUnder(view);
    if (ladder === null) {
      return 0;
    }
    return ladder.bow.sag(ladder.loads, SlopeLayer.alongLadder(ladder, at));
  }

  private static alongLadder({ start, finish, length }: DrawnLadder, at: Point): number {
    const along = (at.x - start.x) * (finish.x - start.x) + (at.y - start.y) * (finish.y - start.y);
    return along / (length || 1);
  }

  /** A ladder's rails and rungs, every `ClimberReading.RUNG_METRES` as the climbers' boots find
   * them, bowed under the climbers on it; across a crevasse, its hand line on a post at each end,
   * at the height of their hands, going down with the ladder under them. */
  private drawLadder(ladder: DrawnLadder, size: LeastSize): void {
    const { start, finish, length, graphics, bow, loads, across } = ladder;
    const alongX = (finish.x - start.x) / (length || 1);
    const alongY = (finish.y - start.y) / (length || 1);
    const railX = -alongY * SlopeLayer.LADDER_HALF_WIDTH;
    const railY = alongX * SlopeLayer.LADDER_HALF_WIDTH;
    const width = size.line(SlopeLayer.RAIL_METRES);
    const bowed = across && loads.length > 0;
    const sag = (along: number): number => (bowed ? bow.sag(loads, along) : 0);
    const pieces = bowed ? SlopeLayer.BOW_PIECES : 1;
    graphics.clear();
    const rails = (): void => {
      for (const side of [1, -1]) {
        for (let piece = 0; piece <= pieces; piece += 1) {
          const along = (length * piece) / pieces;
          const x = start.x + alongX * along + side * railX;
          const y = start.y + alongY * along + side * railY - sag(along);
          if (piece === 0) {
            graphics.moveTo(x, y);
          } else {
            graphics.lineTo(x, y);
          }
        }
      }
      const step = ClimberReading.RUNG_METRES;
      for (let rung = step / 2; rung < length; rung += step) {
        const x = start.x + alongX * rung;
        const y = start.y + alongY * rung - sag(rung);
        graphics.moveTo(x - railX, y - railY).lineTo(x + railX, y + railY);
      }
    };
    rails();
    graphics.stroke({ width: width * 2.2, color: Palette.LADDER_SHADE, cap: "round" });
    rails();
    graphics.stroke({ width, color: Palette.LADDER, cap: "round" });
    if (across) {
      SlopeLayer.handLine(graphics, ladder, sag, size);
    }
    ladder.bowed = bowed;
  }

  /** The hand line across a ladder over a crevasse, where the climbers' hands hold it as
   * `ClimberPose` has them, `ClimberPose.LINES` over the rungs at the figures' size, on a post at
   * each end. */
  private static handLine(
    graphics: Graphics,
    { start, finish, length }: DrawnLadder,
    sag: (along: number) => number,
    size: LeastSize,
  ): void {
    const { HAND_LINE, BOW_PIECES } = SlopeLayer;
    const high = ClimberPose.LINES * size.climber(ClimberFigure.HEIGHT_METRES);
    const width = size.line(HAND_LINE.width);
    for (const end of [start, finish]) {
      graphics.moveTo(end.x, end.y).lineTo(end.x, end.y + high + HAND_LINE.over);
    }
    graphics.stroke({ width: width * 1.6, color: Palette.PICKET, cap: "round" });
    for (let piece = 0; piece <= BOW_PIECES; piece += 1) {
      const share = piece / BOW_PIECES;
      const along = length * share;
      const x = start.x + (finish.x - start.x) * share;
      const y =
        start.y +
        (finish.y - start.y) * share +
        high -
        sag(along) -
        4 * HAND_LINE.sag * share * (1 - share);
      if (piece === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }
    graphics.stroke({ width, color: Palette.ANCHOR, cap: "round", join: "round" });
  }

  /** Each rope in view that moved, or is held, or hangs free while the wind blows: through the
   * jumars in the climbers' hands, swaying on the gust. A rope out of view that would have been
   * drawn is drawn once it's back in it. */
  private drawRopes(
    size: LeastSize,
    rescaled: boolean,
    atmosphere: Atmosphere,
    view: InView,
  ): void {
    const { gust, elapsed } = atmosphere;
    for (const rope of this.ropes) {
      rope.held.length = 0;
      for (const { figure } of this.figures) {
        const { held } = figure;
        if (held !== null && figure.rope === rope.id) {
          rope.held.push(held);
        }
      }
      const due =
        rescaled ||
        rope.stale ||
        rope.chain.moved ||
        rope.held.length > 0 ||
        rope.heldBefore > 0 ||
        (rope.free && (gust > 0 || rope.gustBefore > 0));
      if (!due) {
        continue;
      }
      if (!SlopeLayer.chainInView(rope.chain, view)) {
        rope.stale = true;
        continue;
      }
      rope.free = rope.curve.shape(rope.chain, rope.held, this.heightAt, gust, elapsed);
      rope.heldBefore = rope.held.length;
      rope.gustBefore = gust;
      rope.stale = false;
      SlopeLayer.rope(rope.graphics, rope.curve, size);
    }
  }

  private static chainInView(chain: SteppedPoints, { left, right }: InView): boolean {
    let least = Infinity;
    let most = -Infinity;
    for (let index = 0; index < chain.length; index += 1) {
      least = Math.min(least, chain.x(index));
      most = Math.max(most, chain.x(index));
    }
    return most >= left && least <= right;
  }

  /** The stretch of the slope the camera sees, and a little more. */
  private static inView(camera: Camera): InView {
    const { x } = camera.position;
    const { anchor, pixelsPerMetre } = camera;
    const margin = SlopeLayer.MARGIN_METRES;
    return {
      left: x - anchor.x / pixelsPerMetre - margin,
      right: x + (camera.screen.width - anchor.x) / pixelsPerMetre + margin,
    };
  }

  /** Whether a tent, or the flags, are in view. */
  private campsInView({ left, right }: InView): boolean {
    for (const span of this.campSpans) {
      if (span.right >= left && span.left <= right) {
        return true;
      }
    }
    return false;
  }

  /** How far across these points reach. */
  private static across(points: readonly Point[]): InView {
    const xs = points.map(({ x }) => x);
    return { left: Math.min(...xs), right: Math.max(...xs) };
  }

  /** The tents, their sides pushed in and out on the gust, and the flags over Base Camp blown
   * out on it, at `elapsed` seconds of picture. */
  private drawCamps(gust: number, elapsed: number, size: LeastSize): void {
    this.campGust = gust;
    const graphics = this.tentGraphics;
    graphics.clear();
    for (const [index, tent] of this.tentShapes.entries()) {
      const wave = Math.sin(2 * Math.PI * (SlopeLayer.RIPPLE_HZ * elapsed + 0.37 * index));
      SlopeLayer.tent(graphics, tent, gust * SlopeLayer.RIPPLE_METRES * (0.55 + 0.45 * wave));
    }
    const flags = this.flagGraphics;
    flags.clear();
    if (this.flags === null) {
      return;
    }
    const { foot, top } = this.flags.mast;
    flags
      .moveTo(foot.x, foot.y)
      .lineTo(top.x, top.y)
      .stroke({ width: size.line(SlopeLayer.MAST_METRES), color: Palette.PICKET, cap: "round" });
    for (const string of this.flags.strings) {
      for (const [index, { x, y }] of string.entries()) {
        if (index === 0) {
          flags.moveTo(x, y);
        } else {
          flags.lineTo(x, y);
        }
      }
    }
    flags.stroke({
      width: size.line(SlopeLayer.STRING_METRES),
      color: Palette.ANCHOR,
      join: "round",
    });
    this.flags.forEach(elapsed, gust, this.drawFlag);
  }

  /** The snow the boots kicked up, while there's any in the air. */
  private drawPuffs(): void {
    const live = this.puffs.live > 0;
    if (!live && !this.puffsShown) {
      return;
    }
    this.puffsShown = live;
    this.puffGraphics.clear();
    this.puffs.forEach(this.drawPuff);
  }

  /** The spindrift along the snow around the camera, blown by the gust. */
  private blow(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    const { gust, elapsed } = atmosphere;
    const strength = Math.max(
      0,
      (gust - SlopeLayer.DRIFT_FROM_GUST) / (1 - SlopeLayer.DRIFT_FROM_GUST),
    );
    this.driftContainer.alpha = Math.min(1, strength * 1.5) * SlopeLayer.DRIFT_ALPHA;
    this.driftContainer.visible = this.driftContainer.alpha > 0.01;
    if (!this.driftContainer.visible) {
      return;
    }
    const { terrain } = this.physics;
    const cameraX = camera.position.x;
    this.driftContainer.position.set(cameraX, 0);
    this.drift.blow(seconds, gust, (x) => terrain.height(cameraX + x), elapsed);
    for (const [index, mote] of this.drift.motes.entries()) {
      const particle = this.motes[index];
      if (particle !== undefined) {
        particle.x = mote.x;
        particle.y = mote.y;
      }
    }
  }

  /** The weather's veil over everything behind the slope: cloud between the eye and the
   * mountain, never over the rope in the climber's hand. */
  private drawVeil(camera: Camera, atmosphere: Atmosphere): void {
    const { veil } = atmosphere.look;
    this.veil.clear();
    this.veil.visible = veil > 0;
    if (!this.veil.visible) {
      return;
    }
    const { width, height } = camera.screen;
    const { x, y } = camera.position;
    const metres = camera.pixelsPerMetre;
    const wide = width / metres;
    const high = height / metres;
    this.veil
      .rect(x - wide, y - high, wide * 2, high * 2)
      .fill({ color: atmosphere.palette.haze, alpha: veil });
  }

  private drawSurface(size: LeastSize): void {
    const [first, ...rest] = this.ground;
    this.surface.clear();
    if (first === undefined) {
      return;
    }
    this.surface.moveTo(first.x, first.y);
    for (const { x, y } of rest) {
      this.surface.lineTo(x, y);
    }
    this.surface.stroke({
      width: size.line(SlopeLayer.SURFACE_METRES),
      color: 0xffffff,
      join: "round",
      cap: "round",
    });
  }

  /** The ground's points, with a level run-out past each end. */
  private static runOut(terrain: Terrain): readonly Point[] {
    const points = terrain.points.map(([x, y]) => ({ x, y }));
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      throw new RangeError("The ground has no points to draw");
    }
    const runOut = SlopeLayer.RUN_OUT_METRES;
    return [{ x: first.x - runOut, y: first.y }, ...points, { x: last.x + runOut, y: last.y }];
  }

  /** The snow's body, filled down from the surface, and the shade just under its surface. */
  private drawSnow(): void {
    const { ground } = this;
    const left = ground[0]?.x ?? 0;
    const right = ground.at(-1)?.x ?? 0;
    const bottom = Math.min(...ground.map(({ y }) => y)) - SlopeLayer.BELOW_METRES;
    const outline = ground.flatMap(({ x, y }) => [x, y]);
    this.snow.poly([left, bottom, ...outline, right, bottom]).fill(0xffffff);
    const [first, ...rest] = ground;
    if (first === undefined) {
      return;
    }
    const under = SlopeLayer.SHADE_METRES / 2;
    this.shade.moveTo(first.x, first.y - under);
    for (const { x, y } of rest) {
      this.shade.lineTo(x, y - under);
    }
    this.shade.stroke({
      width: SlopeLayer.SHADE_METRES,
      color: 0xffffff,
      alpha: SlopeLayer.SHADE_ALPHA,
      join: "round",
    });
  }

  /** What marks the snow, as `SlopeDetails` lays it: the sastrugi, the boot track, the walls. */
  private drawDetails(details: SlopeDetails): void {
    for (const { from, to } of details.sastrugi) {
      this.sastrugi.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    this.sastrugi.stroke({
      width: SlopeLayer.SASTRUGI_METRES,
      color: 0xffffff,
      alpha: SlopeLayer.SASTRUGI_ALPHA,
      cap: "round",
    });
    const { length, width } = SlopeLayer.PRINT;
    for (const { x, y } of details.track) {
      this.track.ellipse(x, y - width / 2, length / 2, width / 2).fill(0xffffff);
    }
    for (const { from, to } of details.walls) {
      const half = SlopeLayer.WALL_METRES / 2;
      this.walls.rect(from.x - half, to.y, SlopeLayer.WALL_METRES, from.y - to.y).fill(0xffffff);
      this.wallEdges.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    this.wallEdges.stroke({ width: SlopeLayer.WALL_EDGE_METRES, color: 0xffffff });
  }

  /** The glow behind each tent, for the night. */
  private static glow(tents: readonly (readonly Point[])[], glow: Graphics): void {
    for (const [left, , ridge] of tents) {
      if (left !== undefined && ridge !== undefined) {
        glow
          .circle(ridge.x, ridge.y - (ridge.y - left.y) * 0.6, SlopeLayer.TENT_GLOW_METRES)
          .fill(Palette.LAMP);
      }
    }
  }

  /** A tent as `CampSigns` shapes it: filled, with an edge and a door, so it reads by shape and by
   * colour; its sides pushed `push` the way the wind blows at their middles, the windward one in
   * and the lee one out. */
  private static tent(graphics: Graphics, tent: readonly Point[], push: number): void {
    const [left, right, ridge] = tent;
    if (left === undefined || right === undefined || ridge === undefined) {
      return;
    }
    graphics.moveTo(left.x, left.y);
    SlopeLayer.side(graphics, left, ridge, push);
    SlopeLayer.side(graphics, ridge, right, push);
    graphics
      .closePath()
      .fill(Palette.TENT)
      .stroke({ width: SlopeLayer.TENT_EDGE_METRES, color: Palette.TENT_DOOR });
    const door = (ridge.y - left.y) * 0.55;
    graphics
      .poly([ridge.x - door * 0.4, left.y, ridge.x + door * 0.4, right.y, ridge.x, left.y + door])
      .fill(Palette.TENT_DOOR);
  }

  /** A tent's side from `from` to `to`, its middle pushed `push` across: a curve in pieces. */
  private static side(graphics: Graphics, from: Point, to: Point, push: number): void {
    const controlX = (from.x + to.x) / 2 + 2 * push;
    const controlY = (from.y + to.y) / 2;
    const pieces = SlopeLayer.SIDE_PIECES;
    for (let piece = 1; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      const s = 1 - t;
      graphics.lineTo(
        s * s * from.x + 2 * s * t * controlX + t * t * to.x,
        s * s * from.y + 2 * s * t * controlY + t * t * to.y,
      );
    }
  }

  /** A rope along its curve, with a dark edge so it reads on the snow, and a picket driven in at
   * each end with its anchor. */
  private static rope(graphics: Graphics, curve: RopeCurve, size: LeastSize): void {
    graphics.clear();
    const count = curve.length;
    if (count === 0) {
      return;
    }
    const width = size.line(SlopeLayer.ROPE_METRES);
    const line = (): void => {
      graphics.moveTo(curve.x(0), curve.y(0));
      for (let index = 1; index < count; index += 1) {
        graphics.lineTo(curve.x(index), curve.y(index));
      }
    };
    // The anchors and the pickets keep their size beside the rope's, however wide it's drawn.
    const grown = width / SlopeLayer.ROPE_METRES;
    const picket = SlopeLayer.PICKET;
    const ends = [0, count - 1];
    for (const end of ends) {
      const x = curve.x(end);
      const y = curve.y(end);
      graphics
        .moveTo(x + picket.length * 0.3, y + picket.length * 0.4)
        .lineTo(x - picket.length * 0.3, y - picket.length * 0.4)
        .stroke({ width: picket.width * grown, color: Palette.PICKET, cap: "round" });
    }
    line();
    graphics.stroke({
      width: width * (1 + 2 * SlopeLayer.ROPE_EDGE),
      color: Palette.ROPE_SHADE,
      cap: "round",
      join: "round",
    });
    line();
    graphics.stroke({ width, color: Palette.ROPE, cap: "round", join: "round" });
    const radius = SlopeLayer.ANCHOR_METRES * grown;
    for (const end of ends) {
      graphics.circle(curve.x(end), curve.y(end), radius).fill(Palette.ANCHOR);
    }
  }
}
