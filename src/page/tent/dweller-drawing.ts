import type { Outline } from "../../rendering/figure-shapes";
import { DwellerHands } from "./dweller-hands";
import type { HandDrawing, Held } from "./dweller-hands";
import type { Grip, Vector3 } from "./hand-bones";
import { DwellerHead } from "./dweller-head";
import { DwellerLegs } from "./dweller-legs";
import { DwellerNeck } from "./dweller-neck";
import type { NeckFrame } from "./dweller-neck";
import { DwellerPose } from "./dweller-pose";
import type { DwellerLook, Spot } from "./dweller-pose";
import { DwellerShapes } from "./dweller-shapes";
import type { SuitPart } from "./dweller-shapes";
import { TentArt } from "./tent-art";

/** The suit's parts that move: each arm's upper arm and forearm, each leg's thigh and shin, and
 * each bootie, the arm or the leg on the viewer's left first. */
export type LimbName =
  | "upper0"
  | "fore0"
  | "upper1"
  | "fore1"
  | "thigh0"
  | "shin0"
  | "foot0"
  | "thigh1"
  | "shin1"
  | "foot1";

/** A limb this frame: where it is, along its bone from its root; which of its sides the light is
 * on, its own +y or -y; and which end of each baffle of its down is the top, toward the light. */
export interface LimbFrame {
  readonly transform: string;
  readonly lit: "plus" | "minus";
  readonly puff: "end" | "root";
}

/** The person's drawing this frame: what each of its parts is set to. Transforms and paths are
 * SVG's own text; the rest are numbers. */
export interface DwellerFrame {
  /** The whole figure: where its hips are, mirrored when it faces the pack, and how much of it
   * shows. */
  readonly all: string;
  readonly shown: number;
  /** The body, leaning about the hips. */
  readonly torso: string;
  readonly limbs: Readonly<Record<LimbName, LimbFrame>>;
  /** Each hand as it's drawn, in its three places; how it's closed; what it holds, and where
   * that is and how it's turned. */
  readonly hands: readonly [HandDrawing, HandDrawing];
  readonly grips: readonly [Grip, Grip];
  readonly holds: readonly [Held, Held];
  readonly held: readonly [string, string];
  /** The neck from the collar up into the head (#277), and the head. */
  readonly neck: NeckFrame;
  readonly head: string;
  /** How far open the eyes are, 1 to 0; where they look, in the head's millimetres; how far open
   * the mouth is, 0 to 1. */
  readonly eyes: number;
  readonly gaze: Spot;
  readonly mouth: number;
  readonly guitar: boolean;
  /** The water poured, from the bottle into the pot or from the pot into the pouch, or
   * nothing. */
  readonly stream: string;
  /** Where a lump of snow is on its way into the pot, or nothing. */
  readonly lump: string | null;
  /** Where a pouch stands on the lap, set down, or nothing. */
  readonly pouch: string | null;
  /** Everywhere the first hand's thing shows: all but the inside of what it dips into. */
  readonly dip: string;
}

/**
 * The person in the tent as a drawing (#264): the climber of the slope, sitting. The suit's parts
 * are `DwellerShapes`' outlines, painted as the slope paints the kit (`FrontRig`): each part
 * shaded across from its dark side to its lit one, each baffle of down puffed between its seams,
 * dark at the seams and lit over its top, the yoke dark; the light comes from above and the right,
 * where the lamp hangs, so a pose that turns a limb turns its shading with it. The arms and the
 * legs are drawn each in its own frame along its bone, and a pose only moves those frames: an arm
 * whose elbow comes toward the viewer is drawn shorter, as a foreshortened limb is. The head is
 * `DwellerHead`'s. The hands are `DwellerHands'`, each on its wrist and in two layers, with what
 * it holds between them in its own frame: so a bottle is in the fingers, upright or tipped as the
 * pose has it, whichever way the wrist is bent; the pot, carried by the handle on its near side,
 * is behind the whole arm. What goes into the pot or the pouch is cut off where it goes in: the
 * spoon, the falling snow, the water. The colours are the picture's variables (`Appearance`). It
 * holds nothing: the same look gives the same frame.
 */
export class DwellerDrawing {
  /** The names of the parts with a shadow of their own, on what's under them: the forearms, in
   * front of the body. */
  static readonly DROPPED: readonly LimbName[] = ["fore0", "fore1"];
  /** The light, from above and the right, as the figure faces; and how far each arm's shadow
   * falls on what's under it, down and to the left. */
  private static readonly LIGHT: Spot = { x: 0.55, y: -0.83 };
  private static readonly DROP: Spot = { x: -3, y: 4 };
  /** The lean the legs begin to come under the figure at, and the one they're under it by; how
   * far the foot that keeps time turns, in degrees. */
  private static readonly CRAWL = { from: 24, to: 52 };
  private static readonly TAP = 14;
  /** How far under the figure's origin its hips are. */
  private static readonly HIPS = 3;
  /** Everywhere, as a path: what a clip that hides nothing shows. */
  static readonly EVERYWHERE = "M-2000 -2000H2000V2000H-2000Z";
  /** The guitar on the lap: its body on the right thigh, its neck rising to the left hand. */
  static readonly LAP = { x: -20, y: -40, turn: -25, size: 0.84 };
  /** The puff over a baffle of down, from one seam to the other: dark at the seams, lit over its
   * top, as the slope's (`FrontRig`). */
  private static readonly PUFF: readonly (readonly [number, string, number])[] = [
    [0, "#000", 0.26],
    [0.2, "#000", 0.06],
    [0.45, "#000", 0],
    [0.7, "#fff", 0.1],
    [0.86, "#fff", 0.03],
    [1, "#000", 0.16],
  ];

  /** The head, whose lids and mouth a pose moves. */
  readonly head = new DwellerHead("dw-face");
  private readonly neck = new DwellerNeck();
  private readonly shapes = new DwellerShapes();
  private readonly pose = new DwellerPose();

  private readonly legs = new DwellerLegs();

  /** `seat` is where the figure's hips are in the picture, sitting. */
  constructor(private readonly seat: Spot) {}

  /** The figure's parts, in the order they're drawn: the spoon left standing in the pot; the
   * upper arms, behind the body; the hood behind the neck, the body, the legs, the guitar on the
   * lap, a pouch set down there; the further arm's pot, forearm and hand, with what it holds; the
   * head; the nearer arm's, the same; a lump of snow falling, and the water poured. */
  markup(): string {
    const { shapes } = this;
    const { LAP, EVERYWHERE } = DwellerDrawing;
    const { SPOON_LEFT } = DwellerPose;
    const p = (outline: Outline, kind = ""): string => DwellerDrawing.path(outline, kind);
    const hands = [new DwellerHands("dw-hand0"), new DwellerHands("dw-hand1")] as const;
    // Each upper arm is behind the body, so its round top at the shoulder joint always runs on
    // under the body's shoulder, whichever way the arm turns: the arm can't come away from the
    // body. The forearm and the hand are in front of it.
    const upper = (side: 0 | 1): string =>
      DwellerDrawing.limb(`upper${side}`, shapes.upperArm, "suit");
    // A hand's parts go behind its sleeve's cuff, between it and what the hand holds, or in front
    // of that, as far toward the viewer as each is; the nearer hand's thing is cut off where it
    // dips into the pot or the pouch. The pot is behind the arm that carries it.
    const arm = (side: 0 | 1): string => {
      const things = `<g class="dw-things" data-part="held${side}">${DwellerHands.things()}</g>`;
      return `<g class="dw-things" data-part="carried${side}">${DwellerHands.carried()}</g>
<g class="dw-drop" data-part="fore${side}-drop">${p(shapes.forearm.outline)}</g>
${hands[side].place(`back${side}`)}
${DwellerDrawing.limb(`fore${side}`, shapes.forearm, "suit", shapes.cuff, "dw-cuff")}
${hands[side].place(`mid${side}`)}
${side === 0 ? `<g clip-path="url(#dw-dip)">${things}</g>` : things}
${hands[side].place(`hand${side}`)}`;
    };
    const thigh = (side: 0 | 1): string =>
      DwellerDrawing.limb(`thigh${side}`, shapes.thigh, "suit");
    const shin = (side: 0 | 1): string =>
      `${DwellerDrawing.limb(`shin${side}`, shapes.shin, "suit", shapes.shinPanel, "dw-panel")}${DwellerDrawing.limb(`foot${side}`, shapes.bootie, "booties", shapes.soles[side], "dw-sole")}`;
    const clip = (id: string, part: string, d: string): string =>
      `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path${part} clip-rule="evenodd" d="${d}"/></clipPath>`;
    return `<defs>${DwellerDrawing.defs()}${this.neck.defs()}${hands[0].defs()}${hands[1].defs()}${clip("dw-pot", "", DwellerDrawing.POT_HOLE)}${clip("dw-dip", ' data-part="dip"', EVERYWHERE)}</defs>
<g class="dw" data-part="all">
<g clip-path="url(#dw-pot)"><g class="dw-rest" transform="translate(${SPOON_LEFT.at.x.toFixed(1)} ${SPOON_LEFT.at.y.toFixed(1)}) rotate(${SPOON_LEFT.aim.toFixed(1)})">${DwellerHands.stirrer()}</g></g>
<g class="dw-upper-arms">${upper(1)}${upper(0)}</g>
<g class="dw-torso" data-part="torso">${this.body()}</g>
<g class="dw-legs">${thigh(0)}${shin(0)}${thigh(1)}${shin(1)}</g>
<g class="dw-lap" data-part="guitar" transform="translate(${LAP.x} ${LAP.y}) rotate(${LAP.turn}) scale(${LAP.size})">${TentArt.guitar()}</g>
<g class="dw-set" data-part="pouch"><g transform="translate(0 ${DwellerHands.POUCH_HELD})">${TentArt.pouch(true)}</g></g>
${arm(1)}
<g class="dw-head" data-part="head">${this.head.markup()}</g>
${arm(0)}
<g clip-path="url(#dw-pot)"><g class="dw-lump" data-part="lump">${DwellerHands.lump()}</g><path class="dw-stream" data-part="stream"/><path class="dw-stream-light" data-part="stream-light"/></g>
</g>`;
  }

  /** What `look` sets the figure's parts to. */
  frame(look: DwellerLook): DwellerFrame {
    const { seat, pose } = this;
    const joints = pose.joints(look);
    const text = (value: number): string => DwellerDrawing.text(value);
    const seated = `translate(${text(seat.x + look.shift)} ${text(seat.y - look.rise)})`;
    const light = look.turned
      ? { x: -DwellerDrawing.LIGHT.x, y: DwellerDrawing.LIGHT.y }
      : DwellerDrawing.LIGHT;
    const limb = (from: Spot, to: Spot, length: number): LimbFrame =>
      DwellerDrawing.along(from, to, length, light);
    const arm = (side: 0 | 1): { readonly upper: LimbFrame; readonly fore: LimbFrame } => ({
      upper: limb(joints.shoulders[side], joints.elbows[side], DwellerShapes.UPPER_ARM),
      fore: limb(joints.elbows[side], joints.wrists[side], DwellerShapes.FOREARM),
    });
    const [near, far] = [arm(0), arm(1)];
    const at = (side: 0 | 1): string =>
      `translate(${text(joints.hands[side].x)} ${text(joints.hands[side].y)})`;
    const hand = (side: 0 | 1): HandDrawing => {
      const { shape, turn, wrist, thing } = joints.grips[side];
      return DwellerHands.drawn(shape, turn, wrist, thing);
    };
    const held = (side: 0 | 1): string => `${at(side)} rotate(${text(joints.aims[side])})`;
    const holds: readonly [Held, Held] = [look.hands[0].holds, look.hands[1].holds];
    const { CRAWL } = DwellerDrawing;
    const under = DwellerDrawing.smooth((look.lean - CRAWL.from) / (CRAWL.to - CRAWL.from));
    // The legs in three dimensions (#285), seen from the front: each part as long as its bone,
    // drawn shorter as it points at the viewer.
    const [left, right] = this.legs.legs(under);
    const seen = (point: Vector3): Spot => ({ x: point.x, y: point.y + DwellerDrawing.HIPS });
    const tapped = DwellerDrawing.about(
      seen(right.ankle),
      seen(right.toe),
      -DwellerDrawing.TAP * look.tap,
    );
    const foot = (leg: typeof left): number => leg.toe.minus(leg.ankle).size;
    return {
      all: look.turned ? `${seated} scale(-1 1)` : seated,
      shown: Math.min(1, Math.max(0, look.shown * (1 - look.lying))),
      torso: `rotate(${text(joints.torso)})`,
      limbs: {
        upper0: near.upper,
        fore0: near.fore,
        upper1: far.upper,
        fore1: far.fore,
        thigh0: limb(seen(left.hip), seen(left.knee), DwellerShapes.THIGH),
        shin0: limb(seen(left.knee), seen(left.ankle), DwellerShapes.SHIN),
        foot0: limb(seen(left.ankle), seen(left.toe), foot(left)),
        thigh1: limb(seen(right.hip), seen(right.knee), DwellerShapes.THIGH),
        shin1: limb(seen(right.knee), seen(right.ankle), DwellerShapes.SHIN),
        foot1: limb(seen(right.ankle), tapped, foot(right)),
      },
      hands: [hand(0), hand(1)],
      grips: [DwellerHands.GRIPS[holds[0]], DwellerHands.GRIPS[holds[1]]],
      holds,
      held: [held(0), held(1)],
      neck: this.neck.frame(joints),
      head: `translate(${text(joints.head.x)} ${text(joints.head.y)}) rotate(${text(joints.headAngle)})`,
      eyes: Math.min(1, Math.max(0, look.eyes)),
      gaze: {
        x: Math.max(-1, Math.min(1, look.gaze.x)) * DwellerHead.GAZE.x,
        y: Math.max(-1, Math.min(1, look.gaze.y)) * DwellerHead.GAZE.y,
      },
      mouth: Math.min(1, Math.max(0, look.mouth)),
      guitar: look.guitar,
      stream: DwellerDrawing.stream(look),
      lump: look.lump === null ? null : `translate(${text(look.lump.x)} ${text(look.lump.y)})`,
      pouch:
        look.pouch === null
          ? null
          : `translate(${text(look.pouch.at.x)} ${text(look.pouch.at.y)}) rotate(${text(look.pouch.aim)})`,
      dip:
        look.dips === "pot"
          ? DwellerDrawing.POT_HOLE
          : look.dips === "pouch"
            ? DwellerDrawing.pouchHole(joints.hands[1], joints.aims[1])
            : DwellerDrawing.EVERYWHERE,
    };
  }

  /** Where an arm's shadow is: where the arm is, moved down and to the left. */
  static drop(limb: LimbFrame): string {
    const { DROP } = DwellerDrawing;
    return `translate(${DROP.x} ${DROP.y}) ${limb.transform}`;
  }

  /** The body: the hood down behind the neck, the suit's body quilted with its yoke and its zip,
   * the base layer in the opening, the neck (`DwellerNeck`), the base layer's collar round it, and
   * the suit's collar laid open. */
  private body(): string {
    const { body } = this.shapes;
    const { NECK } = DwellerShapes;
    const p = (outline: Outline, kind = ""): string => DwellerDrawing.path(outline, kind);
    return `<g class="dw-hood">${p(body.hood, "dw-hood-down")}<path class="dw-hood-rim" d="${DwellerDrawing.line(body.hood.slice(2, -2))}"/></g>
<g class="dw-body-suit">${p(body.outline, "dw-body-base")}${body.baffles.map((baffle) => p(baffle, "dw-body-baffle")).join("")}${body.seams.map((seam) => p(seam, "dw-seam")).join("")}${p(body.yoke, "dw-yoke")}</g>
${p(body.opening, "dw-base-layer")}
${p(body.collarBack, "dw-base-layer-back")}
${this.neck.markup()}
${p(body.baseLayer, "dw-base-layer")}
<path class="dw-base-layer-zip" d="M0 ${NECK.y - 12}V${NECK.y + 30}"/>
${p(body.collar[0], "dw-collar")}${p(body.collar[1], "dw-collar")}
<path class="dw-zip" d="${DwellerDrawing.line(body.zip)}"/>
<path class="dw-zip-light" d="${DwellerDrawing.line(body.zip.map(({ x, y }) => ({ x: x + 2, y })))}"/>`;
  }

  /** A part of the suit, in its own frame: its outline painted in `paint`, its baffles puffed,
   * its seams; and a band of it, as a sleeve's cuff, darker. */
  private static limb(
    name: string,
    part: SuitPart,
    paint: "suit" | "booties",
    band: Outline | null = null,
    kind = "",
  ): string {
    const p = (outline: Outline, kind = ""): string => DwellerDrawing.path(outline, kind);
    const baffles = part.baffles.map((baffle) => p(baffle, "dw-baffle")).join("");
    const seams = part.seams.map((seam) => p(seam, "dw-seam")).join("");
    const cuff = band === null ? "" : p(band, kind);
    return `<g class="dw-limb" data-part="${name}" data-paint="${paint}" data-lit="plus" data-puff="end">${p(part.outline, "dw-limb-base")}${baffles}${seams}${cuff}</g>`;
  }

  /** The shadings the suit's parts are painted with: across a part, lit on its +y side or its
   * -y one, in the suit's colour, the booties' and the cuff's; the puff of a baffle, its top at
   * the part's end or its root; and the body's, lit from the right and above. */
  private static defs(): string {
    const across = (name: string, lit: "plus" | "minus"): string => {
      const [from, to] = lit === "plus" ? [0, 1] : [1, 0];
      return `<linearGradient id="dw-${name}-${lit}" x1="0" y1="${from}" x2="0" y2="${to}">${DwellerDrawing.tones(name)}</linearGradient>`;
    };
    const side = (id: string, name: string): string =>
      `<linearGradient id="${id}" x1="0" y1="0.5" x2="1" y2="0.5">${DwellerDrawing.tones(name)}</linearGradient>`;
    const puffStops = DwellerDrawing.PUFF.map(
      ([offset, colour, alpha]) =>
        `<stop offset="${offset}" stop-color="${colour}" stop-opacity="${alpha}"/>`,
    ).join("");
    const puff = (id: string, x1: number, y1: number, x2: number, y2: number): string =>
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${puffStops}</linearGradient>`;
    return [
      across("suit", "plus"),
      across("suit", "minus"),
      across("booties", "plus"),
      across("booties", "minus"),
      across("cuff", "plus"),
      across("cuff", "minus"),
      across("yoke", "plus"),
      across("yoke", "minus"),
      side("dw-body-side", "suit"),
      side("dw-yoke-side", "yoke"),
      side("dw-base-side", "base-layer"),
      puff("dw-puff-end", 0, 0.5, 1, 0.5),
      puff("dw-puff-root", 1, 0.5, 0, 0.5),
      puff("dw-puff-up", 0.5, 1, 0.5, 0),
    ].join("");
  }

  /** A colour's shading as the slope paints the kit (`KitShading.of`): its dark side, itself,
   * its lit side, and itself again at the edge, where the light glances off. */
  private static tones(name: string): string {
    return `<stop offset="0" style="stop-color:var(--${name}-dark)"/><stop offset="0.45" style="stop-color:var(--${name})"/><stop offset="0.8" style="stop-color:var(--${name}-light)"/><stop offset="1" style="stop-color:var(--${name})"/>`;
  }

  /** A part from `from` to `to`, its bone `length` long: where its frame is, drawn shorter if
   * the two are nearer than that, and which way it's lit. */
  private static along(from: Spot, to: Spot, length: number, light: Spot): LimbFrame {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const far = Math.hypot(dx, dy);
    const angle = far < 1e-9 ? 0 : Math.atan2(dy, dx);
    const short = Math.min(1, far / length);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const text = (value: number): string => DwellerDrawing.text(value);
    const degrees = (angle * 180) / Math.PI;
    return {
      transform: `translate(${text(from.x)} ${text(from.y)}) rotate(${text(degrees)}) scale(${short.toFixed(3)} 1)`,
      lit: -sin * light.x + cos * light.y > 0 ? "plus" : "minus",
      puff: cos * light.x + sin * light.y > 0 ? "end" : "root",
    };
  }

  /** The water poured, falling from where it leaves to where it lands. */
  private static stream(look: DwellerLook): string {
    if (look.stream === null) {
      return "";
    }
    const [from, to] = look.stream;
    const text = (value: number): string => DwellerDrawing.text(value);
    return `M${text(from.x)} ${text(from.y)}Q${text(from.x + (to.x - from.x) * 0.15)} ${text((from.y + to.y) / 2)} ${text(to.x)} ${text(to.y)}`;
  }

  /** Everywhere but the inside of the pot on the stove, below its rim. */
  private static readonly POT_HOLE = ((): string => {
    const { POT, POT_INSIDE } = DwellerPose;
    const half = POT_INSIDE.half + 2;
    return `${DwellerDrawing.EVERYWHERE}M${POT.x - half} ${POT.y}H${POT.x + half}V${POT.y + POT_INSIDE.deep}H${POT.x - half}Z`;
  })();

  /** Everywhere but the inside of the pouch held at `at` and leaning `aim`, below the lip of its
   * opening. */
  private static pouchHole(at: Spot, aim: number): string {
    const { width, height } = TentArt.POUCH;
    const base = DwellerHands.POUCH_HELD;
    const lip = base - height + 7;
    const angle = (aim * Math.PI) / 180;
    const corner = (x: number, y: number): string =>
      `${DwellerDrawing.text(at.x + x * Math.cos(angle) - y * Math.sin(angle))} ${DwellerDrawing.text(at.y + x * Math.sin(angle) + y * Math.cos(angle))}`;
    const half = width / 2;
    return `${DwellerDrawing.EVERYWHERE}M${corner(-half, lip)}L${corner(half, lip)}L${corner(half - 3, base)}L${corner(-half + 3, base)}Z`;
  }

  /** `point` turned about `centre` by `degrees`, clockwise on the screen. */
  private static about(centre: Spot, point: Spot, degrees: number): Spot {
    const angle = (degrees * Math.PI) / 180;
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    return {
      x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  }

  /** 0 to 1 with an easy start and end. */
  private static smooth(share: number): number {
    const t = Math.min(1, Math.max(0, share));
    return t * t * (3 - 2 * t);
  }

  /** An outline as a closed path, with a class. */
  private static path(outline: Outline, kind = ""): string {
    const points = DwellerDrawing.line(outline);
    return `<path${kind === "" ? "" : ` class="${kind}"`} d="${points}Z"/>`;
  }

  /** Points as an open line. */
  private static line(points: readonly Spot[]): string {
    return points
      .map(
        ({ x, y }, index) =>
          `${index === 0 ? "M" : "L"}${DwellerDrawing.text(x)} ${DwellerDrawing.text(y)}`,
      )
      .join("");
  }

  /** A number as the drawing writes it: to a tenth of a pixel, and never `-0`. */
  private static text(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded === 0 ? 0 : rounded);
  }
}
