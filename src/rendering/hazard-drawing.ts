import { Container, Graphics, Particle, ParticleContainer } from "pixi.js";
import type { Texture } from "pixi.js";

import type { Point, Terrain } from "../physics";
import { SeededRandom, SimulationClock } from "../simulation";
import type { HazardKind, HazardZone, ObjectiveHazards, Strike, Warning } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import { HazardSigns } from "./hazard-signs";
import type { Serac } from "./hazard-signs";
import type { IceSurface } from "./ice-surface";
import { Palette } from "./palette";
import { SeracFall } from "./serac-fall";
import type { FallingPiece, SeracFallFrame, SeracTiming } from "./serac-fall";
import type { BetweenSteps } from "./stepped-points";

/** Points as Pixi takes them: x, y, x, y… */
const flat = (points: readonly Point[]): number[] => points.flatMap(({ x, y }) => [x, y]);

/** A warning of an avalanche or a cornice as the picture has it: how long it runs, and how long
 * it's been showing, in seconds of play. */
interface Showing {
  readonly zone: HazardZone;
  readonly length: number;
  shown: number;
}

/** A serac as the picture has it (#229): its shape as first drawn, its own drawing, the stretch
 * it stands over, its zone's or a training collapse's off the zones; and as it stands now: its
 * outline, whole or its stump, the snow on its top till it breaks, the fresh break along its top
 * and how high it broke, once it has, and whether a fall is cracking it now. */
interface Tower {
  readonly serac: Serac;
  readonly graphics: Graphics;
  readonly over: string;
  outline: readonly Point[];
  cap: readonly Point[] | null;
  face: readonly Point[] | null;
  cut: number;
  breaking: boolean;
}

/** A serac breaking in a collapse, its fall, and whether its rubble is laid on the route yet. */
interface Breaking {
  readonly tower: Tower;
  readonly fall: SeracFall;
  laid: boolean;
}

/** A serac zone or a training collapse coming down (#229): where, from what step; the seracs it
 * breaks; the steps since it began, as the frames took them; and whether it has come down in the
 * game yet. */
interface Collapse {
  readonly zone: string;
  readonly began: number;
  readonly breaking: readonly Breaking[];
  steps: number;
  struck: boolean;
}

/**
 * The hazards on the slope, as `HazardSigns` shapes them: the seracs towering over a serac's
 * stretch, each drawn on its own behind the route's ice in the day's colours for the hour to tint,
 * their faces away from the light in shade, snow on their tops and cracks down them (#184); the
 * loaded snow along an avalanche slope, drawn once on the ground behind the climbers; and what
 * comes down while one goes, drawn in front of them each frame. A serac zone that goes, or a
 * training collapse (#209), breaks the serac over each climber under it, or over its stretch, as
 * `SeracFall` has it fall (#229): the crack across it and its top leaning out on it, the blocks
 * tumbling and shattering on the route, the ice dust billowing up and away on the wind, and the
 * picture shaking with it; its stump and its rubble stay for the rest of the climb, and a reload
 * lays them again from the strikes. Its clock is the game's steps, so its ice lands as the game's
 * comes down. An avalanche's or a cornice's snow comes down from high above, and lies a moment. It
 * reads the hazards and holds only the picture's own state of them.
 */
export class HazardDrawing {
  private static readonly ICE = 0xcfe6f5;
  private static readonly ICE_EDGE = 0x8fb7d4;
  private static readonly LOADED = 0xffffff;
  /** A crack down a serac: its colour, how wide, and how strong. */
  private static readonly CRACK = 0x1f4f80;
  private static readonly CRACK_METRES = 0.12;
  private static readonly CRACK_ALPHA = 0.75;
  private static readonly DEBRIS: Readonly<Record<HazardKind, number>> = {
    serac: 0xbcdcf0,
    avalanche: 0xffffff,
    crevasse: 0xffffff,
    cornice: 0xffffff,
  };
  private static readonly EDGE_METRES = 0.08;
  /** A serac's face away from the light. */
  private static readonly ICE_SHADE = 0x9db8d0;
  /** How long what came down lies on the ground before the picture clears it, in seconds. */
  private static readonly SETTLE_SECONDS = 2;
  /** A serac breaking (#229): its crack's colour and how wide it opens; the fresh ice of its
   * break; the edge of a chunk of it, and how wide. */
  private static readonly CRACK_OPEN = 0x0b2f55;
  private static readonly CRACK_WIDE = 0.3;
  private static readonly FRESH = 0x8cc6ea;
  private static readonly RUBBLE_EDGE = 0x7fa8c8;
  private static readonly CHUNK_EDGE_METRES = 0.06;
  /** How tall a serac has to stand still, over the ice about it, to break again, in metres. */
  private static readonly STANDING = 4;
  /** How much of its dust a puff shows at most, in the hour's light. */
  private static readonly DUST_ALPHA = 0.7;
  /** How hard an avalanche or a cornice coming down shakes the picture. */
  private static readonly SNOW_SHAKE = 1;

  /** The seracs, behind the route's ice; what lies on the ground, behind the climbers. */
  readonly seracs = new Container();
  readonly standing = new Graphics();
  /** In front of them: what comes down, and its dust. */
  readonly falling = new Graphics();
  readonly dust = new ParticleContainer({
    dynamicProperties: { position: true, vertex: true, rotation: false, uvs: false, color: true },
  });
  private readonly signs: HazardSigns;
  private readonly towers: Tower[] = [];
  private readonly showing = new Map<string, Showing>();
  private readonly collapses = new Map<string, Collapse>();
  private readonly particles: Particle[] = [];
  /** How many strikes the picture has seen, and how hard it shakes this frame. */
  private struck = 0;
  private shake = 0;

  /**
   * The hazards' picture over `terrain`, its seracs on the ice `surface`, its dust in soft
   * `puff`s; `climbers` says where each living climber is, for the seracs over them to break.
   */
  constructor(
    private readonly hazards: ObjectiveHazards,
    private readonly terrain: Terrain,
    surface: IceSurface,
    private readonly puff: Texture,
    private readonly climbers: () => readonly Point[],
  ) {
    this.signs = new HazardSigns(terrain, surface);
    const staged = hazards.events.filter(({ kind }) => kind === "serac");
    const seracZones = hazards.zones.filter(({ kind }) => kind === "serac");
    for (const zone of hazards.zones) {
      for (const outline of this.signs.zone(zone)) {
        this.standing.poly(flat(outline)).fill(HazardDrawing.LOADED);
      }
      for (const serac of this.signs.seracs(zone, staged)) {
        this.addTower(serac, zone.id);
      }
    }
    for (const event of staged) {
      const over = this.middleOf(event);
      const onAZone = seracZones.some(
        (zone) => over >= this.xOf(zone.from) && over <= this.xOf(zone.to),
      );
      if (!onAZone) {
        this.addTower(this.signs.seracOver(event), event.id);
      }
    }
    // What came down before the picture began: its seracs broken and its rubble on the route.
    for (const strike of hazards.strikes) {
      this.settle(strike);
    }
    this.struck = hazards.strikes.length;
  }

  /** How hard the picture shakes now, from nothing to about 1: while a serac cracks, its ice
   * falls and lands, or snow comes down. */
  get shaking(): number {
    return this.shake;
  }

  /** A frame, `seconds` after the last, `between` the game's steps, in the air of `atmosphere`:
   * each hazard going a little further on. */
  draw(seconds: number, between: BetweenSteps, atmosphere: Atmosphere): void {
    this.follow(seconds, between);
    this.falling.clear();
    let shake = 0;
    let puffs = 0;
    for (const [key, collapse] of this.collapses) {
      const time = (collapse.steps + between.progress) * SimulationClock.STEP_SECONDS;
      let over = true;
      for (const breaking of collapse.breaking) {
        const { tower, fall } = breaking;
        const frame = fall.at(time, atmosphere.gust);
        if (frame.lean !== null) {
          this.drawCracking(tower, fall, frame);
        } else if (tower.breaking) {
          this.broken(tower, fall);
        }
        this.drawPieces(frame.pieces, tower.serac.turned);
        puffs = this.drawDust(frame.dust, puffs, atmosphere);
        shake = Math.max(shake, frame.shake);
        if (!breaking.laid && time >= fall.rests) {
          breaking.laid = true;
          this.lay(fall);
        }
        over &&= time >= fall.ends;
      }
      if (over && collapse.struck) {
        this.collapses.delete(key);
      }
    }
    for (const { zone, length, shown } of this.showing.values()) {
      shake = Math.max(shake, shown < length ? HazardDrawing.SNOW_SHAKE : 0);
      const colour = HazardDrawing.DEBRIS[zone.kind];
      for (const piece of this.signs.debris(zone, shown / length)) {
        this.falling.circle(piece.x, piece.y + piece.size / 2, piece.size / 2).fill(colour);
      }
    }
    for (const particle of this.particles.slice(puffs)) {
      particle.alpha = 0;
    }
    this.dust.visible = puffs > 0;
    this.shake = shake;
  }

  /** Each collapse's clock on by the steps the frame took, and the warnings and strikes that are
   * new: a serac's collapse starts breaking the seracs over it, one that has come down in the game
   * is at least as far on as that, and an avalanche's or a cornice's warning starts its own clock;
   * those that have lain on the ground long enough go. */
  private follow(seconds: number, between: BetweenSteps): void {
    for (const collapse of this.collapses.values()) {
      collapse.steps += between.taken;
    }
    for (const warning of this.hazards.warnings) {
      const key = `${warning.zone}@${warning.began}`;
      if (this.collapses.has(key) || this.showing.has(key)) {
        continue;
      }
      const going = this.stretch(warning.zone);
      if (going === undefined) {
        continue;
      }
      if (warning.kind === "serac") {
        this.collapse(key, warning, going);
      } else {
        const length = (warning.comes - warning.began) * SimulationClock.STEP_SECONDS;
        this.showing.set(key, { zone: going, length, shown: 0 });
      }
    }
    for (const strike of this.hazards.strikes.slice(this.struck)) {
      if (strike.kind !== "serac") {
        continue;
      }
      const collapse = [...this.collapses.values()].find(
        ({ zone, struck }) => zone === strike.zone && !struck,
      );
      if (collapse !== undefined) {
        collapse.struck = true;
        collapse.steps = Math.max(collapse.steps, strike.step - collapse.began);
        continue;
      }
      // Down with no warning seen: at once.
      const going = this.stretch(strike.zone);
      if (going !== undefined) {
        const { zone, kind, step } = strike;
        const warning: Warning = { zone, kind, began: step, comes: step };
        this.collapse(`${strike.zone}@${strike.step}`, warning, going, true);
      }
    }
    this.struck = this.hazards.strikes.length;
    for (const [key, showing] of this.showing) {
      showing.shown += seconds;
      if (showing.shown > showing.length + HazardDrawing.SETTLE_SECONDS) {
        this.showing.delete(key);
      }
    }
  }

  /** A serac collapse starting from `warning` over `going`: the seracs it breaks, each falling as
   * the warning's crack runs and its ice falls, from the draws of the stretch and the step it
   * comes down on, as a reload draws them again. */
  private collapse(key: string, warning: Warning, going: HazardZone, struck = false): void {
    const breaks = warning.breaks ?? warning.comes;
    const timing: SeracTiming = {
      crack: (breaks - warning.began) * SimulationClock.STEP_SECONDS,
      fall: (warning.comes - breaks) * SimulationClock.STEP_SECONDS,
    };
    const seed = HazardDrawing.seed(warning.zone, warning.comes);
    const towers = this.towersFor(going, this.climbers(), seed);
    const breaking = towers.map((tower, index) => {
      tower.breaking = true;
      return { tower, fall: this.fallOf(tower, going, timing, seed + index), laid: false };
    });
    this.collapses.set(key, {
      zone: warning.zone,
      began: warning.began,
      breaking,
      steps: 0,
      struck,
    });
  }

  /** A serac collapse that came down before the picture began: its seracs broken, and their
   * rubble on the route. */
  private settle(strike: Strike): void {
    const going = this.stretch(strike.zone);
    if (strike.kind !== "serac" || going === undefined) {
      return;
    }
    const seed = HazardDrawing.seed(strike.zone, strike.step);
    for (const [index, tower] of this.towersFor(going, [], seed).entries()) {
      const fall = this.fallOf(tower, going, { crack: 0, fall: 1 }, seed + index);
      this.broken(tower, fall);
      this.lay(fall);
    }
  }

  /** The seracs a collapse over `going` breaks: a training collapse's, the one over its stretch;
   * a zone's, the one nearest each climber in it, or one the draws pick if none is; each the
   * nearest standing tall enough to break, or the nearest of those left, none breaking already. */
  private towersFor(going: HazardZone, climbers: readonly Point[], seed: number): Tower[] {
    const staged = this.hazards.events.some(({ id }) => id === going.id);
    const free = this.towers.filter(
      ({ over, breaking }) => !breaking && (staged || over === going.id),
    );
    if (free.length === 0) {
      return [];
    }
    const tall = free.filter(
      ({ outline, serac }) =>
        Math.max(...outline.map(({ y }) => y)) - serac.base >= HazardDrawing.STANDING,
    );
    const among = tall.length > 0 ? tall : free;
    const nearest = (x: number): Tower =>
      among.reduce((best, tower) =>
        Math.abs(tower.serac.middle - x) < Math.abs(best.serac.middle - x) ? tower : best,
      );
    if (staged) {
      return [nearest(this.middleOf(going))];
    }
    const left = this.xOf(going.from);
    const right = this.xOf(going.to);
    const under = climbers.filter(({ x }) => x >= left && x <= right);
    if (under.length === 0) {
      const random = SeededRandom.fromSeed(seed);
      const picked = among[random.between(0, among.length - 1)];
      return picked === undefined ? [] : [picked];
    }
    return [...new Set(under.map(({ x }) => nearest(x)))];
  }

  /** A serac's fall over `going`, its ice landing on that stretch of the route. */
  private fallOf(tower: Tower, going: HazardZone, timing: SeracTiming, seed: number): SeracFall {
    const landing = { from: this.xOf(going.from), to: this.xOf(going.to) };
    const ground = (x: number): number => this.terrain.height(x);
    const { turned, base } = tower.serac;
    const standing = { outline: tower.outline, snow: tower.cap, turned, base };
    return new SeracFall(standing, ground, timing, landing, seed);
  }

  /** A serac broken by its fall: its stump and the fresh break along its top, from now on. */
  private broken(tower: Tower, fall: SeracFall): void {
    tower.outline = fall.stump;
    tower.face = fall.face;
    tower.cap = null;
    tower.cut = Math.min(tower.cut, fall.cut);
    tower.breaking = false;
    this.drawTower(tower);
  }

  /** A fall's rubble, lying on the route behind the climbers for the rest of the climb. */
  private lay(fall: SeracFall): void {
    for (const piece of fall.rubble) {
      const points = flat(piece);
      this.standing.poly(points).fill(HazardDrawing.ICE);
      this.standing
        .poly(points)
        .stroke({ width: HazardDrawing.CHUNK_EDGE_METRES, color: HazardDrawing.RUBBLE_EDGE });
    }
  }

  private addTower(serac: Serac, over: string): void {
    const tower: Tower = {
      serac,
      graphics: new Graphics(),
      over,
      outline: serac.outline,
      cap: serac.cap,
      face: null,
      cut: Infinity,
      breaking: false,
    };
    this.towers.push(tower);
    this.seracs.addChild(tower.graphics);
    this.drawTower(tower);
  }

  /** A serac as it stands, whole or its stump: its ice, its side away from the light, the cracks
   * down it below where it broke, the fresh break along its top, the snow on it, and its edge. */
  private drawTower(tower: Tower): void {
    const graphics = tower.graphics.clear();
    this.drawIce(graphics, tower.serac, tower.outline, tower.cut);
    if (tower.face !== null) {
      graphics.poly(flat(tower.face)).fill(HazardDrawing.FRESH);
    }
    if (tower.cap !== null) {
      graphics.poly(flat(tower.cap)).fill(Palette.SNOW_CREST);
    }
    graphics
      .poly(flat(tower.outline))
      .stroke({ width: HazardDrawing.EDGE_METRES, color: HazardDrawing.ICE_EDGE });
  }

  /** A serac cracking: its stump, the crack opening across it, dark through the gap, and its top
   * leaning out on it, with the snow on it and its old break if it broke before. */
  private drawCracking(tower: Tower, fall: SeracFall, frame: SeracFallFrame): void {
    const graphics = tower.graphics.clear();
    const lean = frame.lean ?? 0;
    const { serac } = tower;
    this.drawIce(graphics, serac, fall.stump, Math.min(tower.cut, fall.cut));
    const ran = frame.crack;
    if (ran.length >= 2) {
      graphics
        .poly(flat([...ran, ...fall.leaned(ran, lean).reverse()]))
        .fill(HazardDrawing.CRACK_OPEN);
    }
    const top = fall.leaned(fall.top, lean);
    graphics.poly(flat(top)).fill(HazardDrawing.ICE);
    graphics
      .poly(flat(fall.leaned(HazardSigns.shaded(serac, fall.top), lean)))
      .fill(HazardDrawing.ICE_SHADE);
    for (const crack of serac.cracks) {
      // What's left of it: above this crack, and below where it broke before, if it did.
      const above = HazardDrawing.split(crack, fall.cut, true);
      this.line(graphics, fall.leaned(HazardDrawing.split(above, tower.cut, false), lean));
    }
    graphics.stroke({
      width: HazardDrawing.CRACK_METRES,
      color: HazardDrawing.CRACK,
      alpha: HazardDrawing.CRACK_ALPHA,
      join: "round",
      cap: "round",
    });
    if (tower.face !== null) {
      graphics.poly(flat(fall.leaned(tower.face, lean))).fill(HazardDrawing.FRESH);
    }
    if (tower.cap !== null) {
      graphics.poly(flat(fall.leaned(tower.cap, lean))).fill(Palette.SNOW_CREST);
    }
    graphics
      .poly(flat(top))
      .stroke({ width: HazardDrawing.EDGE_METRES, color: HazardDrawing.ICE_EDGE });
    graphics
      .poly(flat(fall.stump))
      .stroke({ width: HazardDrawing.EDGE_METRES, color: HazardDrawing.ICE_EDGE });
    if (ran.length >= 2) {
      this.line(graphics, ran);
      graphics.stroke({
        width: HazardDrawing.CRACK_WIDE * (0.3 + 0.7 * frame.open),
        color: HazardDrawing.CRACK_OPEN,
        join: "miter",
        cap: "butt",
      });
    }
  }

  /** The ice of a serac's `outline`, its side away from the light in shade, and the cracks down
   * it below `cut`. */
  private drawIce(graphics: Graphics, serac: Serac, outline: readonly Point[], cut: number): void {
    graphics.poly(flat(outline)).fill(HazardDrawing.ICE);
    graphics.poly(flat(HazardSigns.shaded(serac, outline))).fill(HazardDrawing.ICE_SHADE);
    for (const crack of serac.cracks) {
      this.line(graphics, HazardDrawing.split(crack, cut, false));
    }
    graphics.stroke({
      width: HazardDrawing.CRACK_METRES,
      color: HazardDrawing.CRACK,
      alpha: HazardDrawing.CRACK_ALPHA,
      join: "round",
      cap: "round",
    });
  }

  /** What comes down this frame: the blocks, ice with their side away from the light, as a
   * serac's `turned` has it, in shade, and the snow that lay on them; the chunks, with an edge;
   * the shards and the chips. */
  private drawPieces(pieces: readonly FallingPiece[], turned: 1 | -1): void {
    const { falling } = this;
    for (const { kind, corners, snow } of pieces) {
      if (kind === "block") {
        const middle = corners.reduce((sum, { x }) => sum + x, 0) / Math.max(corners.length, 1);
        const [from, to] = turned === 1 ? [-Infinity, middle] : [middle, Infinity];
        falling.poly(flat(corners)).fill(HazardDrawing.ICE);
        const shade = SeracFall.slab(corners, "x", from, to);
        if (shade.length >= 3) {
          falling.poly(flat(shade)).fill(HazardDrawing.ICE_SHADE);
        }
        if (snow !== undefined) {
          falling.poly(flat(snow)).fill(Palette.SNOW_CREST);
        }
        falling
          .poly(flat(corners))
          .stroke({ width: HazardDrawing.EDGE_METRES, color: HazardDrawing.ICE_EDGE });
      } else if (kind === "chunk") {
        falling.poly(flat(corners)).fill(HazardDrawing.ICE);
        falling
          .poly(flat(corners))
          .stroke({ width: HazardDrawing.CHUNK_EDGE_METRES, color: HazardDrawing.RUBBLE_EDGE });
      } else {
        falling.poly(flat(corners)).fill(HazardDrawing.DEBRIS.serac);
      }
    }
  }

  /** The dust's puffs, soft, in the hour's light, from the `from`th of the particles on: the
   * count drawn after them. */
  private drawDust(dust: SeracFallFrame["dust"], from: number, atmosphere: Atmosphere): number {
    const { puff } = this;
    const colour = atmosphere.palette.snowCrest;
    let index = from;
    for (const { x, y, radius, shows } of dust) {
      const particle = this.particles[index] ?? this.particle();
      particle.x = x;
      particle.y = y;
      particle.scaleX = (2 * radius) / puff.width;
      particle.scaleY = (2 * radius) / puff.height;
      particle.tint = colour;
      particle.alpha = Math.min(1, shows * HazardDrawing.DUST_ALPHA);
      index += 1;
    }
    return index;
  }

  /** One more puff of dust to draw with. */
  private particle(): Particle {
    const particle = new Particle({ texture: this.puff, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
    this.particles.push(particle);
    this.dust.addParticle(particle);
    return particle;
  }

  /** A line through `points`, to stroke. */
  private line(graphics: Graphics, points: readonly Point[]): void {
    const [first, ...rest] = points;
    if (first === undefined || rest.length === 0) {
      return;
    }
    graphics.moveTo(first.x, first.y);
    for (const { x, y } of rest) {
      graphics.lineTo(x, y);
    }
  }

  /** A zone or a training collapse by its id. */
  private stretch(id: string): HazardZone | undefined {
    return (
      this.hazards.zones.find((zone) => zone.id === id) ??
      this.hazards.events.find((event) => event.id === id)
    );
  }

  private xOf(along: number): number {
    return this.terrain.point(along).x;
  }

  private middleOf(stretch: HazardZone): number {
    return this.xOf((stretch.from + stretch.to) / 2);
  }

  /** The part of a crack down a serac above the height `at`, or below it: a line going down. */
  private static split(line: readonly Point[], at: number, above: boolean): Point[] {
    const kept: Point[] = [];
    for (const [index, point] of line.entries()) {
      if (above ? point.y >= at : point.y <= at) {
        kept.push(point);
      }
      const next = line[index + 1];
      if (next !== undefined && (point.y - at) * (next.y - at) < 0) {
        const share = (at - point.y) / (next.y - point.y);
        kept.push({ x: point.x + (next.x - point.x) * share, y: at });
      }
    }
    return kept;
  }

  /** The draws of a serac collapse: its stretch's and the step it comes down on (FNV-1a). */
  private static seed(zone: string, step: number): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < zone.length; index += 1) {
      hash = Math.imul(hash ^ zone.charCodeAt(index), 0x01000193) >>> 0;
    }
    return (hash ^ Math.imul(step, 0x9e3779b1)) >>> 0;
  }
}
