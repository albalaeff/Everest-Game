import { Container, FillGradient, Graphics } from "pixi.js";

import type { DeviceKind } from "../simulation";
import { ClimberPose } from "./climber-pose";
import type { Joint, Pose } from "./climber-pose";
import { FigureRig } from "./figure-rig";
import type { RigParts } from "./figure-rig";
import { FigureShapes } from "./figure-shapes";
import type { Outline, ToolOutlines } from "./figure-shapes";
import { KitShading } from "./kit-shading";
import { Palette } from "./palette";

/** The suit's parts, and two it moves besides: the goggles' lens, tinted the sky's colour, and the
 * jumar, on the rope in the near hand. */
interface SuitParts extends RigParts {
  readonly lens: Graphics;
  readonly jumar: Graphics;
  readonly devices: Readonly<Record<DeviceKind, Graphics>>;
}

/**
 * A climber in their kit (#168), as #125's scene draws one: a down suit with its baffles, its dark
 * yoke and shins and its hood with a brim; the boots with their rands, their gaiters on the shins
 * turning in the shells as the ankles bend (#175), and the crampons' points and front points
 * under them; the mitts; the pack with its lid, the oxygen's bottle and regulator in it; the
 * harness, its belt and its slings; the mask with its valve and hose, on the face or hanging on
 * the chest, the goggles with the sky in them, and the headlamp; and the ice tools, the axe in the
 * near hand and a second tool in the far one, or strapped head down to the pack, each with a dark
 * edge so it reads on the snow and the ice alike. Each part is shaded from where the light comes
 * from and drawn once, the far limbs and the tool in the far hand darker and as cold as the sky;
 * what runs between the parts, the hose to the mask's valve and the cowstails to the jumar and the
 * carabiner, is drawn each frame.
 */
export class SuitRig extends FigureRig<SuitParts> {
  /** Where the lamp shines from, and where the mask's valve breathes out, in the head's frame. */
  static readonly LAMP: Joint = { x: 0.11, y: 0.111 };
  static readonly VALVE: Joint = { x: 0.158, y: -0.075 };
  /** How the kit is painted: the same as from the front. */
  private static readonly PAINT = KitShading.SHARED;
  /** How far the far limbs are shaded, and how much of the sky's cold light they take. */
  private static readonly FAR_SHADE = 0.25;
  private static readonly FAR_COLD = 0.22;
  /** An ice tool: how far its dark edge shows round it, how wide the shine along its pick's top
   * is, and where the red band round the axe's grip is, up the shaft from the hand, all in metres;
   * how dark the side of its shaft away from the light is, and how bright the side towards it. */
  private static readonly TOOL = {
    edge: 0.011,
    shine: 0.006,
    band: { from: 0.094, to: 0.116 },
    shade: { dark: 0.62, light: 1.22 },
    hole: 0.0055,
  };
  /** Where the cowstails tie in at the harness, in the torso's frame; how far below the tie one
   * off the rope hangs, and either side of it; and the carabiner's ring. */
  private static readonly TIE: Joint = { x: 0.2, y: 0.035 };
  private static readonly HANGING = { down: 0.26, ahead: 0.05 };
  private static readonly CARABINER = 0.03;
  /** The oxygen's hose: from the regulator, in the torso's frame, round in front of the chest to
   * the mask's valve. */
  private static readonly HOSE = {
    from: { x: -0.24, y: 0.66 },
    round: { x: 0.18, y: 0.42 },
    width: 0.022,
  };
  private readonly far = new Container();
  private readonly lines = new Graphics();
  /** Where the second carabiner was drawn, on its sling, or none while it's off the rope. */
  private carabinerAt: Joint | null = null;

  /** A Sherpa's pack, as many times as big as a client's (#212): he carries more. */
  static readonly LOADED = 1.3;

  /** A climber in a suit of `suit`'s colour, with a pack `pack` times a client's. */
  constructor(suit: number, pack = 1) {
    super(SuitRig.drawParts(suit));
    const { parts } = this;
    // The pack hangs from the hips, so it grows from there: taller, and further off the back.
    parts.pack.scale.set(pack);
    this.far.addChild(
      parts.upperArms[1],
      parts.tools[1],
      parts.forearms[1],
      parts.thighs[1],
      parts.shins[1],
      parts.boots[1],
    );
    this.addChild(
      this.far,
      parts.pack,
      parts.strapped[1],
      parts.strapped[0],
      parts.torso,
      parts.thighs[0],
      parts.shins[0],
      parts.boots[0],
      this.lines,
      parts.neck,
      parts.head,
      parts.mask,
      parts.jumar,
      parts.upperArms[0],
      parts.tools[0],
      parts.forearms[0],
      ...Object.values(parts.devices),
    );
  }

  /** Where the headlamp shines from, as the head was last placed. */
  get lamp(): Joint {
    return SuitRig.at(this.parts.head, SuitRig.LAMP);
  }

  /** Where the second carabiner was last drawn, at its sling's end, or none while it's off the
   * rope: the rope runs through it (#202). */
  get carabiner(): Joint | null {
    return this.carabinerAt;
  }

  /** Where the breath comes out, as the head was last placed: through the mask's valve while
   * it's on. */
  get mouth(): Joint {
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

  /** The oxygen's hose to the mask's valve, wherever the mask is; and the cowstails, as long as
   * `lengths` says and `width` wide, from the harness to the jumar in the near hand and the second carabiner,
   * slack or taut, and hanging where they're off. The carabiner hangs where it's on the rope as
   * far as its sling reaches, and no farther: where the rope lies on the snow out of its reach, the
   * sling holds the carabiner up off it, and the rope is lifted to it (#202). `together`, a
   * climber who hangs with both on one rope: the carabiner rides on the rope by the jumar, both
   * at the point the rope holds them from, so the rope runs down to one point over them and up
   * again, never across itself between the two (#243). Sat on the snow, `floor` high in the
   * figure's metres, a cowstail that's off lies on it (#241). Drawn each frame, once the parts
   * are placed. */
  hold(
    pose: Pose,
    lengths: { readonly jumar: number; readonly carabiner: number },
    width: number,
    together = false,
    floor: number | null = null,
  ): void {
    const { parts, lines } = this;
    const { torso, mask, jumar } = parts;
    lines.clear();
    // The hose runs from the bottle in the pack: none with the pack off their back (#241).
    if (parts.pack.visible) {
      const regulator = SuitRig.at(torso, SuitRig.HOSE.from);
      const round = SuitRig.at(torso, SuitRig.HOSE.round);
      const valve = SuitRig.at(mask, SuitRig.VALVE);
      lines
        .moveTo(regulator.x, regulator.y)
        .quadraticCurveTo(round.x, round.y, valve.x, valve.y)
        .stroke({ width: SuitRig.HOSE.width, color: Palette.HOSE, cap: "round" });
    }
    const tie = SuitRig.at(torso, SuitRig.TIE);
    // Down, in the figure's turned frame: what a slack cowstail sags toward.
    const down = { x: Math.sin(pose.tilt), y: -Math.cos(pose.tilt) };
    const { HANGING } = SuitRig;
    // Sat on the snow, `floor` high, a cowstail that's off lies on it ahead of them, as far as
    // it would have hung below it (#241).
    const lowest = floor === null ? -Infinity : floor + SuitRig.CARABINER;
    const off = (ahead: number): Joint => {
      const x = tie.x + down.x * HANGING.down + ahead;
      const y = tie.y + down.y * HANGING.down;
      return y >= lowest ? { x, y } : { x: x + (lowest - y), y: lowest };
    };
    const slack = (to: Joint): number =>
      floor === null ? HANGING.down * 2 : Math.hypot(to.x - tie.x, to.y - tie.y);
    const first = pose.jumar ?? off(HANGING.ahead);
    const sling = lengths.carabiner;
    this.carabinerAt =
      pose.carabiner === null
        ? null
        : together && pose.jumar !== null
          ? pose.jumar
          : SuitRig.within(tie, pose.carabiner, sling);
    const second = this.carabinerAt ?? off(-HANGING.ahead);
    SuitRig.cowstail(
      lines,
      tie,
      first,
      pose.jumar === null ? slack(first) : lengths.jumar,
      down,
      floor,
    );
    const slung = together ? lengths.jumar : sling;
    SuitRig.cowstail(
      lines,
      tie,
      second,
      pose.carabiner === null ? slack(second) : slung,
      down,
      floor,
    );
    lines.stroke({ width, color: Palette.SLING, cap: "round", join: "round" });
    lines
      .circle(second.x, second.y, SuitRig.CARABINER)
      .stroke({ width: width * 0.8, color: Palette.STEEL });
    // The jumar along its cowstail, where the hand holds it.
    jumar.position.set(first.x, first.y);
    jumar.rotation = Math.atan2(first.y - tie.y, first.x - tie.x);
  }

  /** `to`, or the point `length` from `from` towards it where it's farther. */
  private static within(from: Joint, to: Joint, length: number): Joint {
    const apart = Math.hypot(to.x - from.x, to.y - from.y);
    if (apart <= length) {
      return to;
    }
    const share = length / apart;
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  /** A cowstail `length` long from the harness to `to`: a curve that sags `down` between them as
   * far as its slack lets it, straight when it's taut; no lower than the snow they sit on,
   * `floor` high, where the rest of its slack lies ahead of them (#241). In pieces: a curve's own
   * are too few at the figure's metres. */
  private static cowstail(
    lines: Graphics,
    from: Joint,
    to: Joint,
    length: number,
    down: Joint,
    floor: number | null = null,
  ): void {
    const apart = Math.hypot(to.x - from.x, to.y - from.y);
    const sag = Math.sqrt(Math.max(length * length - apart * apart, 0)) / 2;
    const hungX = (from.x + to.x) / 2 + down.x * 2 * sag;
    const hungY = (from.y + to.y) / 2 + down.y * 2 * sag;
    // The curve's lowest point is halfway from its ends' middle to its control point.
    const lowest = floor === null ? -Infinity : 2 * floor - (from.y + to.y) / 2;
    const controlX = hungY < lowest ? hungX + (lowest - hungY) / 2 : hungX;
    const controlY = Math.max(hungY, lowest);
    const pieces = 8;
    lines.moveTo(from.x, from.y);
    for (let piece = 1; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      const s = 1 - t;
      lines.lineTo(
        s * s * from.x + 2 * s * t * controlX + t * t * to.x,
        s * s * from.y + 2 * s * t * controlY + t * t * to.y,
      );
    }
  }

  private static drawParts(suit: number): SuitParts {
    const { thigh, upperArm, neck } = SuitRig.SHAPES;
    const along = (shares: readonly number[], length: number): number[] =>
      shares.map((share) => share * length);
    const pair = (draw: () => Graphics): [Graphics, Graphics] => [draw(), draw()];
    const lens = SuitRig.lens();
    const { axe, iceTool } = SuitRig.SHAPES;
    const tools = (): [Graphics, Graphics] => [
      SuitRig.tool(axe, Palette.AXE_SHAFT, true),
      SuitRig.tool(iceTool, Palette.TOOL_SHAFT, false),
    ];
    return {
      thighs: pair(() =>
        SuitRig.limb(thigh, suit, along(FigureShapes.SEAMS.thigh, ClimberPose.THIGH)),
      ),
      shins: pair(() => SuitRig.shin(suit)),
      boots: pair(() => SuitRig.boot()),
      upperArms: pair(() =>
        SuitRig.limb(upperArm, suit, along(FigureShapes.SEAMS.upperArm, ClimberPose.UPPER_ARM)),
      ),
      forearms: pair(() => SuitRig.forearm(suit)),
      pack: SuitRig.pack(),
      torso: SuitRig.torso(suit),
      neck: SuitRig.limb(neck, suit, []),
      head: SuitRig.head(suit, lens),
      mask: SuitRig.mask(),
      lens,
      jumar: SuitRig.jumar(),
      tools: tools(),
      strapped: tools(),
      devices: {
        radio: SuitRig.inTheMitt(SuitRig.radio()),
        gps: SuitRig.watch(),
        wind: SuitRig.inTheMitt(SuitRig.meter()),
        tracker: SuitRig.inTheMitt(SuitRig.tracker()),
      },
    };
  }

  /** A device's dark edge, so it reads on the snow and on the night's ice alike; its screen's own
   * light, a screen being read at night; how far below its middle the mitt holds it, so its top
   * stands clear of the hand; and the mitt's thumb, closed across it there. In metres, as the
   * gear is. */
  private static readonly DEVICE = {
    edge: 0.008,
    screen: 0xffc45a,
    grey: 0xdfeee6,
    held: 0.03,
    thumb: { wide: 0.094, thick: 0.036 },
  };

  /** A device drawn round its middle, as the mitt holds it: by its lower end, the hand at the
   * part's origin, the mitt behind it and its thumb closed across it. */
  private static inTheMitt(device: Graphics): Graphics {
    const { held, thumb } = SuitRig.DEVICE;
    device
      .roundRect(-thumb.wide / 2, -held - thumb.thick / 2, thumb.wide, thumb.thick, thumb.thick / 2)
      .fill(SuitRig.PAINT.of(Palette.MITTS, "across"));
    device.pivot.set(0, -held);
    return device;
  }

  /** The handheld radio (#271), life size, held at the origin with its top along +y: a black body
   * a hand's width across, its stubby antenna at the back corner, the speaker's grille, the amber
   * display and the channel knob. */
  private static radio(): Graphics {
    const { edge, screen } = SuitRig.DEVICE;
    return new Graphics()
      .roundRect(-0.03, -0.05, 0.06, 0.125, 0.01)
      .roundRect(-0.024, 0.07, 0.013, 0.1, 0.006)
      .stroke({ width: edge, color: Palette.TOOL_EDGE, join: "round" })
      .roundRect(-0.024, 0.07, 0.013, 0.1, 0.006)
      .fill(Palette.TOOL_GRIP)
      .roundRect(0.008, 0.07, 0.014, 0.018, 0.004)
      .fill(Palette.TOOL_STEEL)
      .roundRect(-0.03, -0.05, 0.06, 0.125, 0.01)
      .fill(SuitRig.toolShading(0x2a2e38, "along"))
      .roundRect(-0.021, 0.028, 0.042, 0.03, 0.004)
      .fill(screen)
      .rect(-0.02, -0.036, 0.04, 0.006)
      .rect(-0.02, -0.022, 0.04, 0.006)
      .rect(-0.02, -0.008, 0.04, 0.006)
      .rect(-0.02, 0.006, 0.04, 0.006)
      .fill(Palette.TOOL_EDGE);
  }

  /** The pocket weather meter (#271): a yellow body that fits the palm, the impeller in its
   * ring at the top, open to the wind, and the grey display under it. */
  private static meter(): Graphics {
    const { edge, grey } = SuitRig.DEVICE;
    return new Graphics()
      .roundRect(-0.024, -0.05, 0.048, 0.1, 0.01)
      .circle(0, 0.068, 0.026)
      .stroke({ width: edge, color: Palette.TOOL_EDGE, join: "round" })
      .roundRect(-0.024, -0.05, 0.048, 0.1, 0.01)
      .fill(SuitRig.toolShading(0xe7b43a, "along"))
      .circle(0, 0.068, 0.026)
      .fill(0x2a2e38)
      .circle(0, 0.068, 0.017)
      .fill(0x8fa2b8)
      .rect(-0.003, 0.051, 0.006, 0.034)
      .rect(-0.017, 0.065, 0.034, 0.006)
      .fill(0x2a2e38)
      .roundRect(-0.017, 0.004, 0.034, 0.03, 0.004)
      .fill(grey)
      .circle(-0.009, -0.024, 0.006)
      .circle(0.009, -0.024, 0.006)
      .fill(0x2a2e38);
  }

  /** The satellite tracker (#271): an orange case with its black antenna cap, a small screen, and
   * the SOS under its cover on the side. */
  private static tracker(): Graphics {
    const { edge, grey } = SuitRig.DEVICE;
    return new Graphics()
      .roundRect(-0.027, -0.05, 0.054, 0.1, 0.009)
      .roundRect(-0.02, 0.046, 0.04, 0.034, 0.008)
      .stroke({ width: edge, color: Palette.TOOL_EDGE, join: "round" })
      .roundRect(-0.02, 0.046, 0.04, 0.034, 0.008)
      .fill(0x1b1d24)
      .roundRect(-0.027, -0.05, 0.054, 0.1, 0.009)
      .fill(SuitRig.toolShading(0xe2671e, "along"))
      .roundRect(-0.018, -0.004, 0.036, 0.034, 0.004)
      .fill(grey)
      .roundRect(-0.018, -0.04, 0.036, 0.014, 0.004)
      .fill(0x1b1d24);
  }

  /** The GPS watch (#271), in the wrist's frame, the forearm along +x: its strap round the cuff
   * and its round face out from the wrist, its display lit. */
  private static watch(): Graphics {
    const { edge, grey } = SuitRig.DEVICE;
    return new Graphics()
      .roundRect(-0.022, -0.062, 0.044, 0.124, 0.012)
      .fill(0x1b1d24)
      .circle(0, 0.062, 0.032)
      .stroke({ width: edge, color: Palette.TOOL_EDGE })
      .circle(0, 0.062, 0.032)
      .fill(0x2a2e38)
      .circle(0, 0.062, 0.024)
      .fill(grey);
  }

  /** A limb of the suit along its bone, shaded across it, with the seams between its baffles
   * `seams` metres along it. */
  private static limb(outline: Outline, suit: number, seams: readonly number[]): Graphics {
    const limb = new Graphics().poly([...outline]).fill(SuitRig.PAINT.of(suit, "across"));
    SuitRig.seams(limb, outline, FigureShapes.AHEAD, seams);
    return limb;
  }

  /** The shin, its knee in the suit and the rest of it in the dark panel that takes the scuffs;
   * and over it the boot's gaiter, turning with it, its collar and its zip. */
  private static shin(suit: number): Graphics {
    const { shin, gaiter } = SuitRig.SHAPES;
    const { AHEAD } = FigureShapes;
    const panel = FigureShapes.band(shin, AHEAD, FigureShapes.SHIN_PANEL, Infinity);
    const collar = Math.min(...gaiter.map(({ x }) => x)) + FigureShapes.GAITER.collar;
    return SuitRig.limb(shin, suit, [])
      .poly([...panel])
      .fill(SuitRig.PAINT.of(Palette.PANEL, "across"))
      .poly([...gaiter])
      .fill(SuitRig.PAINT.of(Palette.BOOTS, "across"))
      .poly([...FigureShapes.band(gaiter, AHEAD, -Infinity, collar)])
      .fill(Palette.RAND)
      .moveTo(0.26, 0.055)
      .lineTo(0.36, 0.08)
      .stroke({ width: 0.01, color: Palette.RAND });
  }

  /** The forearm, its cuff over the wrist and the mitt on its end. */
  private static forearm(suit: number): Graphics {
    const { forearm, cuff, mitt } = SuitRig.SHAPES;
    const seams = FigureShapes.SEAMS.forearm.map((share) => share * ClimberPose.FOREARM);
    return SuitRig.limb(forearm, suit, seams)
      .poly([...cuff])
      .fill(SuitRig.PAINT.of(Palette.shaded(suit, 0.45), "across"))
      .poly([...mitt])
      .fill(SuitRig.PAINT.of(Palette.MITTS, "across"));
  }

  /** The boot on its sole: the crampon under it, the shell, and the rubber rand round the sole and
   * over the toe. */
  private static boot(): Graphics {
    const { boot: shell, crampon } = SuitRig.SHAPES;
    const { UP, AHEAD } = FigureShapes;
    const boot = new Graphics();
    for (const piece of crampon) {
      boot.poly([...piece]).fill(Palette.STEEL);
    }
    boot.poly([...shell]).fill(SuitRig.PAINT.of(Palette.BOOTS, "front"));
    const toe = FigureShapes.band(
      FigureShapes.band(shell, AHEAD, 0.175, Infinity),
      UP,
      -Infinity,
      0.075,
    );
    for (const rubber of [FigureShapes.band(shell, UP, -Infinity, 0.03), toe]) {
      boot.poly([...rubber]).fill(Palette.RAND);
    }
    return boot;
  }

  /** The pack on the back: the bottle standing in it, its top and the regulator over the lid, and
   * the compression straps across it. The tools strapped on it are parts of their own. */
  private static pack(): Graphics {
    const { pack: bag, lid } = SuitRig.SHAPES;
    const pack = new Graphics()
      .roundRect(-0.295, 0.48, 0.08, 0.17, 0.035)
      .fill(SuitRig.PAINT.of(Palette.BOTTLE, "front"))
      .poly([...bag])
      .fill(SuitRig.PAINT.of(Palette.PACK, "front"));
    for (const y of [0.22, 0.38]) {
      pack
        .poly([...FigureShapes.band(bag, FigureShapes.UP, y - 0.011, y + 0.011)])
        .fill(Palette.STRAP);
    }
    return pack
      .poly([...lid])
      .fill(SuitRig.PAINT.of(Palette.PACK_LID, "front"))
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
    const { normal, from, to } = FigureShapes.BELT;
    const torso = new Graphics()
      .poly([...body])
      .fill(SuitRig.PAINT.of(suit, "front"))
      .poly([...FigureShapes.band(body, UP, FigureShapes.YOKE, Infinity)])
      .fill(SuitRig.PAINT.of(Palette.PANEL, "front"));
    SuitRig.seams(torso, body, UP, FigureShapes.SEAMS.torso);
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
   * glint and the headlamp on its strap. */
  private static head(suit: number, lens: Graphics): Container {
    const { hood: shape } = SuitRig.SHAPES;
    const hood = new Graphics()
      .poly([...shape])
      .fill(SuitRig.PAINT.of(suit, "above"))
      .ellipse(0.085, -0.01, 0.06, 0.088)
      .fill(Palette.HOOD_SHADOW)
      .roundRect(0.066, -0.004, 0.088, 0.058, 0.022)
      .fill(Palette.GOGGLES);
    const { LAMP } = SuitRig;
    const front = new Graphics()
      .ellipse(0.124, 0.034, 0.015, 0.006)
      .fill({ color: 0xffffff, alpha: 0.7 })
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

  /** The oxygen mask over the mouth and nose, and its valve, in the head's frame. */
  private static mask(): Graphics {
    const { VALVE } = SuitRig;
    return new Graphics()
      .poly([...SuitRig.SHAPES.mask])
      .fill(SuitRig.PAINT.of(Palette.MASK, "front"))
      .circle(VALVE.x, VALVE.y, 0.022)
      .fill(Palette.VALVE);
  }

  /** The goggles' lens, drawn white and shaded, for the sky's colour to tint. */
  private static lens(): Graphics {
    return new Graphics()
      .roundRect(0.078, 0.004, 0.07, 0.042, 0.016)
      .fill(SuitRig.PAINT.of(0xffffff, "across"));
  }

  /** The jumar, its body along the rope and its red grip under it, below the rope: drawn once, for
   * a figure side-on or from the front (`FrontRig`). */
  static jumar(): Graphics {
    return new Graphics()
      .rect(-0.03, -0.06, 0.014, 0.05)
      .rect(0.088, -0.05, 0.014, 0.04)
      .fill(Palette.JUMAR)
      .roundRect(-0.026, -0.078, 0.13, 0.034, 0.014)
      .fill(Palette.GRIP)
      .roundRect(-0.035, -0.014, 0.16, 0.026, 0.008)
      .fill(Palette.JUMAR);
  }

  /** An ice tool, drawn once in its own frame (`FigureShapes`): a dark edge round it, so it reads
   * on the snow and on the night's ice alike; the shaft in `shaft`, shaded across, lit on the
   * pick's side, which faces ahead into the light as it hangs from the ice; the steel of its foot,
   * its trigger rest and its head, lit towards the head's top, the shine along the top of the pick
   * and the hole through the head; and the black rubber of its grip, banded red on the axe. */
  private static tool(shapes: ToolOutlines, shaft: number, banded: boolean): Graphics {
    const { shaft: bar, grip, foot, head, rest, hole, edge } = shapes;
    const { TOOL } = SuitRig;
    const steels = rest === null ? [foot] : [foot, rest];
    const tool = new Graphics();
    for (const piece of [bar, grip, ...steels, head]) {
      tool
        .poly([...piece])
        .stroke({ width: 2 * TOOL.edge, color: Palette.TOOL_EDGE, join: "round" });
    }
    tool.poly([...bar]).fill(SuitRig.toolShading(shaft, "across"));
    for (const steel of steels) {
      tool.poly([...steel]).fill(SuitRig.toolShading(Palette.TOOL_STEEL, "across"));
    }
    tool.poly([...grip]).fill(SuitRig.toolShading(Palette.TOOL_GRIP, "across"));
    if (banded) {
      const { from, to } = TOOL.band;
      tool.poly([...FigureShapes.band(grip, FigureShapes.AHEAD, from, to)]).fill(Palette.GRIP);
    }
    tool
      .poly([...head])
      .fill(SuitRig.toolShading(Palette.TOOL_STEEL, "along"))
      .poly(
        edge.flatMap(({ x, y }) => [x, y]),
        false,
      )
      .stroke({ width: TOOL.shine, color: Palette.TOOL_SHINE, alpha: 0.9, cap: "round" })
      .circle(hole.x, hole.y, TOOL.hole)
      .fill(Palette.TOOL_EDGE);
    return tool;
  }

  /** A tool's colour shaded over a piece: across it, lit on its -y side, the pick's; or along it,
   * lit towards +x, the top of the head. */
  private static toolShading(colour: number, way: "across" | "along"): FillGradient {
    return SuitRig.PAINT.once(`tool ${way} ${colour}`, () => {
      const { dark, light } = SuitRig.TOOL.shade;
      return new FillGradient({
        type: "linear",
        start: way === "across" ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 },
        end: way === "across" ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 },
        colorStops:
          way === "across"
            ? [
                { offset: 0, color: Palette.css(KitShading.toned(colour, light)) },
                { offset: 0.35, color: Palette.css(colour) },
                { offset: 1, color: Palette.css(KitShading.toned(colour, dark)) },
              ]
            : [
                { offset: 0, color: Palette.css(KitShading.toned(colour, dark)) },
                { offset: 0.6, color: Palette.css(colour) },
                { offset: 1, color: Palette.css(KitShading.toned(colour, light)) },
              ],
        textureSpace: "local",
      });
    });
  }

  /** The seams across a part where `normal` reaches each of `seams`. */
  private static seams(
    part: Graphics,
    outline: Outline,
    normal: Joint,
    seams: readonly number[],
  ): void {
    const half = KitShading.SEAM.width / 2;
    for (const seam of seams) {
      part
        .poly([...FigureShapes.band(outline, normal, seam - half, seam + half)])
        .fill({ color: Palette.SEAM, alpha: KitShading.SEAM.alpha });
    }
  }
}
