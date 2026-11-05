import { Graphics, Particle, ParticleContainer, Texture } from "pixi.js";

import type { Point, SlopePhysics, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import type { Body, ClimberId, ObjectiveHazards } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import { CampSigns } from "./camp-signs";
import type { CampStretch } from "./camp-signs";
import { ClimberFigure } from "./climber-figure";
import { Drift } from "./drift";
import { HazardDrawing } from "./hazard-drawing";
import { LeastSize } from "./least-size";
import { Palette } from "./palette";
import { ParallaxLayer } from "./parallax-layer";
import { SlopeDetails } from "./slope-details";

interface DrawnRope {
  readonly id: string;
  readonly graphics: Graphics;
  /** The points it was last drawn through, to skip a rope that lies still. */
  drawn: readonly Point[];
}

interface DrawnLadder {
  readonly ends: readonly Point[];
  readonly graphics: Graphics;
}

/**
 * The slope itself, at the camera's own depth: the ground as the physics has it, its snow marked
 * with sastrugi and the boot track of the climbers before, its walls of ice, its ladders, its
 * ropes with their pickets, its hazards, the camps' tents, lit from inside at night, and every
 * climber on it, drawn by `ClimberFigure`; the spindrift the wind blows along the snow around the
 * camera, and the veil of a cloudy day behind the slope. In the picture alone, the ground runs on
 * level past the section's ends, so the view far out shows no cliff there. The snow and what
 * marks it are drawn once in white and tinted by the hour's light; the lines, the ground's edge
 * and the ladders, when the scale changes, since they never get thinner than `LeastSize` allows;
 * a rope when it moves too; and the climbers and what comes down are drawn each frame.
 */
export class SlopeLayer extends ParallaxLayer {
  private static readonly SURFACE_METRES = 0.15;
  private static readonly ROPE_METRES = 0.07;
  /** The dark edge under the rope, as a share of its width each side. */
  private static readonly ROPE_EDGE = 0.5;
  private static readonly ANCHOR_METRES = 0.12;
  private static readonly PICKET = { length: 0.6, width: 0.06 };
  private static readonly LADDER_HALF_WIDTH = 0.2;
  private static readonly RUNG_METRES = 0.3;
  private static readonly RAIL_METRES = 0.05;
  private static readonly TENT_EDGE_METRES = 0.08;
  private static readonly TENT_GLOW_METRES = 1.6;
  private static readonly TENT_GLOW_ALPHA = 0.35;
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
  private readonly ladders: readonly DrawnLadder[];
  private readonly ropes: readonly DrawnRope[];
  private readonly figures: readonly { readonly id: ClimberId; readonly figure: ClimberFigure }[];
  private readonly hazards: HazardDrawing;
  private readonly drift: Drift;
  private readonly driftContainer: ParticleContainer;
  private readonly motes: readonly Particle[];
  /** How many tents stand in the camps. */
  readonly tents: number;
  /** The scale the lines were last drawn at, in pixels a metre: none yet. */
  private drawnAt = 0;
  private tintedWith: Atmosphere | null = null;

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
    );
    const signs = new CampSigns(terrain);
    const tents = camps.flatMap((camp) => signs.tents(camp));
    this.addChild(SlopeLayer.drawTents(tents, this.tentGlow));
    this.tents = tents.length;
    this.ladders = physics.ladders.map((id) => {
      const graphics = new Graphics();
      this.addChild(graphics);
      return { ends: physics.ladder(id), graphics };
    });
    this.ropes = physics.ropes.map((id) => {
      const graphics = new Graphics();
      this.addChild(graphics);
      return { id, graphics, drawn: [] };
    });
    this.figures = climbers.map((id) => {
      const suit = id === player ? Palette.PLAYER_SUIT : Palette.OTHER_SUIT;
      const figure = new ClimberFigure(suit);
      this.addChild(figure);
      return { id, figure };
    });
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

  /** Each frame, `seconds` after the last, as the camera sees it and in this frame's air: the
   * snow in the hour's light, the lines at the camera's scale, the ropes where they lie now, the
   * climbers as they are, the spindrift on the gust, and what's coming down. */
  draw(seconds: number, camera: Camera, atmosphere: Atmosphere): void {
    this.hazards.draw(seconds);
    this.light(atmosphere);
    const { pixelsPerMetre } = camera;
    const size = new LeastSize(pixelsPerMetre);
    const rescaled = pixelsPerMetre !== this.drawnAt;
    if (rescaled) {
      this.drawnAt = pixelsPerMetre;
      this.drawSurface(size);
      for (const ladder of this.ladders) {
        SlopeLayer.ladder(ladder, size);
      }
    }
    for (const rope of this.ropes) {
      const points = this.physics.rope(rope.id);
      if (rescaled || !SlopeLayer.same(points, rope.drawn)) {
        rope.drawn = points;
        SlopeLayer.rope(rope.graphics, points, size);
      }
    }
    for (const { id, figure } of this.figures) {
      figure.show(this.physics.climber(id), this.body.climber(id), atmosphere, seconds, size);
    }
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
    }
    this.tintedWith = atmosphere;
    this.tentGlow.alpha = atmosphere.light.lamps * SlopeLayer.TENT_GLOW_ALPHA;
    this.tentGlow.visible = this.tentGlow.alpha > 0.01;
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

  /** The camps' tents, as `CampSigns` shapes them: filled, with an edge and a door, so they read
   * by shape and by colour, and a glow behind each for the night. */
  private static drawTents(tents: readonly (readonly Point[])[], glow: Graphics): Graphics {
    const graphics = new Graphics();
    for (const tent of tents) {
      const [left, right, ridge] = tent;
      if (left === undefined || right === undefined || ridge === undefined) {
        continue;
      }
      glow
        .circle(ridge.x, ridge.y - (ridge.y - left.y) * 0.6, SlopeLayer.TENT_GLOW_METRES)
        .fill(Palette.LAMP);
      graphics
        .poly(tent.flatMap(({ x, y }) => [x, y]))
        .fill(Palette.TENT)
        .stroke({ width: SlopeLayer.TENT_EDGE_METRES, color: Palette.TENT_DOOR });
      const door = (ridge.y - left.y) * 0.55;
      graphics
        .poly([ridge.x - door * 0.4, left.y, ridge.x + door * 0.4, right.y, ridge.x, left.y + door])
        .fill(Palette.TENT_DOOR);
    }
    return graphics;
  }

  private static ladder({ ends, graphics }: DrawnLadder, size: LeastSize): void {
    const [start, finish] = ends;
    if (start === undefined || finish === undefined) {
      throw new RangeError("A ladder needs two ends to draw");
    }
    const acrossX = finish.x - start.x;
    const acrossY = finish.y - start.y;
    const length = Math.hypot(acrossX, acrossY);
    const railX = (-acrossY / length) * SlopeLayer.LADDER_HALF_WIDTH;
    const railY = (acrossX / length) * SlopeLayer.LADDER_HALF_WIDTH;
    const width = size.line(SlopeLayer.RAIL_METRES);
    graphics.clear();
    const rails = (): void => {
      graphics.moveTo(start.x + railX, start.y + railY).lineTo(finish.x + railX, finish.y + railY);
      graphics.moveTo(start.x - railX, start.y - railY).lineTo(finish.x - railX, finish.y - railY);
      for (let rung = SlopeLayer.RUNG_METRES / 2; rung < length; rung += SlopeLayer.RUNG_METRES) {
        const x = start.x + (acrossX / length) * rung;
        const y = start.y + (acrossY / length) * rung;
        graphics.moveTo(x - railX, y - railY).lineTo(x + railX, y + railY);
      }
    };
    rails();
    graphics.stroke({ width: width * 2.2, color: Palette.LADDER_SHADE, cap: "round" });
    rails();
    graphics.stroke({ width, color: Palette.LADDER, cap: "round" });
  }

  /** A rope through its points, with a dark edge so it reads on the snow, and a picket driven
   * in at each end with its anchor. */
  private static rope(graphics: Graphics, points: readonly Point[], size: LeastSize): void {
    graphics.clear();
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    const width = size.line(SlopeLayer.ROPE_METRES);
    const line = (): void => {
      graphics.moveTo(first.x, first.y);
      for (const { x, y } of points.slice(1)) {
        graphics.lineTo(x, y);
      }
    };
    // The anchors and the pickets keep their size beside the rope's, however wide it's drawn.
    const grown = width / SlopeLayer.ROPE_METRES;
    const picket = SlopeLayer.PICKET;
    for (const anchor of [first, last]) {
      graphics
        .moveTo(anchor.x + picket.length * 0.3, anchor.y + picket.length * 0.4)
        .lineTo(anchor.x - picket.length * 0.3, anchor.y - picket.length * 0.4)
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
    for (const anchor of [first, last]) {
      graphics.circle(anchor.x, anchor.y, radius).fill(Palette.ANCHOR);
    }
  }

  private static same(points: readonly Point[], drawn: readonly Point[]): boolean {
    return (
      points.length === drawn.length &&
      points.every((point, index) => point.x === drawn[index]?.x && point.y === drawn[index].y)
    );
  }
}
