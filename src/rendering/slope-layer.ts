import { Graphics } from "pixi.js";

import type { Point, SlopePhysics, Terrain } from "../physics";
import type { ClimberId } from "../simulation";
import { ClimberFigure } from "./climber-figure";
import { LeastSize } from "./least-size";
import { ParallaxLayer } from "./parallax-layer";

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
 * The slope itself, at the camera's own depth: the ground as the physics has it, with its ladders,
 * its ropes and every climber on it. In the picture alone, the ground runs on level past the
 * section's ends, so the view far out shows no cliff there. The snow is drawn once; the lines, the
 * ground's edge and the ladders, when the scale changes, since they never get thinner than
 * `LeastSize` allows; a rope when it moves too; and the climbers are placed each frame.
 */
export class SlopeLayer extends ParallaxLayer {
  private static readonly SNOW = 0xeef3f9;
  private static readonly SURFACE = 0xffffff;
  private static readonly ROPE = 0xff6f3c;
  private static readonly ANCHOR = 0x3a3f47;
  private static readonly LADDER = 0xb9c4cf;
  private static readonly SURFACE_METRES = 0.15;
  private static readonly ROPE_METRES = 0.07;
  private static readonly ANCHOR_METRES = 0.12;
  private static readonly LADDER_HALF_WIDTH = 0.2;
  private static readonly RUNG_METRES = 0.3;
  private static readonly RAIL_METRES = 0.05;
  /** How far below its lowest point the ground is filled. */
  private static readonly BELOW_METRES = 80;
  /** How far the ground runs on, level, past each end of the section: wider than 100 m of slope
   * on the widest screen. */
  private static readonly RUN_OUT_METRES = 300;

  private readonly ground: readonly Point[];
  private readonly surface = new Graphics();
  private readonly ladders: readonly DrawnLadder[];
  private readonly ropes: readonly DrawnRope[];
  private readonly figures: readonly { readonly id: ClimberId; readonly figure: ClimberFigure }[];
  /** The scale the lines were last drawn at, in pixels a metre: none yet. */
  private drawnAt = 0;

  constructor(
    private readonly physics: SlopePhysics,
    climbers: readonly ClimberId[],
    player: ClimberId,
  ) {
    super("slope", { x: 1, y: 1 });
    this.ground = SlopeLayer.runOut(physics.terrain);
    this.addChild(SlopeLayer.snow(this.ground), this.surface);
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
      const suit = id === player ? ClimberFigure.PLAYER_SUIT : ClimberFigure.OTHER_SUIT;
      const figure = new ClimberFigure(suit);
      this.addChild(figure);
      return { id, figure };
    });
  }

  /** How many climbers are drawn. */
  get climbers(): number {
    return this.figures.length;
  }

  /** Each frame, at the camera's `pixelsPerMetre`: the lines at that scale, the ropes where they
   * lie now, the climbers where they are. */
  draw(pixelsPerMetre: number): void {
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
      figure.show(this.physics.climber(id), size);
    }
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
      color: SlopeLayer.SURFACE,
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

  private static snow(ground: readonly Point[]): Graphics {
    const left = ground[0]?.x ?? 0;
    const right = ground.at(-1)?.x ?? 0;
    const bottom = Math.min(...ground.map(({ y }) => y)) - SlopeLayer.BELOW_METRES;
    const outline = ground.flatMap(({ x, y }) => [x, y]);
    return new Graphics().poly([left, bottom, ...outline, right, bottom]).fill(SlopeLayer.SNOW);
  }

  private static ladder({ ends, graphics }: DrawnLadder, size: LeastSize): void {
    const [start, finish] = ends;
    if (start === undefined || finish === undefined) {
      throw new RangeError("A ladder needs two ends to draw");
    }
    const acrossX = finish.x - start.x;
    const acrossY = finish.y - start.y;
    const length = Math.sqrt(acrossX * acrossX + acrossY * acrossY);
    const railX = (-acrossY / length) * SlopeLayer.LADDER_HALF_WIDTH;
    const railY = (acrossX / length) * SlopeLayer.LADDER_HALF_WIDTH;
    graphics.clear();
    graphics.moveTo(start.x + railX, start.y + railY).lineTo(finish.x + railX, finish.y + railY);
    graphics.moveTo(start.x - railX, start.y - railY).lineTo(finish.x - railX, finish.y - railY);
    for (let rung = SlopeLayer.RUNG_METRES / 2; rung < length; rung += SlopeLayer.RUNG_METRES) {
      const x = start.x + (acrossX / length) * rung;
      const y = start.y + (acrossY / length) * rung;
      graphics.moveTo(x - railX, y - railY).lineTo(x + railX, y + railY);
    }
    graphics.stroke({
      width: size.line(SlopeLayer.RAIL_METRES),
      color: SlopeLayer.LADDER,
      cap: "round",
    });
  }

  private static rope(graphics: Graphics, points: readonly Point[], size: LeastSize): void {
    graphics.clear();
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    graphics.moveTo(first.x, first.y);
    for (const { x, y } of points.slice(1)) {
      graphics.lineTo(x, y);
    }
    const width = size.line(SlopeLayer.ROPE_METRES);
    graphics.stroke({ width, color: SlopeLayer.ROPE, cap: "round", join: "round" });
    // The anchors keep their size beside the rope's, however wide it's drawn.
    const radius = SlopeLayer.ANCHOR_METRES * (width / SlopeLayer.ROPE_METRES);
    for (const anchor of [first, last]) {
      graphics.circle(anchor.x, anchor.y, radius).fill(SlopeLayer.ANCHOR);
    }
  }

  private static same(points: readonly Point[], drawn: readonly Point[]): boolean {
    return (
      points.length === drawn.length &&
      points.every((point, index) => point.x === drawn[index]?.x && point.y === drawn[index].y)
    );
  }
}
