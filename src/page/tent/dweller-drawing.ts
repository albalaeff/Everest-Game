import type { Outline } from "../../rendering/figure-shapes";
import { DwellerHands } from "./dweller-hands";
import { DwellerHead } from "./dweller-head";
import { DwellerPose } from "./dweller-pose";
import type { DwellerLook, Held, Spot } from "./dweller-pose";
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
  /** Where each hand is, turned as its forearm or what it holds, and whether it's a fist round
   * something or open. */
  readonly hands: readonly [string, string];
  readonly fists: readonly [boolean, boolean];
  readonly holds: readonly [Held, Held];
  readonly head: string;
  /** How far open the eyes are, 1 to 0; where they look, in the head's millimetres; how far open
   * the mouth is, 0 to 1. */
  readonly eyes: number;
  readonly gaze: Spot;
  readonly mouth: number;
  readonly guitar: boolean;
  /** The water poured from the bottle into the pot, or nothing. */
  readonly stream: string;
}

/**
 * The person in the tent as a drawing (#264): the climber of the slope, sitting. The suit's parts
 * are `DwellerShapes`' outlines, painted as the slope paints the kit (`FrontRig`): each part
 * shaded across from its dark side to its lit one, each baffle of down puffed between its seams,
 * dark at the seams and lit over its top, the yoke dark; the light comes from above and the right,
 * where the lamp hangs, so a pose that turns a limb turns its shading with it. The arms and the
 * legs are drawn each in its own frame along its bone, and a pose only moves those frames: an arm
 * whose elbow comes toward the viewer is drawn shorter, as a foreshortened limb is. The head is
 * `DwellerHead`'s, the hands `DwellerHands'`, open or a fist round what they hold. The colours are
 * the picture's variables (`Appearance`). It holds nothing: the same look gives the same frame.
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
  /** How far the bottle tips before it pours, and where the pot's water is, from the hips. */
  private static readonly POURS = -80;
  private static readonly POT_WATER = -46;
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
  private readonly shapes = new DwellerShapes();
  private readonly pose = new DwellerPose();

  /** `seat` is where the figure's hips are in the picture, sitting. */
  constructor(private readonly seat: Spot) {}

  /** The figure's parts, in the order they're drawn: the upper arms, behind the body; the hood
   * behind the neck, the body, the legs, the guitar on the lap, the further forearm and its hand,
   * the head, the nearer forearm and its hand, and the water it pours. */
  markup(): string {
    const { shapes } = this;
    const { LAP } = DwellerDrawing;
    const p = (outline: Outline, kind = ""): string => DwellerDrawing.path(outline, kind);
    // Each upper arm is behind the body, so its round top at the shoulder joint always runs on
    // under the body's shoulder, whichever way the arm turns: the arm can't come away from the
    // body. The forearm and the hand are in front of it.
    const upper = (side: 0 | 1): string =>
      DwellerDrawing.limb(`upper${side}`, shapes.upperArm, "suit");
    const arm = (side: 0 | 1): string =>
      `<g class="dw-drop" data-part="fore${side}-drop">${p(shapes.forearm.outline)}</g>
${DwellerDrawing.limb(`fore${side}`, shapes.forearm, "suit", shapes.cuff, "dw-cuff")}
<g class="dw-hand" data-part="hand${side}">${DwellerHands.held()}<g class="dw-fist">${new DwellerHands(`dw-hand${side}`).markup("fist")}</g><g class="dw-open">${new DwellerHands(`dw-hand${side}`).markup("open")}</g></g>`;
    const thigh = (side: 0 | 1): string =>
      DwellerDrawing.limb(`thigh${side}`, shapes.thigh, "suit");
    const shin = (side: 0 | 1): string =>
      `${DwellerDrawing.limb(`shin${side}`, shapes.shin, "suit", shapes.shinPanel, "dw-panel")}${DwellerDrawing.limb(`foot${side}`, shapes.bootie, "booties", shapes.soles[side], "dw-sole")}`;
    return `<defs>${DwellerDrawing.defs()}</defs>
<g class="dw" data-part="all">
<g class="dw-upper-arms">${upper(1)}${upper(0)}</g>
<g class="dw-torso" data-part="torso">${this.body()}</g>
<g class="dw-legs">${thigh(0)}${thigh(1)}${shin(0)}${shin(1)}</g>
<g class="dw-lap" data-part="guitar" transform="translate(${LAP.x} ${LAP.y}) rotate(${LAP.turn}) scale(${LAP.size})">${TentArt.guitar()}</g>
${arm(1)}
<g class="dw-head" data-part="head">${this.head.markup()}</g>
${arm(0)}
<path class="dw-stream" data-part="stream"/>
</g>`;
  }

  /** What `look` sets the figure's parts to. */
  frame(look: DwellerLook): DwellerFrame {
    const { seat, pose, shapes } = this;
    const joints = pose.joints(look);
    const text = (value: number): string => DwellerDrawing.text(value);
    const at = `translate(${text(seat.x + look.shift)} ${text(seat.y - look.rise)})`;
    const light = look.turned
      ? { x: -DwellerDrawing.LIGHT.x, y: DwellerDrawing.LIGHT.y }
      : DwellerDrawing.LIGHT;
    const limb = (from: Spot, to: Spot, length: number): LimbFrame =>
      DwellerDrawing.along(from, to, length, light);
    const arm = (side: 0 | 1): { readonly upper: LimbFrame; readonly fore: LimbFrame } => {
      const elbow = joints.elbows[side];
      // The wrist its share of the way along the forearm, as the arm is drawn flat.
      const grip = DwellerShapes.GRIP / (DwellerShapes.FOREARM + DwellerShapes.GRIP);
      const hand = joints.hands[side];
      const wrist = {
        x: hand.x + (elbow.x - hand.x) * grip,
        y: hand.y + (elbow.y - hand.y) * grip,
      };
      return {
        upper: limb(joints.shoulders[side], elbow, DwellerShapes.UPPER_ARM),
        fore: limb(elbow, wrist, DwellerShapes.FOREARM),
      };
    };
    const [near, far] = [arm(0), arm(1)];
    const tip = look.holds[0] === "bottle" ? (look.tip ?? 0) : joints.forearms[0];
    const hand = (side: 0 | 1, turn: number): string =>
      `translate(${text(joints.hands[side].x)} ${text(joints.hands[side].y)}) rotate(${text(turn)})${side === 1 ? " scale(-1 1)" : ""}`;
    const { CRAWL } = DwellerDrawing;
    const under = DwellerDrawing.smooth((look.lean - CRAWL.from) / (CRAWL.to - CRAWL.from));
    const legs = shapes.legs(under, look.rise);
    const tapped = DwellerDrawing.about(
      legs.ankles[1],
      legs.toes[1],
      -DwellerDrawing.TAP * look.tap,
    );
    return {
      all: look.turned ? `${at} scale(-1 1)` : at,
      shown: Math.min(1, Math.max(0, look.shown * (1 - look.lying))),
      torso: `rotate(${text(joints.torso)})`,
      limbs: {
        upper0: near.upper,
        fore0: near.fore,
        upper1: far.upper,
        fore1: far.fore,
        thigh0: limb(legs.hips[0], legs.knees[0], DwellerShapes.THIGH),
        shin0: limb(legs.knees[0], legs.ankles[0], DwellerShapes.SHIN),
        foot0: limb(legs.ankles[0], legs.toes[0], DwellerShapes.BOOTIE.length),
        thigh1: limb(legs.hips[1], legs.knees[1], DwellerShapes.THIGH),
        shin1: limb(legs.knees[1], legs.ankles[1], DwellerShapes.SHIN),
        foot1: limb(legs.ankles[1], tapped, DwellerShapes.BOOTIE.length),
      },
      hands: [hand(0, tip), hand(1, joints.forearms[1])],
      fists: [look.holds[0] !== "nothing", look.holds[1] !== "nothing"],
      holds: look.holds,
      head: `translate(${text(joints.head.x)} ${text(joints.head.y)}) rotate(${text(joints.headAngle)})`,
      eyes: Math.min(1, Math.max(0, look.eyes)),
      gaze: {
        x: Math.max(-1, Math.min(1, look.gaze.x)) * DwellerHead.GAZE.x,
        y: Math.max(-1, Math.min(1, look.gaze.y)) * DwellerHead.GAZE.y,
      },
      mouth: Math.min(1, Math.max(0, look.mouth)),
      guitar: look.guitar,
      stream: DwellerDrawing.stream(look, joints.hands[0]),
    };
  }

  /** Where an arm's shadow is: where the arm is, moved down and to the left. */
  static drop(limb: LimbFrame): string {
    const { DROP } = DwellerDrawing;
    return `translate(${DROP.x} ${DROP.y}) ${limb.transform}`;
  }

  /** The body: the hood down behind the neck, the neck, the suit's body quilted with its yoke and
   * its zip, the base layer in the opening and round the neck, and the collar laid open. */
  private body(): string {
    const { body } = this.shapes;
    const { NECK, HEAD } = DwellerShapes;
    const head = NECK.y + HEAD.y;
    const p = (outline: Outline, kind = ""): string => DwellerDrawing.path(outline, kind);
    // A man's neck, as wide as two-thirds of the jaw, from under it down into the collar.
    const neck = `M-15 ${head + 18}C-15 ${head + 36} -18 ${NECK.y - 10} -19 ${NECK.y + 6}L18 ${NECK.y + 6}C17 ${NECK.y - 10} 15 ${head + 36} 15 ${head + 14}Z`;
    return `<g class="dw-hood">${p(body.hood, "dw-hood-down")}<path class="dw-hood-rim" d="${DwellerDrawing.line(body.hood.slice(2, -2))}"/></g>
<g class="dw-body-suit">${p(body.outline, "dw-body-base")}${body.baffles.map((baffle) => p(baffle, "dw-body-baffle")).join("")}${body.seams.map((seam) => p(seam, "dw-seam")).join("")}${p(body.yoke, "dw-yoke")}</g>
${p(body.opening, "dw-base-layer")}
<path class="dw-neck" d="${neck}"/>
<path class="dw-neck-shade" d="${neck}"/>
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
      `<linearGradient id="dw-neck-side" x1="0" y1="0.5" x2="1" y2="0.5"><stop offset="0" style="stop-color:var(--skin-shade)"/><stop offset="0.6" style="stop-color:var(--skin)"/><stop offset="1" style="stop-color:var(--skin-light)"/></linearGradient>`,
      `<linearGradient id="dw-neck-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0c06" stop-opacity="0.62"/><stop offset="0.45" stop-color="#1a0c06" stop-opacity="0.18"/><stop offset="1" stop-color="#1a0c06" stop-opacity="0"/></linearGradient>`,
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

  /** The water from a bottle tipped over the pot, down to the water in it. */
  private static stream(look: DwellerLook, hand: Spot): string {
    const tip = look.tip ?? 0;
    if (look.holds[0] !== "bottle" || tip > DwellerDrawing.POURS) {
      return "";
    }
    const angle = (tip * Math.PI) / 180;
    const from = {
      x: hand.x + DwellerHands.BOTTLE_NECK * Math.sin(angle),
      y: hand.y - DwellerHands.BOTTLE_NECK * Math.cos(angle),
    };
    const to = { x: from.x - 7, y: Math.max(from.y + 4, DwellerDrawing.POT_WATER) };
    const text = (value: number): string => DwellerDrawing.text(value);
    return `M${text(from.x)} ${text(from.y)}Q${text(from.x - 6)} ${text((from.y + to.y) / 2)} ${text(to.x)} ${text(to.y)}`;
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
