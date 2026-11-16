import { DOMAdapter, FillGradient, Graphics, Particle, ParticleContainer, Texture } from "pixi.js";
import type { DestroyOptions } from "pixi.js";

import { Terrain } from "../physics";
import type { ClimberView, LadderCondition, Lamps, Point, SlopePhysics } from "../physics";
import { SeededRandom } from "../simulation";
import type {
  Body,
  Breathing,
  ClimberId,
  JoltWarning,
  JoltZone,
  ObjectiveHazards,
} from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Beam } from "./beam";
import { BlownSnow } from "./blown-snow";
import type { Camera } from "./camera";
import { CampSigns } from "./camp-signs";
import type { CampStretch } from "./camp-signs";
import { ClimberFigure } from "./climber-figure";
import { SuitRig } from "./suit-rig";
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
import { LadderShake } from "./ladder-shake";
import type { Shake } from "./ladder-shake";
import { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { PlayerMark } from "./player-mark";
import { PrayerFlags } from "./prayer-flags";
import { RopeCurve } from "./rope-curve";
import type { Held } from "./rope-curve";
import { SlopeDetails } from "./slope-details";
import { IceChips } from "./ice-chips";
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
  /** Its condition as last drawn, and the picture's seconds it has been so since (#209). */
  condition: LadderCondition;
  since: number;
  /** The twist's zone it lies under, a lashed ladder's (#197), or none: it rocks while the twist
   * is on its way, and settles after. */
  readonly lashed: string | null;
  /** How it shakes (#228); the picture's seconds its twist has been on its way and over, while it
   * rocks; how far it's drawn hauled back up, catching up with the physics; and the seconds since
   * it was laid back across, while it bounces on the lip. */
  readonly shaker: LadderShake;
  twist: { on: number; over: number } | null;
  raised: number;
  landed: number | null;
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
 * the snow their boots kick up, the snow the wind lifts off the slope around the camera
 * (`BlownSnow`, #223), the air's ice crystals glinting in the headlamps' beams, and the veil of a
 * cloudy day behind the slope. In
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
  /** A ladder staged to break (#209): broken, it swings down into the crevasse from its other end
   * over so many seconds, knocks against the wall and settles; hanging there, it sways this far,
   * in radians, so many times a second, more while it's hauled back up, catching up with the
   * haul over so many seconds (#228). How it shakes is `LadderShake`'s; a lashed ladder's rock
   * settles over so many seconds once its twist has come, and one laid back across bounces on
   * the lip for so long. */
  private static readonly HANGING = {
    sway: 0.02,
    hz: 0.3,
    hauled: 0.035,
    pulls: 0.9,
    catches: 0.3,
  };
  private static readonly SETTLED = { twist: 2.5, landing: 1.5 };
  /** How much of a ladder's width the picture shows lying flat, seen from a little above: rolled
   * over its long axis, its rails close and open as they turn (#228). */
  private static readonly RAIL_DEPTH = 0.35;
  /** The ladders' shakes' seeds, from the layer's. */
  private static readonly SHAKE_SEED = 17;
  /** How near a twist zone's ends are to a ladder's, along the ground, to be its (#197). */
  private static readonly SAME = 1e-6;
  private static readonly SWING = { fall: 0.55, knock: 0.35, back: 0.18, settle: 3 };
  /** The streaks down a wall's bare ice: how wide, and how strong. */
  private static readonly STREAK_METRES = 0.035;
  private static readonly STREAK_ALPHA = 0.55;
  /** How far the seeds of the steps of ice with no ladder are from the ladders' walls', so no two
   * are drawn alike. */
  private static readonly BARE_SEEDS = 1000;
  /** The seed of the chips' chance, from the layer's, and how much of the lamps' light they
   * catch at night. */
  private static readonly CHIP_SEED = 11;
  /** The blown snow's own seed, from the layer's. */
  private static readonly BLOWN_SEED = 13;
  private static readonly CHIP_GLINT = 0.7;
  /** A chip of ice drawn as a shard: its three corners round its middle, how far round each is
   * turned and how far out it is, as a share of its size. */
  private static readonly SHARD = { turns: [0, 2.2, 4.0], reaches: [1, 0.55, 0.75] };
  /** The steepest the snow's crest runs, as a rise over its run: a wall's ice is bare. */
  private static readonly CREST_STEEPEST = 1.2;
  /** How far below its lowest point the ground is filled. */
  private static readonly BELOW_METRES = 80;
  /** How far the ground runs on, level, past each end of the section: wider than 100 m of slope
   * on the widest screen. */
  private static readonly RUN_OUT_METRES = 300;
  /** How far past the screen's edges a rope or a camp counts as in view. */
  private static readonly MARGIN_METRES = 3;
  /** The air's ice crystals, which glint in a headlamp's beam: how far each side of the camera
   * they blow, how high over the snow, how big, how fast at the full gust, and from what gust
   * they blow; and how much lower they ride in the full gust. */
  private static readonly DRIFT_SPAN = 120;
  private static readonly DRIFT_HEIGHT = { min: 0.05, max: 1.6 };
  private static readonly DRIFT_SIZE = { min: 0.05, max: 0.14 };
  private static readonly DRIFT_SPEED = { min: 4, max: 14 };
  private static readonly DRIFT_FROM_GUST = 0.05;
  private static readonly DRIFT_LOWER = 0.6;
  /** The grains glinting in a headlamp's beam: the least light that shows one, its size against
   * the mote's, its brightness, and the share of it that shows with no wind. */
  private static readonly GLINT = { least: 0.04, size: 0.45, alpha: 2.2, calm: 0.45 };
  /** The snow the wind lifts (#223): how far past the screen's edges it blows, in metres; how
   * much a puff that shows whole shows, as many puffs a metre as High has across a view of 20 m
   * high, and how much more each shows where fewer share the view, at the most; how little is
   * drawn at all, and how much more a headlamp's full beam lights it and shows it; and the soft
   * puff's texture, so many pixels across. */
  private static readonly BLOWN_MARGIN = 4;
  private static readonly BLOWN = {
    alpha: 0.7,
    aMetre: 4,
    sparse: 2.5,
    least: 0.01,
    lit: 1.2,
    litAlpha: 0.45,
  };
  private static readonly PUFF_PIXELS = 64;

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
  /** The chips of ice the picks and the front points knock off, and whether any were drawn. */
  private readonly chips: IceChips;
  private readonly chipGraphics = new Graphics();
  private chipsShown = false;
  private readonly hazards: HazardDrawing;
  private readonly drift: Drift;
  private readonly glints = new Graphics();
  /** The snow the wind lifts, its soft puff, its particles, and the tops of the towers behind the
   * route, which it streams off as it does off the route's own edges. */
  private readonly blownSnow: BlownSnow;
  private readonly softPuff = SlopeLayer.puffTexture();
  private readonly blownContainer: ParticleContainer;
  private readonly blownParticles: readonly Particle[];
  private readonly towerTops: Point[] = [];
  /** The headlamps' beams this frame. */
  private readonly beams: Beam[] = [];
  /** Where the frame fell among the game's steps, as it last moved. */
  private between: BetweenSteps = { taken: 0, progress: 0 };
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
  /** A chip of ice: a shard, turned as it spins. */
  private readonly drawChip = (
    x: number,
    y: number,
    size: number,
    angle: number,
    alpha: number,
  ): void => {
    const { SHARD } = SlopeLayer;
    const corner = (index: number): readonly [number, number] => {
      const turn = angle + (SHARD.turns[index] ?? 0);
      const reach = size * (SHARD.reaches[index] ?? 1);
      return [x + reach * Math.cos(turn), y + reach * Math.sin(turn)];
    };
    this.chipGraphics
      .poly([...corner(0), ...corner(1), ...corner(2)])
      .fill({ color: Palette.ICE_CHIP, alpha });
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
    npcs: readonly ClimberId[],
    seed: number,
    motes: number,
    private readonly jolts: {
      readonly zones: readonly JoltZone[];
      readonly warnings: readonly JoltWarning[];
    } | null = null,
  ) {
    super("slope", { x: 1, y: 1 });
    this.chips = new IceChips(seed + SlopeLayer.CHIP_SEED);
    const { terrain } = physics;
    this.addChild(this.veil);
    this.ground = SlopeLayer.runOut(terrain);
    this.bottom = Math.min(...this.ground.map(({ y }) => y)) - SlopeLayer.BELOW_METRES;
    this.ladders = physics.ladders.map((id, index) => {
      const [start, finish] = physics.ladder(id);
      if (start === undefined || finish === undefined) {
        throw new RangeError("A ladder needs two ends to draw");
      }
      const length = Math.hypot(finish.x - start.x, finish.y - start.y);
      const graphics = new Graphics();
      const across = Math.abs(finish.y - start.y) < length / 2;
      const bow = new LadderBow(length);
      const condition = physics.ladderCondition(id);
      const [from, to] = [start, finish].map((end) => terrain.nearest(end).along);
      const lashed =
        jolts?.zones.find(
          (zone) =>
            zone.kind === "twist" &&
            Math.abs(zone.from - (from ?? 0)) < SlopeLayer.SAME &&
            Math.abs(zone.to - (to ?? 0)) < SlopeLayer.SAME,
        )?.id ?? null;
      return {
        id,
        start,
        finish,
        length,
        across,
        graphics,
        bow,
        loads: [],
        bowed: false,
        condition,
        // A ladder already broken when the climb loads hangs from the first frame.
        since: condition === "broken" ? SlopeLayer.SWING.settle : 0,
        lashed,
        shaker: new LadderShake(length, seed + SlopeLayer.SHAKE_SEED + index),
        twist: null,
        raised: physics.ladderRaised(id),
        landed: null,
      };
    });
    const bare = parts.find(({ id }) => id === SlopeLayer.BARE) ?? null;
    this.cramponPoint = bare === null ? null : terrain.point(bare.to);
    const crossings = this.ladders.filter(({ across }) => across);
    const surface = new IceSurface(
      new Terrain(this.ground.map(({ x, y }) => [x, y] as const)),
      crossings,
    );
    this.hazards = new HazardDrawing(hazards, terrain, surface, this.softPuff, () =>
      this.figures.filter(({ view }) => view !== null && !view.dead).map(({ figure }) => figure.at),
    );
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
      // The player in the brighter suit; their Sherpa in blue, with a bigger pack (#212).
      const sherpa = npcs.includes(id);
      const suit =
        id === player ? Palette.PLAYER_SUIT : sherpa ? Palette.SHERPA_SUIT : Palette.OTHER_SUIT;
      const figure = new ClimberFigure(
        suit,
        physics,
        this.puffs,
        this.chips,
        sherpa ? SuitRig.LOADED : 1,
      );
      this.addChild(figure);
      return { id, figure, view: null };
    });
    this.playerFigure = this.figures.find(({ id }) => id === player)?.figure ?? null;
    this.addChild(this.puffGraphics, this.chipGraphics);
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
    this.blownSnow = new BlownSnow(
      motes,
      [...BlownSnow.edgesOf(this.ground), ...this.towerTops],
      SeededRandom.fromSeed(seed + SlopeLayer.BLOWN_SEED),
    );
    this.blownContainer = new ParticleContainer({
      dynamicProperties: { position: true, vertex: true, rotation: true, uvs: false, color: true },
    });
    this.blownParticles = this.blownSnow.puffs.map(() => {
      const particle = new Particle({
        texture: this.softPuff,
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: 0,
      });
      this.blownContainer.addParticle(particle);
      return particle;
    });
    this.glints.blendMode = "add";
    this.addChild(
      this.blownContainer,
      this.glints,
      this.hazards.falling,
      this.hazards.dust,
      this.mark,
    );
  }

  /** The layer goes, and the blown snow's soft puff with it. */
  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    if (this.softPuff !== Texture.WHITE) {
      this.softPuff.destroy(true);
    }
  }

  /** How many climbers are drawn. */
  get climbers(): number {
    return this.figures.length;
  }

  /** How hard what's coming down shakes the picture now, from nothing to about 1. */
  get shaking(): number {
    return this.hazards.shaking;
  }

  /** Where the player is drawn this frame, between the steps: what the camera follows. */
  get player(): Point | null {
    return this.playerFigure?.at ?? null;
  }

  /** The ropes and the climbers as the frame's steps left them, drawn `between` the steps. */
  move(between: BetweenSteps): void {
    this.between = between;
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
   * wind, the snow they kick up, the snow the wind lifts, and what's coming down. */
  draw(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    this.hazards.draw(seconds, this.between, atmosphere);
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
    this.chips.advance(seconds);
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
      const condition = this.physics.ladderCondition(ladder.id);
      const changed = condition !== ladder.condition;
      if (changed) {
        ladder.landed = ladder.condition === "broken" && condition === "whole" ? 0 : null;
        ladder.condition = condition;
        ladder.since = 0;
      }
      ladder.since += seconds;
      this.follow(ladder, seconds);
      const moving =
        condition === "creaking" ||
        condition === "broken" ||
        ladder.twist !== null ||
        ladder.landed !== null;
      if (rescaled || changed || moving || ladder.bowed || ladder.loads.length > 0 || bouncing) {
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
    this.drawChips();
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
      this.puffGraphics.tint = palette.snowCrest;
      // Chips of ice glint in the headlamps' light at night.
      this.chipGraphics.tint = Palette.mix(
        palette.snowCrest,
        Palette.LAMP,
        atmosphere.light.lamps * SlopeLayer.CHIP_GLINT,
      );
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
    return (
      ladder.bow.sag(ladder.loads, along) +
      this.bouncing(ladder, along) +
      this.shake(ladder).drop(along)
    );
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
    const shake = this.shake(ladder);
    const shaking = shake !== LadderShake.STILL;
    const sag = (along: number): number =>
      (bowed ? bow.sag(loads, along) + this.bouncing(ladder, along) : 0) + shake.drop(along);
    // Rolled over its long axis, its rails show closer together or further apart (#228).
    const turned = (along: number): number => SlopeLayer.turned(shake.roll(along));
    const pieces = bowed || shaking ? SlopeLayer.BOW_PIECES : 1;
    graphics.clear();
    const rails = (): void => {
      for (const side of [1, -1]) {
        for (let piece = 0; piece <= pieces; piece += 1) {
          const along = (length * piece) / pieces;
          const open = side * turned(along);
          const x = start.x + alongX * along + open * railX;
          const y = start.y + alongY * along + open * railY - sag(along);
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
        const open = turned(rung);
        graphics
          .moveTo(x - railX * open, y - railY * open)
          .lineTo(x + railX * open, y + railY * open);
      }
    };
    rails();
    graphics.stroke({ width: width * 2.2, color: Palette.LADDER_SHADE, cap: "round" });
    rails();
    graphics.stroke({ width, color: Palette.LADDER, cap: "round" });
    SlopeLayer.lashings(graphics, ladder, sag, turned, size);
    if (across && ladder.condition !== "broken") {
      SlopeLayer.handLine(graphics, ladder, sag, size);
    }
    ladder.bowed = bowed;
    this.swing(ladder);
  }

  /** Whether a lashed ladder's twist is on its way (#197). */
  private twisting(ladder: DrawnLadder): boolean {
    const { lashed } = ladder;
    return lashed !== null && (this.jolts?.warnings ?? []).some(({ zone }) => zone === lashed);
  }

  /** A ladder's clocks, `seconds` on: its twist's, on its way and over, until it's settled; its
   * bounce on the lip once laid back, until it's settled; and how far it's drawn hauled back up,
   * catching up with the haul (#228). */
  private follow(ladder: DrawnLadder, seconds: number): void {
    const { SETTLED, HANGING } = SlopeLayer;
    if (this.twisting(ladder)) {
      ladder.twist =
        ladder.twist === null || ladder.twist.over > 0
          ? { on: 0, over: 0 }
          : { on: ladder.twist.on + seconds, over: 0 };
    } else if (ladder.twist !== null) {
      const over = ladder.twist.over + seconds;
      ladder.twist = over > SETTLED.twist ? null : { on: ladder.twist.on + seconds, over };
    }
    if (ladder.landed !== null) {
      ladder.landed += seconds;
      if (ladder.landed > SETTLED.landing) {
        ladder.landed = null;
      }
    }
    const raised = this.physics.ladderRaised(ladder.id);
    ladder.raised += (raised - ladder.raised) * Math.min(seconds / HANGING.catches, 1);
    if (ladder.condition !== "broken") {
      ladder.raised = 0;
    }
  }

  /** How a ladder shakes this frame (#228): creaking, in jerks at its failing end; rocking while
   * its twist comes and settling after; bouncing on the lip once laid back; else still. */
  private shake(ladder: DrawnLadder): Shake {
    if (ladder.condition === "creaking") {
      return ladder.shaker.creaking(ladder.since, this.physics.ladderTorn(ladder.id));
    }
    if (ladder.twist !== null && ladder.condition === "whole") {
      return ladder.shaker.twisting(ladder.twist.on, ladder.twist.over);
    }
    if (ladder.landed !== null) {
      return ladder.shaker.landing(ladder.landed);
    }
    return LadderShake.STILL;
  }

  /** How far a ladder's rails show apart, rolled `roll` over its long axis, against lying flat:
   * its width turned up or down towards the view from a little above. */
  private static turned(roll: number): number {
    return Math.cos(roll) + Math.sin(roll) / SlopeLayer.RAIL_DEPTH;
  }

  /** A broken ladder swung down into its crevasse from the end that holds (#209): it falls,
   * knocks against the wall and settles, hanging; whole, it lies where it's laid. */
  private swing(ladder: DrawnLadder): void {
    const { graphics, start, finish } = ladder;
    const torn = ladder.condition === "broken" ? this.physics.ladderTorn(ladder.id) : null;
    if (torn === null) {
      graphics.pivot.set(0, 0);
      graphics.position.set(0, 0);
      graphics.rotation = 0;
      return;
    }
    const holds = torn === "start" ? finish : start;
    // Hanging straight down from the end that holds: a quarter turn, the free end down. The
    // layer's y is up, so a turn the free end down is the other way round on its graphics.
    const quarter = (torn === "start" ? 1 : -1) * (Math.PI / 2);
    // Hauled back up, it comes round again in pulls, swaying more for them (#228); hanging, the
    // crevasse's air sways it a little.
    const { HANGING } = SlopeLayer;
    const hauled = ladder.raised;
    const pull =
      hauled > 0
        ? HANGING.hauled * Math.max(Math.sin(2 * Math.PI * HANGING.pulls * this.elapsed), 0)
        : 0;
    const sway = HANGING.sway * Math.sin(2 * Math.PI * HANGING.hz * this.elapsed + ladder.length);
    const round = SlopeLayer.swung(ladder.since) * (1 - hauled * hauled * (3 - 2 * hauled));
    graphics.pivot.set(holds.x, holds.y);
    graphics.position.set(holds.x, holds.y);
    graphics.rotation =
      quarter * round + (sway - pull) * (torn === "start" ? 1 : -1) * (1 - hauled);
  }

  /** How far round a broken ladder has swung, `seconds` after it broke: 0 laid, 1 hanging. It
   * falls faster and faster, knocks against the wall, rebounds a little and settles. */
  private static swung(seconds: number): number {
    const { fall, knock, back } = SlopeLayer.SWING;
    if (seconds < fall) {
      const share = seconds / fall;
      return share * share;
    }
    const after = seconds - fall;
    return 1 - back * Math.abs(Math.sin((Math.PI * after) / knock)) * Math.exp(-3 * after);
  }

  /** Where a ladder longer than `SECTION_METRES` is lashed from sections end to end: at each joint,
   * a few wraps of cord round each rail, bowed with the ladder. */
  private static lashings(
    graphics: Graphics,
    { start, finish, length }: DrawnLadder,
    sag: (along: number) => number,
    turned: (along: number) => number,
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
          const rail = side * LADDER_HALF_WIDTH * turned(along);
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

  /** The chips of ice the picks and the front points knocked off, while there are any. */
  private drawChips(): void {
    const live = this.chips.live > 0;
    if (!live && !this.chipsShown) {
      return;
    }
    this.chipsShown = live;
    this.chipGraphics.clear();
    this.chips.forEach(this.drawChip);
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

  /** The snow the wind lifts where the camera shows the slope (#223), as `BlownSnow` blows it:
   * soft veils along the snow and wisps off its edges, in the snow's colour for the hour, brighter
   * in the headlamps' beams; and the air's ice crystals glinting in the beams, faintly with no
   * wind, as #125's scene has. */
  private blow(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    const { terrain } = this.physics;
    const { width } = camera.screen;
    const view = {
      from: camera.at(0, 0).x - SlopeLayer.BLOWN_MARGIN,
      to: camera.at(width, 0).x + SlopeLayer.BLOWN_MARGIN,
    };
    this.blownSnow.blow(seconds, atmosphere, (x) => terrain.height(x), view);
    this.drawBlown(atmosphere, this.blownParticles.length / (view.to - view.from));
    this.glint(seconds, camera, atmosphere);
  }

  /** Each puff of the blown snow where it is, as long and thick as it is, along its heading, as
   * much of it as shows, lit by the hour and the beams it's in; each shows more where `aMetre`
   * puffs a metre share the view, fewer than a view of High's, so the veil reads on every level
   * and at every zoom. */
  private drawBlown(atmosphere: Atmosphere, aMetre: number): void {
    const { beams, softPuff } = this;
    const { BLOWN, GLINT } = SlopeLayer;
    const colour = atmosphere.palette.snowCrest;
    const alpha =
      BLOWN.alpha *
      Math.min(Math.max(BLOWN.aMetre / Math.max(aMetre, 0.01), 1) ** 0.6, BLOWN.sparse);
    let showing = false;
    for (const [index, puff] of this.blownSnow.puffs.entries()) {
      const particle = this.blownParticles[index];
      if (particle === undefined) {
        continue;
      }
      if (puff.shows < BLOWN.least) {
        particle.alpha = 0;
        continue;
      }
      showing = true;
      const lit = beams.reduce((most, beam) => Math.max(most, beam.lights(puff)), 0);
      particle.x = puff.x;
      particle.y = puff.y;
      particle.scaleX = puff.length / softPuff.width;
      particle.scaleY = puff.thickness / softPuff.height;
      particle.rotation = puff.heading;
      particle.tint =
        lit > GLINT.least ? Palette.mix(colour, Palette.LAMP, lit * BLOWN.lit) : colour;
      particle.alpha = Math.min(1, puff.shows * (alpha + lit * BLOWN.litAlpha));
    }
    this.blownContainer.visible = showing;
  }

  /** The air's ice crystals around the camera, blown along by the gust and lower in it, glinting
   * where a headlamp's beam lights them. */
  private glint(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    const { gust, elapsed } = atmosphere;
    const { beams } = this;
    this.glints.clear();
    if (beams.length === 0) {
      return;
    }
    const { terrain } = this.physics;
    const cameraX = camera.position.x;
    this.drift.blow(seconds, gust, (x) => terrain.height(cameraX + x), elapsed);
    const strength = Math.max(
      0,
      (gust - SlopeLayer.DRIFT_FROM_GUST) / (1 - SlopeLayer.DRIFT_FROM_GUST),
    );
    const shown = SlopeLayer.GLINT.calm + (1 - SlopeLayer.GLINT.calm) * Math.min(1, strength * 1.5);
    const lower = 1 - SlopeLayer.DRIFT_LOWER * strength;
    for (const mote of this.drift.motes) {
      const ground = terrain.height(cameraX + mote.x);
      const at = { x: cameraX + mote.x, y: ground + (mote.y - ground) * lower };
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
  /** A soft puff for the blown snow (#223): white at its middle and clear at its edge, a radial
   * gradient on a canvas of its own, so the snow reads as a veil and not as specks. */
  private static puffTexture(): Texture {
    const pixels = SlopeLayer.PUFF_PIXELS;
    const middle = pixels / 2;
    const canvas = DOMAdapter.get().createCanvas(pixels, pixels);
    const context = canvas.getContext("2d");
    if (context === null) {
      return Texture.WHITE;
    }
    const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    for (const [offset, alpha] of [
      [0, 1],
      [0.4, 0.75],
      [0.75, 0.3],
      [1, 0],
    ] as const) {
      gradient.addColorStop(offset, Palette.css(0xffffff, alpha));
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, pixels, pixels);
    return Texture.from(canvas);
  }

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
    for (const { corners } of towers.towers) {
      const top = corners.reduce<Point | null>(
        (highest, corner) => (highest === null || corner.y > highest.y ? corner : highest),
        null,
      );
      if (top !== null) {
        this.towerTops.push(top);
      }
    }
  }

  /** The ice where the ladders cross it, and the steps of it the route climbs with none, in the
   * day's colours for the hour to tint (#184): each crevasse's inside going black as it goes down,
   * the light through the ice along its walls, the snow at its foot and on its steps; each wall's
   * bare face and its streaks, and on a step with no ladder its bands of brittle ice, pale and
   * edged; and the lips of snow on them all, with their icicles. */
  private drawIce(terrain: Terrain, seed: number): void {
    const { flat } = SlopeLayer;
    const cornices = [];
    const brittle = this.physics.brittle;
    for (const [index, { foot, top }] of this.physics.bareFaces.entries()) {
      const [start, finish] = [Math.min(foot, top), Math.max(foot, top)].map((along) =>
        terrain.point(along),
      );
      if (start === undefined || finish === undefined) {
        continue;
      }
      const wall = new IceWall(terrain, start, finish, seed + SlopeLayer.BARE_SEEDS + index);
      this.walls.poly(flat(wall.face)).fill(SlopeLayer.litIce(wall.face));
      this.streak(wall.streaks);
      for (const stretch of brittle) {
        const [low, high] = [stretch.from, stretch.to]
          .map((along) => terrain.point(along).y)
          .sort((one, other) => one - other);
        const band = wall.brittle(low ?? 0, high ?? 0);
        if (band !== null) {
          this.walls.poly(flat(band.outline)).fill(Palette.BRITTLE);
          this.streak(band.cracks);
        }
      }
      cornices.push(wall.cornice);
    }
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
        this.streak(wall.streaks);
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

  /** A wall's streaks, each a line down its face, for the stroke that draws them all. */
  private streak(streaks: readonly (readonly Point[])[]): void {
    for (const streak of streaks) {
      const [first, ...rest] = streak;
      if (first !== undefined) {
        this.wallEdges.moveTo(first.x, first.y);
        for (const { x, y } of rest) {
          this.wallEdges.lineTo(x, y);
        }
      }
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
