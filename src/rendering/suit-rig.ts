import { Container, FillGradient, Graphics } from "pixi.js";

import { ClimberPose } from "./climber-pose";
import type { Ground, Joint, Pose } from "./climber-pose";
import { FigureRig } from "./figure-rig";
import type { RigParts } from "./figure-rig";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";
import { Palette } from "./palette";

/** How a colour is shaded over a part, in the part's own bounds: across a limb, from its dark side
 * to its lit one; from the back of a body to its front; from below and behind a head to above it
 * and ahead. */
type Shade = "across" | "front" | "above";

/** The suit's parts, and two it moves besides: the goggles' lens, tinted the sky's colour, and the
 * jumar, on the rope in the near hand. */
interface SuitParts extends RigParts {
  readonly lens: Graphics;
  readonly jumar: Graphics;
}

/**
 * A climber in their kit (#168), as #125's scene draws one: a down suit with its baffles, its dark
 * yoke and shins and its hood with a brim; the boots with their gaiters and rands, and the
 * crampons' points and front points under them; the mitts; the pack with its lid, the oxygen's
 * bottle and regulator in it and the ice axe strapped to it; the harness, its belt and its slings;
 * the mask with its valve and hose, the goggles with the sky in them, and the headlamp. Each part
 * is shaded from where the light comes from and drawn once, the far limbs darker and as cold as
 * the sky; what runs between the parts, the hose, the slings and the rope through the jumar, is
 * drawn each frame.
 */
export class SuitRig extends FigureRig<SuitParts> {
  /** Where the lamp shines from, and where the mask's valve breathes out, in the head's frame. */
  static readonly LAMP: Joint = { x: 0.11, y: 0.111 };
  static readonly VALVE: Joint = { x: 0.158, y: -0.075 };
  /** How dark a colour's shaded side is, and how bright its lit side, as shares of it. */
  private static readonly TONES = { dark: 0.55, light: 1.32 };
  private static readonly SHADES: Readonly<Record<Shade, { start: Joint; end: Joint }>> = {
    across: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
    front: { start: { x: 0, y: 0.35 }, end: { x: 1, y: 0.65 } },
    above: { start: { x: 0.15, y: 0.1 }, end: { x: 0.85, y: 0.95 } },
  };
  /** How far the far limbs are shaded, and how much of the sky's cold light they take. */
  private static readonly FAR_SHADE = 0.25;
  private static readonly FAR_COLD = 0.22;
  /** The seams between the down's baffles: how wide and how dark, and where they are, as shares
   * of a limb from the joint it hangs from, or metres up the torso. */
  private static readonly SEAM = { width: 0.012, alpha: 0.42 };
  private static readonly THIGH_SEAMS = [0.3, 0.55, 0.8];
  private static readonly ARM_SEAMS = [0.4, 0.7];
  private static readonly FOREARM_SEAMS = [0.45];
  private static readonly TORSO_SEAMS = [0.1, 0.185, 0.27, 0.355];
  /** How far up the torso its dark yoke begins, and down a shin its dark panel. */
  private static readonly YOKE = 0.43;
  private static readonly SHIN_PANEL = 0.17;
  /** The harness's belt: the slant it runs across the torso at, and its edges along it. */
  private static readonly BELT = { normal: { x: -0.055, y: 1 }, from: 0.005, to: 0.055 };
  /** Where the slings tie in at the harness, in the torso's frame, and where the cowstails hang
   * to from there, in the figure's, when nothing's clipped to them. */
  private static readonly TIE: Joint = { x: 0.2, y: 0.035 };
  private static readonly HANGING: readonly Joint[] = [
    { x: 0.06, y: -0.22 },
    { x: 0.14, y: -0.16 },
  ];
  /** The oxygen's hose: from the regulator, in the torso's frame, round in front of the chest to
   * the mask's valve. */
  private static readonly HOSE = {
    from: { x: -0.24, y: 0.66 },
    round: { x: 0.18, y: 0.42 },
    width: 0.022,
  };
  /** The jumar: where the near hand grips it and where its sling clips in, in its frame on the
   * rope; how firmly it must be held to show; and how thick the rope and the slings are. */
  private static readonly GRIP: Joint = { x: 0.035, y: -0.052 };
  private static readonly SLING_END: Joint = { x: -0.03, y: -0.055 };
  private static readonly SHOWN = 0.05;
  private static readonly ROPE_METRES = 0.06;
  private static readonly SLING_METRES = 0.016;
  private static readonly KARABINER = { width: 0.04, height: 0.022 };
  /** Each colour's shading, made once for every figure that wears it. */
  private static readonly SHADINGS = new Map<string, FillGradient>();

  private readonly far = new Container();
  private readonly lines = new Graphics();

  constructor(suit: number) {
    super(SuitRig.drawParts(suit));
    const { parts } = this;
    this.far.addChild(
      parts.upperArms[1],
      parts.forearms[1],
      parts.thighs[1],
      parts.shins[1],
      parts.boots[1],
    );
    this.addChild(
      this.far,
      parts.pack,
      parts.torso,
      parts.thighs[0],
      parts.shins[0],
      parts.boots[0],
      this.lines,
      parts.neck,
      parts.head,
      parts.jumar,
      parts.upperArms[0],
      parts.forearms[0],
    );
  }

  /** Where the headlamp shines from, as the head was last placed. */
  get lamp(): Joint {
    return SuitRig.at(this.parts.head, SuitRig.LAMP);
  }

  /** Where the breath comes out of the mask, as the head was last placed. */
  get valve(): Joint {
    return SuitRig.at(this.parts.head, SuitRig.VALVE);
  }

  /** The far limbs in the hour's light, darker and as cold as the sky, and the goggles' lens the
   * colour of the sky they face. */
  recolour(palette: Palette): void {
    this.far.tint = Palette.mix(
      Palette.shaded(0xffffff, SuitRig.FAR_SHADE),
      palette.skyTop,
      SuitRig.FAR_COLD,
    );
    this.parts.lens.tint = palette.skyHorizon;
  }

  /** The jumar on the rope in the near hand, as firmly as the pose holds it, the rope from it down
   * to the snow `ground` has ahead and its sling from the harness; the cowstails; and the oxygen's
   * hose. Drawn each frame, once the parts are placed. */
  hold(pose: Pose, ground: Ground): void {
    const { parts, lines } = this;
    const { torso, head, jumar } = parts;
    lines.clear();
    const regulator = SuitRig.at(torso, SuitRig.HOSE.from);
    const round = SuitRig.at(torso, SuitRig.HOSE.round);
    const valve = SuitRig.at(head, SuitRig.VALVE);
    lines
      .moveTo(regulator.x, regulator.y)
      .quadraticCurveTo(round.x, round.y, valve.x, valve.y)
      .stroke({ width: SuitRig.HOSE.width, color: Palette.HOSE, cap: "round" });
    const held = Math.min(1, pose.holding * 1.25);
    const tie = SuitRig.at(torso, SuitRig.TIE);
    // The cowstails hang from the harness, but for the jumar's while the jumar is held.
    for (const [index, hanging] of SuitRig.HANGING.entries()) {
      const alpha = index === 0 ? 1 - held : 1;
      if (alpha > 0) {
        SuitRig.cowstail(lines, tie, { x: tie.x + hanging.x, y: tie.y + hanging.y }, alpha);
      }
    }
    jumar.visible = held >= SuitRig.SHOWN;
    if (!jumar.visible) {
      return;
    }
    const hand = pose.arms[0].end;
    const off = ClimberPose.ropeOff(hand, ground);
    const along = Math.atan2(off.y - hand.y, off.x - hand.x);
    const cos = Math.cos(along);
    const sin = Math.sin(along);
    const { GRIP } = SuitRig;
    jumar.position.set(hand.x - GRIP.x * cos + GRIP.y * sin, hand.y - GRIP.x * sin - GRIP.y * cos);
    jumar.rotation = along;
    jumar.alpha = held;
    const rope = SuitRig.ROPE_METRES;
    for (const [width, color] of [
      [rope * 2, Palette.ROPE_SHADE],
      [rope, Palette.ROPE],
    ] as const) {
      lines
        .moveTo(jumar.x, jumar.y)
        .lineTo(off.x, off.y)
        .stroke({ width, color, alpha: held, cap: "round" });
    }
    const end = SuitRig.at(jumar, SuitRig.SLING_END);
    lines
      .moveTo(tie.x, tie.y)
      .lineTo(end.x, end.y)
      .stroke({ width: SuitRig.SLING_METRES, color: Palette.SLING, alpha: held, cap: "round" });
  }

  /** A cowstail from the harness, its karabiner on its end. */
  private static cowstail(lines: Graphics, tie: Joint, end: Joint, alpha: number): void {
    const { width, height } = SuitRig.KARABINER;
    lines
      .moveTo(tie.x, tie.y)
      .lineTo(end.x, end.y)
      .stroke({ width: SuitRig.SLING_METRES, color: Palette.SLING, alpha, cap: "round" });
    lines
      .roundRect(end.x - width / 2, end.y - height, width, height, height / 2)
      .fill({ color: Palette.STEEL, alpha });
  }

  private static drawParts(suit: number): SuitParts {
    const { thigh, upperArm, neck } = SuitRig.SHAPES;
    const along = (shares: readonly number[], length: number): number[] =>
      shares.map((share) => share * length);
    const pair = (draw: () => Graphics): [Graphics, Graphics] => [draw(), draw()];
    const lens = SuitRig.lens();
    return {
      thighs: pair(() => SuitRig.limb(thigh, suit, along(SuitRig.THIGH_SEAMS, ClimberPose.THIGH))),
      shins: pair(() => SuitRig.shin(suit)),
      boots: pair(() => SuitRig.boot()),
      upperArms: pair(() =>
        SuitRig.limb(upperArm, suit, along(SuitRig.ARM_SEAMS, ClimberPose.UPPER_ARM)),
      ),
      forearms: pair(() => SuitRig.forearm(suit)),
      pack: SuitRig.pack(),
      torso: SuitRig.torso(suit),
      neck: SuitRig.limb(neck, suit, []),
      head: SuitRig.head(suit, lens),
      lens,
      jumar: SuitRig.jumar(),
    };
  }

  /** A limb of the suit along its bone, shaded across it, with the seams between its baffles
   * `seams` metres along it. */
  private static limb(outline: Outline, suit: number, seams: readonly number[]): Graphics {
    const limb = new Graphics().poly([...outline]).fill(SuitRig.shading(suit, "across"));
    SuitRig.seams(limb, outline, FigureShapes.AHEAD, seams);
    return limb;
  }

  /** The shin, its knee in the suit and the rest of it in the dark panel that takes the scuffs. */
  private static shin(suit: number): Graphics {
    const { shin } = SuitRig.SHAPES;
    const panel = FigureShapes.band(shin, FigureShapes.AHEAD, SuitRig.SHIN_PANEL, Infinity);
    return SuitRig.limb(shin, suit, [])
      .poly([...panel])
      .fill(SuitRig.shading(Palette.PANEL, "across"));
  }

  /** The forearm, its cuff over the wrist and the mitt on its end. */
  private static forearm(suit: number): Graphics {
    const { forearm, cuff, mitt } = SuitRig.SHAPES;
    const seams = SuitRig.FOREARM_SEAMS.map((share) => share * ClimberPose.FOREARM);
    return SuitRig.limb(forearm, suit, seams)
      .poly([...cuff])
      .fill(SuitRig.shading(Palette.shaded(suit, 0.45), "across"))
      .poly([...mitt])
      .fill(SuitRig.shading(Palette.MITTS, "across"));
  }

  /** The boot on its sole: the crampon under it, the shell, the rubber rand round the sole and
   * over the toe, the gaiter's collar and its zip. */
  private static boot(): Graphics {
    const { boot: shell, crampon } = SuitRig.SHAPES;
    const { UP, AHEAD } = FigureShapes;
    const boot = new Graphics();
    for (const piece of crampon) {
      boot.poly([...piece]).fill(Palette.STEEL);
    }
    boot.poly([...shell]).fill(SuitRig.shading(Palette.BOOTS, "front"));
    const toe = FigureShapes.band(
      FigureShapes.band(shell, AHEAD, 0.175, Infinity),
      UP,
      -Infinity,
      0.075,
    );
    for (const rubber of [
      FigureShapes.band(shell, UP, -Infinity, 0.03),
      toe,
      FigureShapes.band(shell, UP, 0.226, Infinity),
    ]) {
      boot.poly([...rubber]).fill(Palette.RAND);
    }
    return boot.moveTo(0.06, 0.22).lineTo(0.09, 0.115).stroke({ width: 0.01, color: Palette.RAND });
  }

  /** The pack on the back: the bottle standing in it, its top and the regulator over the lid,
   * the compression straps across it, and the axe strapped on with its head at the top. */
  private static pack(): Graphics {
    const { pack: bag, lid } = SuitRig.SHAPES;
    const pack = new Graphics()
      .roundRect(-0.295, 0.48, 0.08, 0.17, 0.035)
      .fill(SuitRig.shading(Palette.BOTTLE, "front"))
      .poly([...bag])
      .fill(SuitRig.shading(Palette.PACK, "front"));
    for (const y of [0.22, 0.38]) {
      pack
        .poly([...FigureShapes.band(bag, FigureShapes.UP, y - 0.011, y + 0.011)])
        .fill(Palette.STRAP);
    }
    return pack
      .moveTo(-0.37, -0.06)
      .lineTo(-0.345, 0.47)
      .stroke({ width: 0.019, color: Palette.AXE, cap: "round" })
      .moveTo(-0.41, 0.49)
      .quadraticCurveTo(-0.35, 0.495, -0.27, 0.452)
      .stroke({ width: 0.026, color: Palette.STEEL, cap: "round" })
      .poly([...lid])
      .fill(SuitRig.shading(Palette.PACK_LID, "front"))
      .rect(-0.272, 0.64, 0.036, 0.035)
      .fill(Palette.REGULATOR)
      .circle(-0.24, 0.668, 0.016)
      .fill(Palette.REGULATOR);
  }

  /** The suit's body: its dark yoke over the shoulders, the seams between its baffles, the
   * harness's belt and buckle, and the pack's shoulder strap and chest strap over it. */
  private static torso(suit: number): Graphics {
    const { torso: body } = SuitRig.SHAPES;
    const { UP } = FigureShapes;
    const { normal, from, to } = SuitRig.BELT;
    const torso = new Graphics()
      .poly([...body])
      .fill(SuitRig.shading(suit, "front"))
      .poly([...FigureShapes.band(body, UP, SuitRig.YOKE, Infinity)])
      .fill(SuitRig.shading(Palette.PANEL, "front"));
    SuitRig.seams(torso, body, UP, SuitRig.TORSO_SEAMS);
    return torso
      .poly([...FigureShapes.band(body, normal, from, to)])
      .fill(Palette.HARNESS)
      .roundRect(0.12, 0.014, 0.04, 0.042, 0.01)
      .fill(Palette.STEEL)
      .moveTo(-0.13, 0.5)
      .quadraticCurveTo(0.04, 0.53, 0.115, 0.3)
      .stroke({ width: 0.032, color: Palette.STRAP, cap: "round" })
      .moveTo(0.1, 0.33)
      .lineTo(0.185, 0.33)
      .stroke({ width: 0.02, color: Palette.STRAP, cap: "round" });
  }

  /** The head: the hood, the face dark in it, the goggles' frame, their lens, and over them the
   * glint, the mask and its valve, and the headlamp on its strap. */
  private static head(suit: number, lens: Graphics): Container {
    const { hood: shape, mask } = SuitRig.SHAPES;
    const hood = new Graphics()
      .poly([...shape])
      .fill(SuitRig.shading(suit, "above"))
      .ellipse(0.085, -0.01, 0.06, 0.088)
      .fill(Palette.HOOD_SHADOW)
      .roundRect(0.066, -0.004, 0.088, 0.058, 0.022)
      .fill(Palette.GOGGLES);
    const { VALVE, LAMP } = SuitRig;
    const front = new Graphics()
      .ellipse(0.124, 0.034, 0.015, 0.006)
      .fill({ color: 0xffffff, alpha: 0.7 })
      .poly([...mask])
      .fill(SuitRig.shading(Palette.MASK, "front"))
      .circle(VALVE.x, VALVE.y, 0.022)
      .fill(Palette.VALVE)
      .moveTo(0.07, 0.112)
      .bezierCurveTo(0, 0.155, -0.11, 0.13, -0.142, 0.03)
      .stroke({ width: 0.02, color: Palette.STRAP })
      .roundRect(0.058, 0.093, 0.052, 0.036, 0.01)
      .fill(Palette.LAMP_CASE)
      .rect(LAMP.x - 0.006, LAMP.y - 0.012, 0.008, 0.024)
      .fill(Palette.LAMP);
    const head = new Container();
    head.addChild(hood, lens, front);
    return head;
  }

  /** The goggles' lens, drawn white and shaded, for the sky's colour to tint. */
  private static lens(): Graphics {
    return new Graphics()
      .roundRect(0.078, 0.004, 0.07, 0.042, 0.016)
      .fill(SuitRig.shading(0xffffff, "across"));
  }

  /** The jumar, its body along the rope and its red grip under it, below the rope. */
  private static jumar(): Graphics {
    return new Graphics()
      .rect(-0.03, -0.06, 0.014, 0.05)
      .rect(0.088, -0.05, 0.014, 0.04)
      .fill(Palette.JUMAR)
      .roundRect(-0.026, -0.078, 0.13, 0.034, 0.014)
      .fill(Palette.GRIP)
      .roundRect(-0.035, -0.014, 0.16, 0.026, 0.008)
      .fill(Palette.JUMAR);
  }

  /** The seams across a part where `normal` reaches each of `seams`. */
  private static seams(
    part: Graphics,
    outline: Outline,
    normal: Joint,
    seams: readonly number[],
  ): void {
    const half = SuitRig.SEAM.width / 2;
    for (const seam of seams) {
      part
        .poly([...FigureShapes.band(outline, normal, seam - half, seam + half)])
        .fill({ color: Palette.SEAM, alpha: SuitRig.SEAM.alpha });
    }
  }

  /** A colour shaded over a part: its dark side, itself, its lit side, and itself again at the
   * edge, where the light glances off. */
  private static shading(colour: number, shade: Shade): FillGradient {
    const key = `${shade} ${colour}`;
    const known = SuitRig.SHADINGS.get(key);
    if (known !== undefined) {
      return known;
    }
    const { dark, light } = SuitRig.TONES;
    const { start, end } = SuitRig.SHADES[shade];
    const shading = new FillGradient({
      type: "linear",
      start,
      end,
      colorStops: [
        { offset: 0, color: Palette.css(SuitRig.toned(colour, dark)) },
        { offset: 0.45, color: Palette.css(colour) },
        { offset: 0.8, color: Palette.css(SuitRig.toned(colour, light)) },
        { offset: 1, color: Palette.css(colour) },
      ],
      textureSpace: "local",
    });
    SuitRig.SHADINGS.set(key, shading);
    return shading;
  }

  /** A colour with each channel times `share`: darker below 1, brighter above. */
  private static toned(colour: number, share: number): number {
    const { red, green, blue } = Palette.channels(colour);
    return Palette.colour({ red: red * share, green: green * share, blue: blue * share });
  }
}
