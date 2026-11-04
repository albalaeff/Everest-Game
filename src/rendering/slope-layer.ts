import { Graphics } from "pixi.js";

import type { Point, SlopePhysics, Terrain } from "../physics";
import type { ClimberId, ObjectiveHazards } from "../simulation";
import { ClimberFigure } from "./climber-figure";
import { HazardDrawing } from "./hazard-drawing";
import { ParallaxLayer } from "./parallax-layer";

interface DrawnRope {
  readonly id: string;
  readonly graphics: Graphics;
  /** The points it was last drawn through, to skip a rope that lies still. */
  drawn: readonly Point[];
}

/**
 * The slope itself, at the camera's own depth: the ground as the physics has it, with its ladders,
 * its ropes, its hazards and every climber on it. The ground, the ladders and what stands over
 * the hazards are drawn once; a rope is redrawn when it moves, and the climbers and what comes
 * down are placed each frame.
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

  private readonly ropes: readonly DrawnRope[];
  private readonly figures: readonly { readonly id: ClimberId; readonly figure: ClimberFigure }[];
  private readonly hazards: HazardDrawing;

  constructor(
    private readonly physics: SlopePhysics,
    hazards: ObjectiveHazards,
    climbers: readonly ClimberId[],
    player: ClimberId,
  ) {
    super("slope", { x: 1, y: 1 });
    this.hazards = new HazardDrawing(hazards, physics.terrain);
    this.addChild(this.hazards.standing);
    this.addChild(SlopeLayer.ground(physics.terrain));
    for (const id of physics.ladders) {
      this.addChild(SlopeLayer.ladder(physics.ladder(id)));
    }
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
    this.addChild(this.hazards.falling);
  }

  /** How many climbers are drawn. */
  get climbers(): number {
    return this.figures.length;
  }

  /** Whether a hazard is going now, which shakes the picture. */
  get shaking(): boolean {
    return this.hazards.going;
  }

  /** Each frame, `seconds` after the last: the ropes where they lie now, the climbers where they
   * are, and what's coming down. */
  draw(seconds: number): void {
    this.hazards.draw(seconds);
    for (const rope of this.ropes) {
      const points = this.physics.rope(rope.id);
      if (!SlopeLayer.same(points, rope.drawn)) {
        rope.drawn = points;
        SlopeLayer.rope(rope.graphics, points);
      }
    }
    for (const { id, figure } of this.figures) {
      figure.show(this.physics.climber(id));
    }
  }

  private static ground(terrain: Terrain): Graphics {
    const { points } = terrain;
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      throw new RangeError("The ground has no points to draw");
    }
    const bottom = Math.min(...points.map(([, y]) => y)) - SlopeLayer.BELOW_METRES;
    const graphics = new Graphics();
    graphics.poly([first[0], bottom, ...points.flat(), last[0], bottom]).fill(SlopeLayer.SNOW);
    graphics.moveTo(first[0], first[1]);
    for (const [x, y] of points) {
      graphics.lineTo(x, y);
    }
    graphics.stroke({
      width: SlopeLayer.SURFACE_METRES,
      color: SlopeLayer.SURFACE,
      join: "round",
      cap: "round",
    });
    return graphics;
  }

  private static ladder(ends: readonly Point[]): Graphics {
    const [start, finish] = ends;
    if (start === undefined || finish === undefined) {
      throw new RangeError("A ladder needs two ends to draw");
    }
    const acrossX = finish.x - start.x;
    const acrossY = finish.y - start.y;
    const length = Math.sqrt(acrossX * acrossX + acrossY * acrossY);
    const railX = (-acrossY / length) * SlopeLayer.LADDER_HALF_WIDTH;
    const railY = (acrossX / length) * SlopeLayer.LADDER_HALF_WIDTH;
    const graphics = new Graphics();
    graphics.moveTo(start.x + railX, start.y + railY).lineTo(finish.x + railX, finish.y + railY);
    graphics.moveTo(start.x - railX, start.y - railY).lineTo(finish.x - railX, finish.y - railY);
    for (let rung = SlopeLayer.RUNG_METRES / 2; rung < length; rung += SlopeLayer.RUNG_METRES) {
      const x = start.x + (acrossX / length) * rung;
      const y = start.y + (acrossY / length) * rung;
      graphics.moveTo(x - railX, y - railY).lineTo(x + railX, y + railY);
    }
    graphics.stroke({ width: SlopeLayer.RAIL_METRES, color: SlopeLayer.LADDER, cap: "round" });
    return graphics;
  }

  private static rope(graphics: Graphics, points: readonly Point[]): void {
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
    graphics.stroke({
      width: SlopeLayer.ROPE_METRES,
      color: SlopeLayer.ROPE,
      cap: "round",
      join: "round",
    });
    for (const anchor of [first, last]) {
      graphics.circle(anchor.x, anchor.y, SlopeLayer.ANCHOR_METRES).fill(SlopeLayer.ANCHOR);
    }
  }

  private static same(points: readonly Point[], drawn: readonly Point[]): boolean {
    return (
      points.length === drawn.length &&
      points.every((point, index) => point.x === drawn[index]?.x && point.y === drawn[index].y)
    );
  }
}
