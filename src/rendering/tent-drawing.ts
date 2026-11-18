import { Container, FillGradient, Graphics } from "pixi.js";

import type { Point, Terrain } from "../physics";
import type { Atmosphere } from "./atmosphere";
import { CampSigns } from "./camp-signs";
import type {
  CampProp,
  CampStretch,
  DomeShape,
  FarTent,
  Guy,
  Swayed,
  TentShape,
  TentSizes,
} from "./camp-signs";
import type { LeastSize } from "./least-size";
import { Palette } from "./palette";

/** A tent somebody is going into, coming out of or sitting in: how far its door is open, 0 to 1;
 * whether they're inside it, its lamp lit; and whether they're on their way through its door,
 * when the tent is drawn again over them so they go in behind its fly. */
export interface TentUse {
  readonly tent: TentShape;
  readonly open: number;
  readonly inside: boolean;
  readonly passing: boolean;
}

/** How far across the slope something reaches. */
interface Across {
  readonly left: number;
  readonly right: number;
}

/**
 * The camps' tents as the slope shows them (#258), `CampSigns`' shapes painted: behind the
 * climbers, the rows of other expeditions' tents, small and dimmed by the distance, Base Camp's
 * big dome, and the camp's own domes, each with its panels and poles' sleeves, its grey vestibule
 * and zipped door, its vent, valance and guy lines, tied to rocks on the rubble and staked on the
 * snow, and what lies beside it; and over the climbers, a tent somebody is on their way into or
 * out of, drawn again without its door's opening, so they go in behind its fly and show in its
 * door. By night the tents are dark but for the light through the fly of those lit from inside,
 * the camp's own and some of the others'; a tent somebody is in is lit at any hour, their shadow
 * on its wall. The fly sways on the gust, most at its top. It draws only what changed: the wind,
 * the scale, a door.
 */
export class TentDrawing {
  /** How wide the fly's edge, its seams, its zips and the guy lines are drawn, in metres. */
  private static readonly EDGE = 0.035;
  private static readonly SEAM = 0.022;
  private static readonly ZIP = 0.016;
  private static readonly GUY = 0.012;
  /** How far the full gust pushes a tent's top across, and how often it comes and goes. */
  private static readonly RIPPLE_METRES = 0.07;
  private static readonly RIPPLE_HZ = 0.5;
  /** How dark and how blue a tent with no light in it is at night. */
  private static readonly NIGHT = 0x333c70;
  /** How far the others' tents fade into the air, by day. */
  private static readonly FAR_HAZE = 0.42;
  /** The light of a tent lit from inside: how strong through its fly at night and with somebody
   * in it, how far round it the glow reaches, in the tent's heights, and how strong it is. */
  private static readonly LIT = { night: 0.92, within: 0.62, reach: 1.9, glow: 0.34 };
  /** A dweller's shadow on the lit wall: how dark. */
  private static readonly SHADOW = 0.3;

  /** What's drawn behind the climbers, and what's drawn over them. */
  readonly behind = new Container();
  readonly over = new Container();
  /** How many tents a climber can go into. */
  readonly count: number;

  private readonly shapes: readonly TentShape[];
  private readonly dome: DomeShape | null;
  private readonly far: readonly FarTent[];
  private readonly farGraphics = new Graphics();
  private readonly farLit = new Graphics();
  private readonly glow = new Graphics();
  private readonly near = new Graphics();
  private readonly lit = new Graphics();
  private readonly within = new Graphics();
  /** A tent somebody goes through the door of, again over them: its fly, and its light. */
  private readonly overNear = new Graphics();
  private readonly overLit = new Graphics();
  private readonly spans: readonly Across[];
  /** The scale, the gust and the doors the tents were last drawn at. */
  private drawnAt = 0;
  private gust = 0;
  private doors = "";
  private overDrawn = false;
  private night: number | null = null;

  constructor(
    terrain: Terrain,
    camps: readonly CampStretch[],
    sizes: TentSizes,
    rubbleTo: number,
    seed: number,
  ) {
    const signs = new CampSigns(terrain, sizes, rubbleTo, seed);
    this.shapes = camps.flatMap((camp) => signs.tents(camp));
    this.count = this.shapes.length;
    this.dome = camps.map((camp) => signs.dome(camp)).find((dome) => dome !== null) ?? null;
    this.far = camps.flatMap((camp) => signs.far(camp));
    this.behind.addChild(
      this.glow,
      this.farGraphics,
      this.farLit,
      this.near,
      this.lit,
      this.within,
    );
    this.over.addChild(this.overNear, this.overLit);
    const outlines = [
      ...this.shapes.map(({ outline, guys }) => [...outline, ...guys.map(({ peg }) => peg)]),
      ...this.far.map(({ outline }) => outline),
      ...(this.dome === null ? [] : [this.dome.outline]),
    ];
    this.spans = outlines.map((points) => {
      const xs = points.map(({ x }) => x);
      return { left: Math.min(...xs), right: Math.max(...xs) };
    });
    this.drawFar();
    this.drawGlow();
  }

  /** The camp's tents: the one a climber at `x` goes into is the nearest of these. */
  get tents(): readonly TentShape[] {
    return this.shapes;
  }

  /** How far across the slope each tent reaches: what's in view, the layer asks. */
  get reach(): readonly Across[] {
    return this.spans;
  }

  /** Each frame, in its air, at the camera's scale, with the tents in `use`: draws again what
   * changed, the fly on the gust, a door, the scale; `inView`, or nothing but the light. */
  draw(atmosphere: Atmosphere, size: LeastSize, use: readonly TentUse[], inView: boolean): void {
    this.light(atmosphere);
    const { gust, elapsed } = atmosphere;
    const doors = use
      .map(({ tent, open, inside }) => `${tent.camp}${tent.index}:${open.toFixed(3)}${inside}`)
      .join();
    const blown = gust > 0 || this.gust > 0;
    const due = this.drawnAt !== size.pixelsPerMetre || blown || doors !== this.doors;
    if (!inView || !due) {
      return;
    }
    this.drawnAt = size.pixelsPerMetre;
    this.gust = gust;
    this.doors = doors;
    const push = (index: number): number => {
      const wave = Math.sin(2 * Math.PI * (TentDrawing.RIPPLE_HZ * elapsed + 0.37 * index));
      return gust * TentDrawing.RIPPLE_METRES * (0.55 + 0.45 * wave);
    };
    const { near, lit, within, overNear, overLit } = this;
    near.clear();
    lit.clear();
    within.clear();
    if (this.dome !== null) {
      const blownBy = push(7) * 1.6;
      this.drawDome(near, this.dome, blownBy, size);
      TentDrawing.drawLit(lit, this.dome, this.dome.outline, this.dome.seams, blownBy, size);
    }
    for (const [index, tent] of this.shapes.entries()) {
      const used = use.find((one) => one.tent === tent);
      const blownBy = push(index);
      this.drawTent(near, tent, blownBy, size, used?.open ?? 0, true);
      TentDrawing.drawLit(lit, tent, tent.lit, tent.poles, blownBy, size);
      if (used?.inside === true) {
        this.drawWithin(within, tent, blownBy);
      }
    }
    const passing = use.filter(({ passing: through }) => through);
    if (passing.length > 0 || this.overDrawn) {
      overNear.clear();
      overLit.clear();
      this.overDrawn = passing.length > 0;
      for (const { tent, open } of passing) {
        const blownBy = push(this.shapes.indexOf(tent));
        this.drawTent(overNear, tent, blownBy, size, open, false);
        TentDrawing.drawLit(overLit, tent, tent.lit, tent.poles, blownBy, size);
      }
    }
  }

  /** The hour's light on the tents: dark and blue at night but for those lit from inside. */
  private light(atmosphere: Atmosphere): void {
    const night = Math.round(atmosphere.light.lamps * 50) / 50;
    if (night === this.night) {
      return;
    }
    this.night = night;
    const dark = Palette.mix(0xffffff, TentDrawing.NIGHT, night);
    this.near.tint = dark;
    this.overNear.tint = dark;
    this.overLit.alpha = night * TentDrawing.LIT.night;
    this.overLit.visible = night > 0.01;
    this.farGraphics.tint = Palette.mix(
      atmosphere.palette.faded(0xffffff, TentDrawing.FAR_HAZE),
      Palette.mix(TentDrawing.NIGHT, 0x000000, 0.25),
      night,
    );
    this.lit.alpha = night * TentDrawing.LIT.night;
    this.lit.visible = night > 0.01;
    this.farLit.alpha = night * TentDrawing.LIT.night * 0.8;
    this.farLit.visible = night > 0.01;
    this.glow.alpha = night;
    this.glow.visible = night > 0.01;
  }

  /** A camp's own tent: `whole`, with the dark inside its open door, as it stands behind the
   * climbers; or over them, with the opening left out. Its door is `open` so far. */
  private drawTent(
    graphics: Graphics,
    tent: TentShape,
    push: number,
    size: LeastSize,
    open: number,
    whole: boolean,
  ): void {
    const sway = (points: readonly Point[]): readonly Point[] =>
      TentDrawing.sway(points, tent, push);
    const edge = size.line(TentDrawing.EDGE);
    const seam = size.line(TentDrawing.SEAM);
    if (whole) {
      for (const guy of tent.guys) {
        this.drawGuy(graphics, guy, tent, push, size, tent.rubble);
      }
      for (const prop of tent.props) {
        TentDrawing.drawProp(graphics, prop, size);
      }
      // The inside of the door, for whoever goes in to show against.
      TentDrawing.fill(graphics, sway(tent.opening), Palette.TENT_INSIDE);
    }
    TentDrawing.fill(graphics, sway(tent.room), Palette.TENT);
    TentDrawing.fill(graphics, sway(tent.shade), Palette.TENT_SHADE, 0.55);
    TentDrawing.fill(graphics, sway(tent.sheen), Palette.TENT_SHEEN, 0.5);
    TentDrawing.fill(graphics, sway(tent.tail), Palette.TENT_PORCH);
    TentDrawing.fill(graphics, sway(tent.around), Palette.TENT_PORCH);
    // The flap: down over the door, and rolled up out of the way as it opens.
    if (open < 1) {
      TentDrawing.fill(graphics, sway(tent.opening), Palette.TENT_PORCH_SHADE, 1 - open);
    }
    for (const pole of tent.poles) {
      TentDrawing.line(graphics, sway(pole), seam, Palette.TENT_SEAM, 0.75);
    }
    TentDrawing.line(graphics, sway(tent.zip), size.line(TentDrawing.ZIP), Palette.TENT_ZIP, 0.9);
    TentDrawing.fill(graphics, sway(tent.vent), Palette.TENT_PORCH_SHADE);
    TentDrawing.fill(graphics, tent.valance, Palette.TENT_VALANCE);
    TentDrawing.line(graphics, sway(tent.outline), edge, Palette.TENT_SEAM, 1);
    // The reflecting tabs at the poles' feet.
    for (const pole of tent.poles) {
      const [foot] = pole;
      if (foot !== undefined) {
        graphics.circle(foot.x, foot.y + 0.05, size.line(0.03)).fill(Palette.TENT_ZIP);
      }
    }
    if (open > 0) {
      const top = sway(tent.zip)[Math.floor(tent.zip.length / 2)];
      if (top !== undefined) {
        graphics
          .roundRect(top.x - 0.16, top.y - 0.02, 0.32, 0.09 * open, 0.03)
          .fill(Palette.TENT_PORCH_SHADE);
      }
    }
  }

  /** The light through a tent's fly at night: its room warm from the lamp inside, brightest
   * round it, the poles' sleeves dark across it. The grey vestibule lets none through. */
  private static drawLit(
    graphics: Graphics,
    shape: Swayed & { readonly lamp: Point },
    room: readonly Point[],
    seams: readonly (readonly Point[])[],
    push: number,
    size: LeastSize,
  ): void {
    const sway = (points: readonly Point[]): readonly Point[] =>
      TentDrawing.sway(points, shape, push);
    TentDrawing.fill(graphics, sway(room), Palette.TENT_LIT);
    graphics
      .ellipse(shape.lamp.x, shape.lamp.y, shape.tall * 0.42, shape.tall * 0.3)
      .fill({ color: Palette.LAMP, alpha: 0.5 });
    for (const seam of seams) {
      TentDrawing.line(graphics, sway(seam), size.line(TentDrawing.SEAM), Palette.TENT_SEAM, 0.65);
    }
    TentDrawing.line(graphics, sway(room), size.line(TentDrawing.SEAM), Palette.TENT_SEAM, 0.5);
  }

  /** Somebody in a tent: its lamp lit at any hour, the light through its fly, and their shadow
   * on its wall, sitting up. */
  private drawWithin(graphics: Graphics, tent: TentShape, push: number): void {
    const { within } = TentDrawing.LIT;
    TentDrawing.fill(graphics, TentDrawing.sway(tent.lit, tent, push), Palette.TENT_LIT, within);
    const { x, y } = tent.lamp;
    const seat = tent.base + 0.09;
    const way = tent.lies;
    // Sitting up, facing the door: the knees drawn up, the back, the shoulders and the head.
    const at = (along: number, up: number): number[] => [x + way * along, seat + up];
    graphics
      .poly(
        [
          at(-0.46, 0),
          at(-0.44, 0.2),
          at(-0.3, 0.36),
          at(-0.12, 0.2),
          at(0, 0.36),
          at(0.04, 0.6),
          at(0.2, 0.66),
          at(0.32, 0.56),
          at(0.36, 0.3),
          at(0.4, 0),
        ].flat(),
      )
      .circle(x + way * 0.17, seat + 0.78, 0.115)
      .fill({ color: Palette.TENT_INSIDE, alpha: TentDrawing.SHADOW });
    graphics.circle(x - way * 0.2, y + 0.3, 0.06).fill({ color: Palette.LAMP, alpha: 0.9 });
  }

  private drawDome(graphics: Graphics, dome: DomeShape, push: number, size: LeastSize): void {
    const sway = (points: readonly Point[]): readonly Point[] =>
      TentDrawing.sway(points, dome, push);
    for (const guy of dome.guys) {
      this.drawGuy(graphics, guy, dome, push, size, true);
    }
    TentDrawing.fill(graphics, sway(dome.chimney), Palette.TENT_PORCH_SHADE);
    TentDrawing.fill(graphics, sway(dome.outline), Palette.TENT);
    const lower = dome.outline.filter(({ y }) => y - dome.base < dome.tall * 0.34);
    TentDrawing.fill(graphics, sway(lower), Palette.TENT_SHADE, 0.5);
    for (const seam of dome.seams) {
      TentDrawing.line(graphics, sway(seam), size.line(TentDrawing.SEAM), Palette.TENT_SEAM, 0.7);
    }
    TentDrawing.fill(graphics, sway(dome.door), Palette.TENT_PORCH);
    TentDrawing.line(graphics, sway(dome.zip), size.line(TentDrawing.ZIP), Palette.TENT_ZIP, 0.9);
    for (const { at, radius } of dome.windows) {
      const [centre] = sway([at]);
      if (centre !== undefined) {
        graphics
          .circle(centre.x, centre.y, radius)
          .fill(Palette.TENT_PORCH_SHADE)
          .stroke({ width: size.line(TentDrawing.SEAM), color: Palette.TENT_ZIP, alpha: 0.8 });
      }
    }
    TentDrawing.fill(graphics, dome.valance, Palette.TENT_VALANCE);
    TentDrawing.line(
      graphics,
      sway(dome.outline),
      size.line(TentDrawing.EDGE),
      Palette.TENT_SEAM,
      1,
    );
  }

  /** A guy line to its peg: a rock on the rubble, a stake in the snow. */
  private drawGuy(
    graphics: Graphics,
    { from, peg }: Guy,
    shape: Swayed,
    push: number,
    size: LeastSize,
    rubble: boolean,
  ): void {
    const top = CampSigns.swayed(from, shape, push);
    graphics
      .moveTo(top.x, top.y)
      .lineTo(peg.x, peg.y + 0.04)
      .stroke({ width: size.line(TentDrawing.GUY), color: Palette.GUY_LINE, alpha: 0.85 });
    if (rubble) {
      graphics
        .poly([
          peg.x - 0.17,
          peg.y,
          peg.x - 0.1,
          peg.y + 0.13,
          peg.x + 0.07,
          peg.y + 0.16,
          peg.x + 0.18,
          peg.y,
        ])
        .fill(Palette.ROCK);
    } else {
      const lean = Math.sign(peg.x - top.x) || 1;
      graphics
        .moveTo(peg.x + lean * 0.05, peg.y - 0.02)
        .lineTo(peg.x - lean * 0.07, peg.y + 0.2)
        .stroke({ width: size.line(0.025), color: Palette.PICKET, cap: "round" });
    }
  }

  /** What lies by a tent. */
  private static drawProp(graphics: Graphics, { kind, at, way }: CampProp, size: LeastSize): void {
    const { x, y } = at;
    if (kind === "axe") {
      const top = y + 0.72;
      graphics
        .moveTo(x, y - 0.02)
        .lineTo(x + way * 0.03, top)
        .stroke({ width: size.line(0.028), color: Palette.AXE_SHAFT, cap: "round" });
      graphics
        .moveTo(x - way * 0.16, top - 0.03)
        .lineTo(x + way * 0.03, top)
        .lineTo(x + way * 0.13, top + 0.02)
        .stroke({ width: size.line(0.03), color: Palette.TOOL_STEEL, cap: "round", join: "round" });
    } else if (kind === "barrel") {
      graphics.roundRect(x - 0.21, y, 0.42, 0.62, 0.06).fill(Palette.BARREL);
      graphics
        .rect(x - 0.21, y + 0.16, 0.42, 0.04)
        .rect(x - 0.21, y + 0.42, 0.42, 0.04)
        .fill(Palette.BARREL_BAND);
      graphics.roundRect(x - 0.19, y + 0.6, 0.38, 0.06, 0.02).fill(Palette.TENT_VALANCE);
    } else if (kind === "duffel") {
      graphics.roundRect(x - 0.38, y, 0.76, 0.34, 0.13).fill(Palette.DUFFEL);
      graphics
        .rect(x - 0.2, y, 0.05, 0.34)
        .rect(x + 0.15, y, 0.05, 0.34)
        .fill(Palette.TENT_VALANCE);
    } else if (kind === "bottles") {
      for (const [index, lift] of [0, 0.15].entries()) {
        const from = x - 0.3 + index * 0.06;
        graphics.roundRect(from, y + lift, 0.52, 0.14, 0.07).fill(Palette.BOTTLE);
        graphics.rect(from + 0.52, y + lift + 0.04, 0.07, 0.06).fill(Palette.REGULATOR);
      }
    } else {
      graphics
        .moveTo(x, y)
        .lineTo(x + way * 0.05, y + 1.15)
        .stroke({ width: size.line(0.022), color: Palette.WAND, cap: "round" });
      graphics
        .poly([x + way * 0.05, y + 1.15, x + way * 0.33, y + 1.06, x + way * 0.045, y + 0.96])
        .fill(Palette.WAND_FLAG);
    }
  }

  /** The others' tents, drawn once: each in its colour with its vestibule and a pole, and, for
   * the ones lit at night, the light through its fly. */
  private drawFar(): void {
    for (const tent of this.far) {
      const colour = Palette.FAR_TENTS[tent.tone] ?? Palette.TENT;
      TentDrawing.fill(this.farGraphics, tent.outline, colour);
      TentDrawing.fill(this.farGraphics, tent.vestibule, Palette.TENT_PORCH, 0.85);
      TentDrawing.line(this.farGraphics, tent.pole, 0.02, Palette.TENT_SEAM, 0.5);
      TentDrawing.line(this.farGraphics, tent.outline, 0.025, Palette.TENT_SEAM, 0.7);
      if (tent.lit) {
        TentDrawing.fill(this.farLit, tent.outline, Palette.mix(colour, Palette.TENT_LIT, 0.6));
      }
    }
  }

  /** The glow round each tent lit from inside at night, drawn once. */
  private drawGlow(): void {
    const { reach, glow } = TentDrawing.LIT;
    const lamps = [
      ...this.shapes.map(({ lamp, tall }) => ({ lamp, radius: tall * reach })),
      ...this.far.filter(({ lit }) => lit).map(({ lamp }) => ({ lamp, radius: reach * 0.6 })),
      ...(this.dome === null
        ? []
        : [{ lamp: this.dome.lamp, radius: this.dome.tall * reach * 0.8 }]),
    ];
    for (const { lamp, radius } of lamps) {
      this.glow.circle(lamp.x, lamp.y, radius).fill(
        new FillGradient({
          type: "radial",
          center: { x: 0.5, y: 0.5 },
          innerRadius: 0,
          outerCenter: { x: 0.5, y: 0.5 },
          outerRadius: 0.5,
          colorStops: [
            { offset: 0, color: Palette.css(Palette.TENT_LIT, glow) },
            { offset: 0.45, color: Palette.css(Palette.TENT_LIT, glow * 0.35) },
            { offset: 1, color: Palette.css(Palette.TENT_LIT, 0) },
          ],
        }),
      );
    }
  }

  private static sway(points: readonly Point[], shape: Swayed, push: number): readonly Point[] {
    return push === 0 ? points : points.map((point) => CampSigns.swayed(point, shape, push));
  }

  private static fill(
    graphics: Graphics,
    points: readonly Point[],
    colour: number,
    alpha = 1,
  ): void {
    if (points.length >= 3) {
      graphics.poly(points.flatMap(({ x, y }) => [x, y])).fill({ color: colour, alpha });
    }
  }

  private static line(
    graphics: Graphics,
    points: readonly Point[],
    width: number,
    colour: number,
    alpha: number,
  ): void {
    for (const [index, { x, y }] of points.entries()) {
      if (index === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }
    graphics.stroke({ width, color: colour, alpha, cap: "round", join: "round" });
  }
}
