import { FillGradient, Graphics, Particle, ParticleContainer, Texture } from "pixi.js";

import { Terrain } from "../physics";
import type { ClimberView, Lamps, Point, SlopePhysics } from "../physics";
import { SeededRandom } from "../simulation";
import type { Body, Breathing, ClimberId, ObjectiveHazards } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Beam } from "./beam";
import type { Camera } from "./camera";
import { CampSigns } from "./camp-signs";
import type { CampStretch } from "./camp-signs";
import { ClimberFigure } from "./climber-figure";
import { ClimberPose } from "./climber-pose";
import { ClimberReading } from "./climber-reading";
import { Crevasse } from "./crevasse";
import { Crowd } from "./crowd";
import { Drift } from "./drift";
import { Glacier } from "./glacier";
import type { PartStretch } from "./glacier";
import { HazardDrawing } from "./hazard-drawing";
import { IceBody } from "./ice-body";
import { IceSurface } from "./ice-surface";
import { IceTowers } from "./ice-towers";
import type { TowerSizes } from "./ice-towers";
import { IceWall } from "./ice-wall";
import { LadderBow } from "./ladder-bow";
import { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { PlayerMark } from "./player-mark";
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
 * The slope itself, at the camera's own depth: the ground as the physics has it, the moraine's
 * rubble Base Camp stands on and, from Crampon Point, its snow and its hummocks (#168) marked with
 * sastrugi and the boot track of the climbers before, its walls of blue ice, the crevasses its
 * ladders cross, going black inside as they go down, and the cracks around Camp 1 (#172), as
 * `Glacier` lays them; its ladders, a long one lashed from sections, its ropes with their pickets,
 * its hazards, the camps' tents, lit from inside at night, the prayer flags over Base Camp, and
 * every climber on it, drawn by `ClimberFigure`, their mask on as their oxygen flows, and the
 * player's marked in a crowd (`Crowd`, `PlayerMark`);
 * the snow their boots kick up, the spindrift the wind blows along the snow around the camera,
 * its grains glinting in the headlamps' beams, and the veil of a cloudy day behind the slope. In
 * the picture alone, the ground runs on level past the section's ends, so the view far out shows
 * no cliff there. What moves is drawn between the steps
 * (docs/guidelines/graphics.md → Motion): the climbers and the ropes, which `RopeCurve` draws
 * smooth, through the jumar in a climber's hand, and swaying on the gust where they hang free; a
 * ladder across a crevasse gives under the climbers on it. The snow and what marks it are drawn
 * once in white and tinted by the hour's light; the lines and the ground's edge when the scale
 * changes, since they never get thinner than `LeastSize` allows; a rope or a ladder when it moves
 * too, and the tents and the flags while the wind blows on them, in view; and the climbers, the
 * mark and what comes down each frame.
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
  /** The longest a single ladder is, in the drawing: a longer one is two or more lashed end to
   * end, each joint bound by so many wraps of cord round each rail, this far apart, reaching this
   * far each side of it. */
  private static readonly SECTION_METRES = 3;
  private static readonly LASHING = { wraps: 3, apart: 0.1, reach: 0.06, width: 0.025 };
  /** How far under its lips a crevasse's inside goes black. */
  private static readonly DARK_METRES = 9;
  /** The part of the route that's rubble, not snow; the camp the snow is cracked around, and how
   * far before it the cracks start. */
  private static readonly BARE = "moraine";
  private static readonly CRACKED = "camp-1";
  private static readonly CRACKS_BEFORE = 6;
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
  /** The blocks and towers of ice behind the route (#184): their sizes, how far each side of a
   * tower the ground it stands on reaches, and how big they are in each part of the route, the
   * Popcorn's jumble, the maze's towers, the open Football Field, the Upper Icefall's seracs, the
   * Cwm's open snow; none on the moraine. The drawing's numbers. */
  private static readonly BLOCKS: TowerSizes = {
    width: { min: 2, max: 6.5 },
    height: { min: 3, max: 9 },
    apart: { min: 0, max: 2.5 },
    saddle: { min: -1.5, max: 0.4 },
  };
  private static readonly BLOCK_REACH = 2.5;
  /** How far under the route's surface the blocks behind it, and their shaded faces, go: the
   * glacier in front hides the rest, which a phone would fill for nothing each frame. */
  private static readonly BLOCK_FOOT = 2;
  private static readonly BLOCK_SHADE_FOOT = 14;
  /** How far into the air's haze the blocks behind the route stand: the route reads first. */
  private static readonly BLOCK_HAZE = 0.35;
  private static readonly BLOCKS_IN: Readonly<Record<string, number>> = {
    popcorn: 0.5,
    maze: 1,
    "football-field": 0.3,
    "upper-icefall": 1.3,
    "western-cwm": 0.1,
  };
  /** The streaks down the blocks: how wide, and how strong. */
  private static readonly BLOCK_STREAK = { width: 0.06, alpha: 0.7 };
  /** Bare blue ice under the boots (#190): how deep its glossy skin is drawn, how wide its sheen
   * along the top, and a glint every so many metres along it, so long. */
  private static readonly ICE_SKIN = 0.35;
  /** How finely the ice's skin follows the ground. */
  private static readonly ICE_STEP = 0.25;
  private static readonly ICE_SHEEN_METRES = 0.05;
  private static readonly ICE_GLINT = { every: 0.9, length: 0.28, under: 0.09 };
  /** A ladder across a crevasse bounces (#190): metres of it for each unit of the physics' bounce,
   * how many times a second, and so many pieces its rails are drawn in while it does. */
  private static readonly BOUNCE_METRES = 0.035;
  private static readonly BOUNCE_HZ = 2.2;
  /** The streaks down a wall's bare ice: how wide, and how strong. */
  private static readonly STREAK_METRES = 0.035;
  private static readonly STREAK_ALPHA = 0.55;
  /** The steepest the snow's crest runs, as a rise over its run: a wall's ice is bare. */
  private static readonly CREST_STEEPEST = 1.2;
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
  /** How long a mote streaks at the full gust, in its sizes, and how much lower it rides: the
   * stronger the wind, the longer and lower the spindrift's streaks along the snow. */
  private static readonly DRIFT_STREAK = 7;
  private static readonly DRIFT_LOWER = 0.6;
  /** The grains glinting in a headlamp's beam: the least light that shows one, its size against
   * the mote's, its brightness, and the share of it that shows with no wind. */
  private static readonly GLINT = { least: 0.04, size: 0.45, alpha: 2.2, calm: 0.45 };

  private readonly ground: readonly Point[];
  /** How far down the ground is filled; where the moraine's rubble ends and the snow begins,
   * Crampon Point, if the section has a moraine. */
  private readonly bottom: number;
  private readonly cramponPoint: Point | null;
  private readonly veil = new Graphics();
  /** The bare blue ice under the boots. */
  private readonly iceSkin = new Graphics();
  /** The bounce each ladder was last drawn at: a bouncing one is drawn every frame. */
  private readonly bounced = new Map<string, number>();
  /** The picture's seconds, which a ladder bounces on. */
  private elapsed = 0;
  /** The blocks and towers of ice behind the route. */
  private readonly blocks = new Graphics();
  private readonly snow = new Graphics();
  private readonly shade = new Graphics();
  private readonly crevasses = new Graphics();
  /** The light through the ice along each crevasse's walls, and the snow and icicles on its lips
   * and the walls' tops. */
  private readonly rims = new Graphics();
  private readonly lips = new Graphics();
  private readonly moraine = new Graphics();
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
  private readonly mark = new PlayerMark();
  private readonly puffs = new SnowPuffs();
  private readonly puffGraphics = new Graphics();
  private readonly hazards: HazardDrawing;
  private readonly drift: Drift;
  private readonly driftContainer: ParticleContainer;
  private readonly motes: readonly Particle[];
  private readonly glints = new Graphics();
  /** The headlamps' beams this frame. */
  private readonly beams: Beam[] = [];
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
    private readonly oxygen: Breathing,
    private readonly lamps: Lamps,
    camps: readonly CampStretch[],
    parts: readonly PartStretch[],
    climbers: readonly ClimberId[],
    player: ClimberId,
    seed: number,
    motes: number,
  ) {
    super("slope", { x: 1, y: 1 });
    const { terrain } = physics;
    this.addChild(this.veil);
    this.ground = SlopeLayer.runOut(terrain);
    this.bottom = Math.min(...this.ground.map(({ y }) => y)) - SlopeLayer.BELOW_METRES;
    this.ladders = physics.ladders.map((id) => {
      const [start, finish] = physics.ladder(id);
      if (start === undefined || finish === undefined) {
        throw new RangeError("A ladder needs two ends to draw");
      }
      const length = Math.hypot(finish.x - start.x, finish.y - start.y);
      const graphics = new Graphics();
      const across = Math.abs(finish.y - start.y) < length / 2;
      const bow = new LadderBow(length);
      return { id, start, finish, length, across, graphics, bow, loads: [], bowed: false };
    });
    const bare = parts.find(({ id }) => id === SlopeLayer.BARE) ?? null;
    this.cramponPoint = bare === null ? null : terrain.point(bare.to);
    const crossings = this.ladders.filter(({ across }) => across);
    const surface = new IceSurface(
      new Terrain(this.ground.map(({ x, y }) => [x, y] as const)),
      crossings,
    );
    this.hazards = new HazardDrawing(hazards, terrain, surface);
    this.drawSnow(new IceBody(surface, seed + 5));
    this.drawBlocks(surface, parts, seed + 7);
    this.drawDetails(new SlopeDetails(terrain, seed));
    this.drawGlacier(new Glacier(terrain, seed + 4), bare, camps);
    this.drawIce(terrain, seed + 6);
    this.drawIceSkin(terrain);
    // A crevasse's inside goes over the marks on its walls and its foot, so it's dark all the way
    // down, and a crack breaks the snow's crest.
    this.addChild(
      this.blocks,
      this.hazards.seracs,
      this.snow,
      this.shade,
      this.sastrugi,
      this.walls,
      this.wallEdges,
      this.track,
      this.moraine,
      this.iceSkin,
      this.surface,
      this.crevasses,
      this.rims,
      this.lips,
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
    for (const { graphics } of this.ladders) {
      this.addChild(graphics);
    }
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
        vertex: true,
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
    this.glints.blendMode = "add";
    this.addChild(this.driftContainer, this.glints, this.hazards.falling, this.mark);
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
   * snow in the hour's light, the lines at the camera's scale, the climbers as they are and the
   * player's mark, the ladders under them and the ropes through their hands, the camps in the
   * wind, the snow they kick up, the spindrift on the gust, and what's coming down. */
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
    this.beams.length = 0;
    for (const { id, figure, view: climber } of this.figures) {
      const sag = this.sagUnder(climber, figure.at);
      const masked = this.oxygen.flow(id) > 0;
      const lit = this.lamps.lit(id);
      figure.show(this.body.climber(id), masked, atmosphere, seconds, size, sag, lit);
      if (figure.beam !== null) {
        this.beams.push(figure.beam);
      }
    }
    this.markPlayer(camera, size);
    this.elapsed = atmosphere.elapsed;
    for (const ladder of this.ladders) {
      const bounce = this.physics.ladderBounce(ladder.id);
      const bouncing = bounce > 0 || (this.bounced.get(ladder.id) ?? 0) > 0;
      if (rescaled || ladder.bowed || ladder.loads.length > 0 || bouncing) {
        this.bounced.set(ladder.id, bounce);
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
      this.blocks.tint = palette.faded(palette.snowTint, SlopeLayer.BLOCK_HAZE);
      this.shade.tint = palette.snowDeep;
      this.sastrugi.tint = palette.snowShade;
      this.track.tint = palette.track;
      this.walls.tint = palette.snowTint;
      this.wallEdges.tint = palette.snowTint;
      this.iceSkin.tint = palette.snowTint;
      this.crevasses.tint = palette.crevasse;
      this.rims.tint = palette.snowTint;
      this.lips.tint = palette.snowTint;
      this.moraine.tint = palette.moraine;
      this.surface.tint = palette.snowCrest;
      this.hazards.standing.tint = palette.snowTint;
      this.hazards.seracs.tint = palette.snowTint;
      this.hazards.falling.tint = palette.snowTint;
      this.driftContainer.tint = palette.snowCrest;
      this.puffGraphics.tint = palette.snowCrest;
    }
    this.tintedWith = atmosphere;
    this.tentGlow.alpha = atmosphere.light.lamps * SlopeLayer.TENT_GLOW_ALPHA;
    this.tentGlow.visible = this.tentGlow.alpha > 0.01;
  }

  /** The mark over the player's head while they're in a crowd on the screen: as high over where
   * they're drawn as the figure is tall, so it stays still as they stride. */
  private markPlayer(camera: Camera, size: LeastSize): void {
    const player = this.playerFigure;
    const crowd = new Crowd(
      camera,
      this.figures.map(({ figure }) => figure.at),
    );
    this.mark.visible = player !== null && crowd.marked;
    if (player !== null && crowd.marked) {
      const { x, y } = player.at;
      const tall = ClimberFigure.HEIGHT_METRES * size.climber(ClimberFigure.HEIGHT_METRES);
      this.mark.place({ x, y: y + tall }, camera.pixelsPerMetre);
    }
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
    const along = SlopeLayer.alongLadder(ladder, at);
    return ladder.bow.sag(ladder.loads, along) + this.bouncing(ladder, along);
  }

  /** How far a ladder across a crevasse bounces down at `along` this frame, up and down with the
   * physics' bounce, most in its middle and none at its ends (#190). */
  private bouncing({ id, length, across }: DrawnLadder, along: number): number {
    if (!across) {
      return 0;
    }
    const bounce = this.physics.ladderBounce(id);
    const wave = Math.sin(2 * Math.PI * SlopeLayer.BOUNCE_HZ * this.elapsed);
    const shape = Math.sin((Math.PI * Math.min(Math.max(along, 0), length)) / (length || 1));
    return bounce * SlopeLayer.BOUNCE_METRES * wave * shape;
  }

  private static alongLadder({ start, finish, length }: DrawnLadder, at: Point): number {
    const along = (at.x - start.x) * (finish.x - start.x) + (at.y - start.y) * (finish.y - start.y);
    return along / (length || 1);
  }

  /** A ladder's rails and rungs, every `ClimberReading.RUNG_METRES` as the climbers' boots find
   * them, and a long one's lashings, bowed under the climbers on it; across a crevasse, its hand
   * line on a post at each end, at the height of their hands, going down with the ladder under
   * them. */
  private drawLadder(ladder: DrawnLadder, size: LeastSize): void {
    const { start, finish, length, graphics, bow, loads, across } = ladder;
    const alongX = (finish.x - start.x) / (length || 1);
    const alongY = (finish.y - start.y) / (length || 1);
    const railX = -alongY * SlopeLayer.LADDER_HALF_WIDTH;
    const railY = alongX * SlopeLayer.LADDER_HALF_WIDTH;
    const width = size.line(SlopeLayer.RAIL_METRES);
    const bounce = this.physics.ladderBounce(ladder.id);
    const bowed = across && (loads.length > 0 || bounce > 0);
    const sag = (along: number): number =>
      bowed ? bow.sag(loads, along) + this.bouncing(ladder, along) : 0;
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
    SlopeLayer.lashings(graphics, ladder, sag, size);
    if (across) {
      SlopeLayer.handLine(graphics, ladder, sag, size);
    }
    ladder.bowed = bowed;
  }

  /** Where a ladder longer than `SECTION_METRES` is lashed from sections end to end: at each joint,
   * a few wraps of cord round each rail, bowed with the ladder. */
  private static lashings(
    graphics: Graphics,
    { start, finish, length }: DrawnLadder,
    sag: (along: number) => number,
    size: LeastSize,
  ): void {
    const { LASHING, LADDER_HALF_WIDTH } = SlopeLayer;
    const sections = Math.ceil(length / SlopeLayer.SECTION_METRES - 1e-6);
    if (sections < 2) {
      return;
    }
    const alongX = (finish.x - start.x) / length;
    const alongY = (finish.y - start.y) / length;
    for (let joint = 1; joint < sections; joint += 1) {
      for (let wrap = 0; wrap < LASHING.wraps; wrap += 1) {
        const along =
          (length * joint) / sections + (wrap - (LASHING.wraps - 1) / 2) * LASHING.apart;
        for (const side of [1, -1]) {
          const rail = side * LADDER_HALF_WIDTH;
          const x = start.x + alongX * along - alongY * rail;
          const y = start.y + alongY * along + alongX * rail - sag(along);
          graphics
            .moveTo(x + alongY * LASHING.reach, y - alongX * LASHING.reach)
            .lineTo(x - alongY * LASHING.reach, y + alongX * LASHING.reach);
        }
      }
    }
    graphics.stroke({ width: size.line(LASHING.width), color: Palette.LASHING, cap: "round" });
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
   * jumars in the climbers' hands and the carabiners on their slings (#202), swaying on the gust. A
   * rope out of view that would have been drawn is drawn once it's back in it. */
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
        const { held, carried } = figure;
        if (held !== null && figure.rope === rope.id) {
          rope.held.push(held);
        }
        if (carried !== null && figure.secondRope === rope.id) {
          rope.held.push(carried);
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

  /** The spindrift along the snow around the camera, blown by the gust in streaks that grow
   * longer and lower with it, and its grains glinting in the headlamps' beams: the air's ice
   * crystals faintly with no wind, as #125's scene has. */
  private blow(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    const { gust, elapsed } = atmosphere;
    const { beams } = this;
    const strength = Math.max(
      0,
      (gust - SlopeLayer.DRIFT_FROM_GUST) / (1 - SlopeLayer.DRIFT_FROM_GUST),
    );
    this.driftContainer.alpha = Math.min(1, strength * 1.5) * SlopeLayer.DRIFT_ALPHA;
    this.driftContainer.visible = this.driftContainer.alpha > 0.01;
    this.glints.clear();
    if (!this.driftContainer.visible && beams.length === 0) {
      return;
    }
    const { terrain } = this.physics;
    const cameraX = camera.position.x;
    this.driftContainer.position.set(cameraX, 0);
    this.drift.blow(seconds, gust, (x) => terrain.height(cameraX + x), elapsed);
    const shown = SlopeLayer.GLINT.calm + (1 - SlopeLayer.GLINT.calm) * Math.min(1, strength * 1.5);
    const streak = 1 + SlopeLayer.DRIFT_STREAK * strength;
    const lower = 1 - SlopeLayer.DRIFT_LOWER * strength;
    for (const [index, mote] of this.drift.motes.entries()) {
      const ground = terrain.height(cameraX + mote.x);
      const at = { x: cameraX + mote.x, y: ground + (mote.y - ground) * lower };
      const particle = this.motes[index];
      if (particle !== undefined) {
        particle.x = mote.x;
        particle.y = at.y;
        particle.scaleX = (mote.size * streak) / particle.texture.width;
      }
      const lit = Math.max(0, ...beams.map((beam) => beam.lights(at)));
      if (lit > SlopeLayer.GLINT.least) {
        this.glints
          .circle(at.x, at.y, mote.size * SlopeLayer.GLINT.size)
          .fill({ color: Palette.LAMP, alpha: Math.min(1, lit * shown * SlopeLayer.GLINT.alpha) });
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

  /** The snow's crest along the ground, from Crampon Point on: the moraine's rubble has none,
   * nor a wall's bare ice, nor the blue ice under the boots. */
  private drawSurface(size: LeastSize): void {
    const edge = this.cramponPoint;
    const [first, ...rest] =
      edge === null ? this.ground : [edge, ...this.ground.filter(({ x }) => x > edge.x)];
    this.surface.clear();
    if (first === undefined) {
      return;
    }
    const { terrain } = this.physics;
    const iceAcross = this.physics.ice.map(({ from, to }) => ({
      left: terrain.point(from).x,
      right: terrain.point(to).x,
    }));
    const onIce = (x: number): boolean =>
      iceAcross.some(({ left, right }) => x > left && x < right);
    this.surface.moveTo(first.x, first.y);
    let before = first;
    for (const point of rest) {
      const steep =
        Math.abs(point.y - before.y) > SlopeLayer.CREST_STEEPEST * Math.abs(point.x - before.x);
      if (steep || onIce((point.x + before.x) / 2)) {
        this.surface.moveTo(point.x, point.y);
      } else {
        this.surface.lineTo(point.x, point.y);
      }
      before = point;
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

  /** The glacier's body, filled down from the surface in the day's colours for the hour to tint:
   * its snow cap, the layers of its ice darkening as they go down, as `IceBody` lays them, and the
   * shade just under its surface. */
  private drawSnow(body: IceBody): void {
    const { ground, bottom } = this;
    // Under the deepest layer, the darkest ice down to the fill's foot: each pixel of the ground
    // is filled once, by its cap, its layer or this.
    const deepest = body.edges.at(-1) ?? [];
    const left = deepest[0]?.x ?? 0;
    const right = deepest.at(-1)?.x ?? 0;
    this.snow
      .poly([...SlopeLayer.flat(deepest), right, bottom, left, bottom])
      .fill(Palette.glacier(Infinity));
    for (const band of body.bands) {
      this.snow.poly(SlopeLayer.flat(band.outline)).fill(Palette.glacier(band.depth));
    }
    this.snow.poly(SlopeLayer.flat(body.cap)).fill(0xffffff);
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
  }

  /** The bare blue ice under the boots (#190), in the day's colours for the hour to tint: a
   * glossy skin over each stretch of it, a wet sheen along its top and glints along it, so the
   * player reads it from afar as the ice that takes their footing. */
  private drawIceSkin(terrain: Terrain): void {
    const { flat, ICE_SKIN, ICE_GLINT } = SlopeLayer;
    for (const { from, to } of this.physics.ice) {
      const top: Point[] = [];
      for (let along = from; along < to; along += SlopeLayer.ICE_STEP) {
        top.push(terrain.point(along));
      }
      top.push(terrain.point(to));
      const under = [...top].reverse().map(({ x, y }) => ({ x, y: y - ICE_SKIN }));
      this.iceSkin.poly(flat([...top, ...under])).fill(Palette.BLUE_ICE);
      const [first, ...rest] = top;
      if (first !== undefined) {
        this.iceSkin.moveTo(first.x, first.y);
        for (const { x, y } of rest) {
          this.iceSkin.lineTo(x, y);
        }
        this.iceSkin.stroke({
          width: SlopeLayer.ICE_SHEEN_METRES,
          color: Palette.ICE_SHEEN,
          cap: "round",
          join: "round",
        });
      }
      for (let along = from + ICE_GLINT.every / 2; along < to; along += ICE_GLINT.every) {
        const start = terrain.point(along);
        const end = terrain.point(Math.min(along + ICE_GLINT.length, to));
        this.iceSkin
          .moveTo(start.x, start.y - ICE_GLINT.under)
          .lineTo(end.x, end.y - ICE_GLINT.under * 1.6);
      }
      this.iceSkin.stroke({
        width: SlopeLayer.ICE_SHEEN_METRES * 0.7,
        color: Palette.ICE_SHEEN,
        alpha: 0.7,
        cap: "round",
      });
    }
  }

  /** The blocks and towers of ice standing behind the route, as `IceTowers` lays them, in the
   * day's colours for the hour to tint: each on the highest ground about it, the ice between them
   * and their feet behind the route's own, their left faces in shade, snow on their tops and
   * streaks down them; as big as the part of the route they stand by has them. */
  private drawBlocks(surface: IceSurface, parts: readonly PartStretch[], seed: number): void {
    const { terrain } = this.physics;
    const { flat, BLOCK_REACH } = SlopeLayer;
    const left = terrain.point(0).x;
    const right = terrain.point(terrain.length).x;
    const stretches = parts.map(({ id, from, to }) => ({
      size: SlopeLayer.BLOCKS_IN[id] ?? 0,
      left: terrain.point(from).x,
      right: terrain.point(to).x,
    }));
    const towers = new IceTowers({
      from: left,
      to: right,
      sizes: SlopeLayer.BLOCKS,
      base: (x) => surface.highest(x - BLOCK_REACH, x + BLOCK_REACH),
      scale: (x) => stretches.find((part) => x >= part.left && x < part.right)?.size ?? 0,
      seed,
    });
    const { outline } = towers;
    const first = outline[0]?.x ?? left;
    const last = outline.at(-1)?.x ?? right;
    const foot = (x: number): Point => ({ x, y: surface.height(x) - SlopeLayer.BLOCK_FOOT });
    const under = surface.points
      .filter(({ x }) => x > first && x < last)
      .map(({ x }) => foot(x))
      .reverse();
    this.blocks.poly(flat([...outline, foot(last), ...under, foot(first)])).fill(Palette.BLOCK);
    for (const face of towers.shades(-1, SlopeLayer.BLOCK_SHADE_FOOT)) {
      this.blocks.poly(flat(face)).fill(Palette.BLOCK_SHADE);
    }
    for (const { top, foot } of towers.flutings) {
      this.blocks.moveTo(top.x, top.y).lineTo(foot.x, foot.y);
    }
    this.blocks.stroke({ ...SlopeLayer.BLOCK_STREAK, color: Palette.BLOCK_SHADE, cap: "round" });
    for (const cap of towers.caps) {
      this.blocks.poly(flat(cap)).fill(0xffffff);
    }
  }

  /** The ice where the ladders cross it, in the day's colours for the hour to tint (#184): each
   * crevasse's inside going black as it goes down, the light through the ice along its walls, the
   * snow at its foot and on its steps; each wall's bare face and its streaks; and the lips of snow
   * on them all, with their icicles. */
  private drawIce(terrain: Terrain, seed: number): void {
    const { flat } = SlopeLayer;
    const cornices = [];
    for (const [index, { start, finish, across }] of this.ladders.entries()) {
      if (across) {
        const crevasse = new Crevasse(terrain, start, finish, seed + index);
        this.crevasses.poly(flat(crevasse.inside)).fill(SlopeLayer.deepening(crevasse.depth));
        for (const rim of crevasse.rims) {
          this.rims.poly(flat(rim)).fill(SlopeLayer.litIce(rim));
        }
        for (const snow of crevasse.snow) {
          this.lips.poly(flat(snow)).fill(0xffffff);
        }
        cornices.push(...crevasse.cornices);
      } else {
        const wall = new IceWall(terrain, start, finish, seed + index);
        this.walls.poly(flat(wall.face)).fill(SlopeLayer.litIce(wall.face));
        for (const streak of wall.streaks) {
          const [first, ...rest] = streak;
          if (first !== undefined) {
            this.wallEdges.moveTo(first.x, first.y);
            for (const { x, y } of rest) {
              this.wallEdges.lineTo(x, y);
            }
          }
        }
        cornices.push(wall.cornice);
      }
    }
    this.wallEdges.stroke({
      width: SlopeLayer.STREAK_METRES,
      color: Palette.STREAK,
      alpha: SlopeLayer.STREAK_ALPHA,
      cap: "round",
    });
    for (const { outline, icicles } of cornices) {
      for (const icicle of icicles) {
        this.lips.poly(flat(icicle)).fill(Palette.ICICLE);
      }
      this.lips.poly(flat(outline)).fill(0xffffff);
    }
  }

  /** The light through the ice by a wall, bright under its top and fading as it goes down, over
   * the shape's height, `Palette.LIT_ICE`'s metres down from its top. The layer's y is up, so the
   * gradient runs from the top of the shape's bounds, 1, to their foot, 0. */
  private static litIce(shape: readonly Point[]): FillGradient {
    const ys = shape.map(({ y }) => y);
    const height = Math.max(...ys) - Math.min(...ys) || 1;
    return new FillGradient({
      type: "linear",
      start: { x: 0, y: 1 },
      end: { x: 0, y: 0 },
      colorStops: Palette.LIT_ICE.map(([depth, colour]) => ({
        offset: Math.min(depth / height, 1),
        color: Palette.css(colour),
      })).filter(
        ({ offset }, index, stops) => index === 0 || offset > (stops[index - 1]?.offset ?? 0),
      ),
    });
  }

  /** The glacier where it's more than snow, as `Glacier` lays it: the moraine's rubble and its
   * stones, out to Crampon Point; the inside of each crevasse a ladder crosses, going black as it
   * goes down; and the cracks in the snow around Camp 1. */
  private drawGlacier(
    glacier: Glacier,
    bare: PartStretch | null,
    camps: readonly CampStretch[],
  ): void {
    const { flat } = SlopeLayer;
    if (bare !== null) {
      const back = SlopeLayer.RUN_OUT_METRES;
      this.moraine.poly(flat(glacier.moraine(bare.to, back, this.bottom))).fill(0xffffff);
      for (const { outline, dark } of glacier.stones(bare.to, back)) {
        this.moraine.poly(flat(outline)).fill(Palette.shaded(0xffffff, dark));
      }
    }
    const cracked = camps.find(({ id }) => id === SlopeLayer.CRACKED);
    if (cracked !== undefined) {
      for (const crack of glacier.cracks(cracked.from - SlopeLayer.CRACKS_BEFORE, cracked.to)) {
        this.crevasses.poly(flat(crack)).fill(0xffffff);
      }
    }
  }

  /** Points as a polygon takes them: x, y, x, y… */
  private static readonly flat = (points: readonly Point[]): number[] =>
    points.flatMap(({ x, y }) => [x, y]);

  /** A crevasse's inside going black as it goes down: white at its lips, for the tint to colour,
   * and black `DARK_METRES` under them, or at its foot. The layer's y is up, so the gradient runs
   * from the top of the shape's bounds, 1, to their foot, 0. */
  private static deepening(depth: number): FillGradient {
    const black = Math.min(1, SlopeLayer.DARK_METRES / (depth || 1));
    return new FillGradient({
      type: "linear",
      start: { x: 0, y: 1 },
      end: { x: 0, y: 0 },
      colorStops: [
        { offset: 0, color: Palette.css(0xffffff) },
        { offset: black, color: Palette.css(0x000000) },
        { offset: 1, color: Palette.css(0x000000) },
      ],
    });
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
