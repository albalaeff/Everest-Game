import { Container, Graphics } from "pixi.js";

import type { Joint } from "./climber-pose";
import { Palette } from "./palette";

/**
 * A climber in their kit seen from the front (#235), standing, as they are once they've turned
 * to face the viewer: the same kit `SuitRig` draws side-on. The down suit with its baffles and
 * dark yoke, the dark shins, the boots with their rands and the crampons' points under them, the
 * mitts at the sides, the pack's shoulders behind and its straps across the chest, the axe's head
 * over a shoulder, the harness's belt and leg loops, the hood, the goggles with the sky in them,
 * the mask on the face or hanging on the chest, and the headlamp on the forehead. Each limb is
 * lit from one side and shaded on the other. Drawn once, in the figure's metres from the ground
 * between its boots, y up; each frame only the chest swells with the breath, the mask goes on or
 * off, the lens takes the sky's colour and the cowstails are drawn to their carabiners.
 */
export class FrontRig extends Container {
  /** Where the lamp shines from and where the breath comes out, in the figure's metres. */
  static readonly LAMP: Joint = { x: 0, y: 1.708 };
  static readonly MOUTH: Joint = { x: 0, y: 1.555 };
  /** Where the cowstails tie in at the harness, how far below it one off the rope hangs and how
   * far to its side, and the carabiner's ring. */
  private static readonly TIE: Joint = { x: 0, y: 0.94 };
  private static readonly HANGING = { down: 0.3, aside: 0.16 };
  private static readonly CARABINER = 0.03;
  /** How dark a limb's shaded side is, how much of its width that side takes, and how bright the
   * edge towards the light. */
  private static readonly SHADE = { dark: 0.3, share: 0.34, light: 0.16 };
  /** The seams between the down's baffles: how wide and how dark, and how far up the torso and
   * down each thigh they are. */
  private static readonly SEAM = { width: 0.012, alpha: 0.42 };
  private static readonly TORSO_SEAMS = [1.03, 1.115, 1.2, 1.285];
  private static readonly THIGH_SEAMS = [0.6, 0.71, 0.82];
  private static readonly SKIN = 0xd6a07a;

  private readonly back = new Graphics();
  private readonly legs = new Graphics();
  private readonly torso = new Container();
  private readonly chest = new Graphics();
  private readonly hangingMask = new Graphics();
  private readonly head = new Graphics();
  private readonly faceMask = new Graphics();
  private readonly lens = new Graphics();
  private readonly lines = new Graphics();

  /** In a suit of `suit`'s colour, with a pack `pack` times a client's: a Sherpa's is bigger. */
  constructor(suit: number, pack = 1) {
    super();
    this.drawBack(pack);
    this.drawLegs(suit);
    this.drawChest(suit);
    this.drawHead(suit);
    this.torso.addChild(this.chest, this.hangingMask);
    this.addChild(
      this.back,
      this.legs,
      this.torso,
      this.lines,
      this.head,
      this.faceMask,
      this.lens,
    );
  }

  /** The figure this frame: the chest `swell` wider with the breath, the mask on the face while
   * the oxygen flows or hanging on the chest, the goggles' lens the sky's colour. */
  place(swell: number, masked: boolean, sky: number): void {
    this.torso.scale.x = 1 + swell;
    this.faceMask.visible = masked;
    this.hangingMask.visible = !masked;
    this.lens.tint = sky;
  }

  /** The cowstails, `width` wide: from the harness to each carabiner on its rope, in the figure's
   * metres, the jumar's and the second's, or hanging by a thigh where one's off. */
  hold(jumar: Joint | null, carabiner: Joint | null, width: number): void {
    const { lines } = this;
    const { TIE, HANGING, CARABINER } = FrontRig;
    lines.clear();
    for (const [to, side] of [
      [jumar, -1],
      [carabiner, 1],
    ] as const) {
      const end = to ?? { x: TIE.x + side * HANGING.aside, y: TIE.y - HANGING.down };
      const sag = to === null ? 0.06 : 0.1;
      lines
        .moveTo(TIE.x, TIE.y)
        .quadraticCurveTo((TIE.x + end.x) / 2, Math.min(TIE.y, end.y) - sag, end.x, end.y)
        .stroke({ width, color: Palette.SLING, cap: "round" });
      lines.circle(end.x, end.y, CARABINER).stroke({ width: width * 0.9, color: Palette.JUMAR });
    }
  }

  /** The pack's shoulders behind the body, bigger for a Sherpa's load, and the axe strapped to it,
   * its head over a shoulder. */
  private drawBack(pack: number): void {
    const { back } = this;
    const half = 0.3 * (0.9 + 0.1 * pack);
    const top = 1.5 + 0.12 * pack;
    back.roundRect(-half, 0.98, 2 * half, top - 0.98, 0.07).fill(Palette.PACK);
    back.roundRect(-half + 0.02, top - 0.11, 2 * half - 0.04, 0.11, 0.05).fill(Palette.PACK_LID);
    // The axe, head up beside the lid: its shaft down the pack's side, its pick and adze across.
    const shaft = half - 0.035;
    back
      .moveTo(shaft, 1.02)
      .lineTo(shaft, top + 0.06)
      .stroke({ width: 0.03, color: Palette.TOOL_EDGE, cap: "round" });
    back
      .moveTo(shaft, 1.02)
      .lineTo(shaft, top + 0.06)
      .stroke({ width: 0.016, color: Palette.AXE_SHAFT, cap: "round" });
    back
      .poly([shaft - 0.11, top + 0.02, shaft + 0.07, top + 0.075, shaft + 0.07, top + 0.045])
      .fill(Palette.TOOL_STEEL)
      .stroke({ width: 0.008, color: Palette.TOOL_EDGE });
  }

  /** The legs a little apart, thick in their down: the thighs with their baffles, the shins with
   * their dark panel down the front, the harness's leg loops, the double boots with their
   * gaiters' collars and dark rands, toes out, and the crampons' points under them. */
  private drawLegs(suit: number): void {
    const { legs } = this;
    for (const side of [-1, 1] as const) {
      const hip = side * 0.11;
      const knee = side * 0.13;
      const ankle = side * 0.14;
      const thigh = [hip - 0.105, 0.98, hip + 0.105, 0.98, knee + 0.092, 0.52, knee - 0.092, 0.52];
      legs.poly(thigh).fill(suit);
      this.shade(legs, thigh);
      for (const seam of FrontRig.THIGH_SEAMS) {
        const [left, right] = FrontRig.edges(thigh, seam);
        legs
          .moveTo(left, seam)
          .lineTo(right, seam)
          .stroke({ width: FrontRig.SEAM.width, color: Palette.SEAM, alpha: FrontRig.SEAM.alpha });
      }
      // The harness's leg loop round the top of the thigh.
      legs
        .moveTo(hip - 0.108, 0.87)
        .lineTo(hip + 0.108, 0.85)
        .stroke({ width: 0.032, color: Palette.HARNESS });
      const shin = [knee - 0.092, 0.53, knee + 0.092, 0.53, ankle + 0.082, 0.2, ankle - 0.082, 0.2];
      legs.poly(shin).fill(suit);
      this.shade(legs, shin);
      // The dark panel down the front of the shin, and the knee's seam over it.
      legs
        .poly([knee - 0.05, 0.5, knee + 0.05, 0.5, ankle + 0.046, 0.21, ankle - 0.046, 0.21])
        .fill(Palette.PANEL);
      // The boot from the front: its gaiter's collar, its shell, its dark rand, and the
      // crampon's points under it.
      legs.roundRect(ankle - 0.1, 0.035, 0.2, 0.19, 0.06).fill(Palette.BOOTS);
      legs
        .roundRect(ankle - 0.1, 0.035, 0.07, 0.19, 0.05)
        .fill({ color: 0x000000, alpha: FrontRig.SHADE.dark });
      legs.roundRect(ankle - 0.09, 0.19, 0.18, 0.04, 0.015).fill(Palette.RAND);
      legs.roundRect(ankle - 0.105, 0.02, 0.21, 0.055, 0.02).fill(Palette.RAND);
      for (const point of [-0.075, -0.03, 0.03, 0.075]) {
        legs
          .poly([ankle + point - 0.014, 0.024, ankle + point + 0.014, 0.024, ankle + point, -0.022])
          .fill(Palette.STEEL);
      }
    }
  }

  /** The body and the arms at its sides, thick in their down: the baffles, the dark yoke across
   * the shoulders, the pack's straps and the chest strap, the harness's belt with its tie-in
   * loop, the mitts, and the mask hanging on the chest while it's off the face. */
  private drawChest(suit: number): void {
    const { chest } = this;
    for (const side of [-1, 1] as const) {
      const shoulder = side * 0.295;
      const hand = side * 0.36;
      const arm = [
        shoulder - 0.085,
        1.45,
        shoulder + 0.085,
        1.45,
        hand + 0.07,
        0.95,
        hand - 0.07,
        0.95,
      ];
      chest.poly(arm).fill(suit);
      this.shade(chest, arm);
      for (const seam of [1.3, 1.15]) {
        const [left, right] = FrontRig.edges(arm, seam);
        chest
          .moveTo(left, seam)
          .lineTo(right, seam)
          .stroke({ width: FrontRig.SEAM.width, color: Palette.SEAM, alpha: FrontRig.SEAM.alpha });
      }
      chest.roundRect(hand - 0.085, 0.78, 0.17, 0.2, 0.07).fill(Palette.MITTS);
    }
    const body = [-0.225, 0.95, 0.225, 0.95, 0.275, 1.38, 0.235, 1.48, -0.235, 1.48, -0.275, 1.38];
    chest.poly(body).fill(suit);
    this.shade(chest, body);
    for (const seam of FrontRig.TORSO_SEAMS) {
      const [left, right] = FrontRig.edges(body, seam);
      chest
        .moveTo(left, seam)
        .lineTo(right, seam)
        .stroke({ width: FrontRig.SEAM.width, color: Palette.SEAM, alpha: FrontRig.SEAM.alpha });
    }
    // The dark yoke over the shoulders, down to the top of the chest.
    chest
      .poly([-0.268, 1.345, 0.268, 1.345, 0.275, 1.38, 0.235, 1.48, -0.235, 1.48, -0.275, 1.38])
      .fill(Palette.PANEL);
    for (const side of [-1, 1] as const) {
      chest
        .moveTo(side * 0.15, 1.48)
        .lineTo(side * 0.17, 1.02)
        .stroke({ width: 0.045, color: Palette.STRAP });
    }
    chest.moveTo(-0.16, 1.27).lineTo(0.16, 1.27).stroke({ width: 0.024, color: Palette.STRAP });
    chest.rect(-0.235, 0.95, 0.47, 0.055).fill(Palette.HARNESS);
    chest.roundRect(-0.028, 0.895, 0.056, 0.085, 0.02).fill(Palette.SLING);
    this.hangingMask.roundRect(-0.075, 1.3, 0.15, 0.105, 0.04).fill(Palette.MASK);
    this.hangingMask.circle(0, 1.34, 0.032).fill(Palette.VALVE);
  }

  /** The hood round the face, the goggles' frame and their lens, drawn white for the sky's tint,
   * the headlamp on its strap over them, and under them the face, or the mask with its valve. */
  private drawHead(suit: number): void {
    const { head, faceMask, lens } = this;
    head.roundRect(-0.085, 1.44, 0.17, 0.1, 0.035).fill(Palette.PANEL);
    head.ellipse(0, 1.63, 0.165, 0.175).fill(suit);
    // The hood's side away from the light: a crescent of it.
    head
      .ellipse(-0.07, 1.63, 0.095, 0.175)
      .fill({ color: 0x000000, alpha: FrontRig.SHADE.dark / 2 });
    head.ellipse(0, 1.615, 0.122, 0.135).fill(Palette.HOOD_SHADOW);
    head.ellipse(0, 1.58, 0.09, 0.075).fill(FrontRig.SKIN);
    head.ellipse(0, 1.58, 0.09, 0.075).fill({ color: 0x000000, alpha: 0.18 });
    // The headlamp's strap round the hood, its case and its lamp.
    head.rect(-0.158, 1.695, 0.316, 0.028).fill(Palette.STRAP);
    head.roundRect(-0.046, 1.68, 0.092, 0.056, 0.015).fill(Palette.LAMP_CASE);
    head.circle(FrontRig.LAMP.x, FrontRig.LAMP.y, 0.021).fill(Palette.LAMP);
    head.roundRect(-0.118, 1.598, 0.236, 0.08, 0.032).fill(Palette.GOGGLES);
    lens.roundRect(-0.102, 1.611, 0.204, 0.054, 0.024).fill(0xffffff);
    lens.roundRect(-0.085, 1.65, 0.08, 0.008, 0.004).fill({ color: 0xffffff, alpha: 0.9 });
    faceMask.roundRect(-0.082, 1.495, 0.164, 0.11, 0.048).fill(Palette.MASK);
    faceMask.circle(FrontRig.MOUTH.x, FrontRig.MOUTH.y - 0.01, 0.034).fill(Palette.VALVE);
    faceMask.circle(FrontRig.MOUTH.x, FrontRig.MOUTH.y - 0.01, 0.017).fill(Palette.MASK);
  }

  /** A limb's shade and its light, over its outline: the strip of it away from the light darker,
   * and its edge towards the light a little brighter. The light comes from the viewer's right,
   * for every part alike. The outline's edges are read at its foot and at its top, so it runs
   * straight between them: a limb's four corners, or the body's six. */
  private shade(on: Graphics, outline: readonly number[]): void {
    const { dark, share, light } = FrontRig.SHADE;
    const ys = outline.filter((_, index) => index % 2 === 1);
    const [low, high] = [Math.min(...ys) + 1e-4, Math.max(...ys) - 1e-4];
    const at = (y: number, across: number): number => {
      const [left, right] = FrontRig.edges(outline, y);
      return left + (right - left) * across;
    };
    const strip = (from: number, to: number): number[] => [
      at(low, from),
      low,
      at(low, to),
      low,
      at(high, to),
      high,
      at(high, from),
      high,
    ];
    on.poly(strip(0, share)).fill({ color: 0x000000, alpha: dark });
    on.poly(strip(1 - share * 0.4, 1)).fill({ color: 0xffffff, alpha: light });
  }

  /** An outline's left and right edges at height `y`. */
  private static edges(outline: readonly number[], y: number): readonly [number, number] {
    const points = outline.length / 2;
    let left = Infinity;
    let right = -Infinity;
    for (let index = 0; index < points; index += 1) {
      const next = (index + 1) % points;
      const x1 = outline[2 * index] ?? 0;
      const y1 = outline[2 * index + 1] ?? 0;
      const x2 = outline[2 * next] ?? 0;
      const y2 = outline[2 * next + 1] ?? 0;
      if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) {
        const x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    return [left, right];
  }
}
