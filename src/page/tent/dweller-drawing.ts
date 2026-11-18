import { DwellerPose } from "./dweller-pose";
import type { DwellerLook, Held, Spot } from "./dweller-pose";
import { TentArt } from "./tent-art";

/** The person's drawing this frame: what each of its parts is set to. Transforms and paths are
 * SVG's own text; the rest are numbers. */
export interface DwellerFrame {
  /** The whole figure: where its hips are, mirrored when it faces the pack, and how much of it
   * shows. */
  readonly all: string;
  readonly shown: number;
  readonly torso: string;
  /** Each leg from the hip over the knee to the ankle, the nearer the stove first, and its
   * bootie. */
  readonly legs: readonly [string, string];
  readonly feet: readonly [string, string];
  /** Each sleeve, from the shoulder over the elbow to the wrist. */
  readonly arms: readonly [string, string];
  /** Where each hand is, turned as what it holds lies. */
  readonly hands: readonly [string, string];
  readonly holds: readonly [Held, Held];
  readonly head: string;
  /** How far down the eyelids are, and how far open the mouth, in the head's pixels. */
  readonly lids: number;
  readonly mouth: number;
  readonly guitar: boolean;
  /** The water poured from the bottle into the pot, or nothing. */
  readonly stream: string;
}

/**
 * The person in the tent as a drawing (#258): the figure's parts as SVG, and what a pose sets each
 * of them to. They sit cross-legged on the mats in down trousers, booties and a down jacket,
 * turned a little toward the stove; on hands and knees their legs are under them. The sleeves are
 * lines from the shoulder over the elbow to the wrist, quilted across; a hand holds what the pose
 * says, a spoon or a bar along the forearm, a bottle tipped as it's drunk from or poured. The
 * colours are the style sheet's, by the look's variables (`--skin`, `--hair`, `--jacket`, ...), so
 * a climber's own look is a matter of setting them. It holds nothing: the same look gives the same
 * frame.
 */
export class DwellerDrawing {
  /** How far under the hips the mats are, sitting; a leg's joints sitting, from the hips: the
   * hip, the knee, the ankle and the toes, the nearer the stove first. */
  private static readonly MATS = 24;
  private static readonly SITTING: readonly [Limb, Limb] = [
    [
      { x: -14, y: -4 },
      { x: -96, y: -18 },
      { x: -40, y: 10 },
      { x: -6, y: 13 },
    ],
    [
      { x: 14, y: -4 },
      { x: 88, y: -14 },
      { x: 30, y: 12 },
      { x: -2, y: 16 },
    ],
  ];
  /** On hands and knees: each knee, ankle and toes, from the hips, as far down as the mats. */
  private static readonly KNEELING: readonly [Knelt, Knelt] = [
    [
      { x: -24, y: -14 },
      { x: 70, y: -11 },
      { x: 102, y: -8 },
    ],
    [
      { x: -4, y: -14 },
      { x: 88, y: -11 },
      { x: 120, y: -8 },
    ],
  ];
  /** The lean the legs begin to come under the figure at, and the one they're under it by. */
  private static readonly CRAWL = { from: 24, to: 52 };
  /** How far short of the hand's middle the sleeve ends, the eyelids' and the mouth's reach, and
   * how far the foot that keeps time lifts, in degrees. */
  private static readonly WRIST = 9;
  private static readonly LIDS = 5.4;
  private static readonly MOUTH = 5.5;
  private static readonly TAP = 16;
  /** How far the bottle tips before it pours, and where the pot's water is, from the hips. */
  private static readonly POURS = -80;
  private static readonly POT_WATER = -46;

  private readonly pose = new DwellerPose();

  /** `seat` is where the figure's hips are in the picture, sitting. */
  constructor(private readonly seat: Spot) {}

  /** The figure's parts, in the order they're drawn: the body, the legs over it, the guitar on
   * the lap, the further arm, the head, the nearer arm, and the water it pours. */
  markup(): string {
    const arm = (side: 0 | 1, held: string): string =>
      `<g class="dw-arm"><path class="dw-sleeve" data-part="arm${side}"/><path class="dw-quilt" data-part="quilt${side}"/><g data-part="hand${side}">${held}<circle class="dw-hand" r="10.5"/><path class="dw-knuckles" d="M-6 3q6 4 12 0"/></g></g>`;
    const nearer = `<g class="dw-held" data-held="spoon"><path d="M0 -8V42" stroke="#c9d0dc" stroke-width="4.5" stroke-linecap="round"/><ellipse cx="0" cy="50" rx="6.5" ry="9.5" fill="#e6ebf2"/></g>
<g class="dw-held" data-held="bar"><rect x="-7.5" y="-6" width="15" height="38" rx="3" fill="#6b3d17"/><path d="M-9 -8H9V14L5 11L1 14L-3 11L-7 14L-9 12Z" fill="#e7b24a"/></g>
<g class="dw-held" data-held="lighter"><rect x="-5.5" y="-2" width="11" height="26" rx="2.5" fill="#c9332c"/><rect x="-4.5" y="22" width="9" height="6" fill="#b5bdca"/><path class="dw-spark" d="M0 28q-5 8 0 15q5 -7 0 -15z"/></g>
<g class="dw-held" data-held="snow"><path d="M-15 5q-3 -17 10 -19q15 -2 17 10q3 13 -12 15q-12 1 -15 -6z" fill="#f4f8fc"/><path d="M-8 -6q6 -5 13 -2" stroke="#c7d6e8" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
<g class="dw-held" data-held="bottle"><rect x="-16" y="-34" width="32" height="72" rx="9" fill="#27323f"/><rect class="tent-water" x="-13" y="-24" width="26" height="58" rx="7"/><rect x="-16" y="-10" width="32" height="28" fill="#3f9488" opacity="0.92"/><rect x="-10" y="-46" width="20" height="13" rx="4" fill="#dfe6f0"/></g>`;
    const further = `<g class="dw-held" data-held="pouch"><path d="M-21 20L-24 -40L24 -40L21 20Z" fill="#e7b24a"/><path d="M-24 -40L24 -40L23 -30L-23 -30Z" fill="#b8822a"/><rect x="-13" y="-22" width="26" height="17" rx="3" fill="#7a4a1c"/><path d="M-9 6h18" stroke="#7a4a1c" stroke-width="3"/></g>`;
    return `<g class="dw" data-part="all">
<g class="dw-torso" data-part="torso"><path class="dw-hood" d="M-34 -138C-30 -166 26 -168 34 -136C20 -146 -18 -148 -34 -138Z"/><path class="dw-jacket" d="M-50 6C-60 -40 -64 -100 -54 -128C-46 -152 -22 -158 -2 -158C20 -158 46 -152 54 -124C62 -96 60 -40 52 6Z"/><path class="dw-jacket-seams" d="M-57 -28Q-2 -19 56 -28M-60 -58Q-2 -49 59 -58M-60 -88Q-2 -79 59 -88M-56 -118Q-2 -109 56 -116"/><path class="dw-zip" d="M-7 -150L-9 4"/><path class="dw-collar" d="M-27 -150Q-3 -136 23 -148"/><rect class="dw-badge" x="16" y="-108" width="20" height="12" rx="2"/></g>
<g class="dw-legs"><path class="dw-leg" data-part="leg1"/><path class="dw-bootie" data-part="foot1"/><path class="dw-leg" data-part="leg0"/><path class="dw-bootie" data-part="foot0"/></g>
<g class="dw-lap" data-part="guitar" transform="translate(30 -58) rotate(-30)">${TentArt.guitar()}</g>
${arm(1, further)}
<g class="dw-head" data-part="head">${TentArt.head()}</g>
${arm(0, nearer)}
<path class="dw-stream" data-part="stream"/>
</g>`;
  }

  /** What `look` sets the figure's parts to. */
  frame(look: DwellerLook): DwellerFrame {
    const { seat } = this;
    const joints = this.pose.joints(look);
    const at = `translate(${DwellerDrawing.text(seat.x + look.shift)} ${DwellerDrawing.text(seat.y - look.rise)})`;
    const arms = [0, 1].map((side) => {
      const shoulder = joints.shoulders[side] ?? joints.shoulders[0];
      const elbow = joints.elbows[side] ?? joints.elbows[0];
      const hand = joints.hands[side] ?? joints.hands[0];
      const wrist = DwellerDrawing.towards(hand, elbow, DwellerDrawing.WRIST);
      return DwellerDrawing.line([shoulder, elbow, wrist]);
    });
    const tip = look.holds[0] === "bottle" ? (look.tip ?? 0) : joints.forearms[0];
    const hands = [0, 1].map((side) => {
      const hand = joints.hands[side] ?? joints.hands[0];
      const turn = side === 0 ? tip : 0;
      return `translate(${DwellerDrawing.text(hand.x)} ${DwellerDrawing.text(hand.y)}) rotate(${DwellerDrawing.text(turn)})`;
    });
    const legs = DwellerDrawing.legs(look);
    return {
      all: look.turned ? `${at} scale(-1 1)` : at,
      shown: Math.min(1, Math.max(0, look.shown * (1 - look.lying))),
      torso: `rotate(${DwellerDrawing.text(joints.torso)})`,
      legs: [legs[0].leg, legs[1].leg],
      feet: [legs[0].foot, legs[1].foot],
      arms: [arms[0] ?? "", arms[1] ?? ""],
      hands: [hands[0] ?? "", hands[1] ?? ""],
      holds: look.holds,
      head: `translate(${DwellerDrawing.text(joints.head.x)} ${DwellerDrawing.text(joints.head.y)}) rotate(${DwellerDrawing.text(joints.headAngle)}) scale(${DwellerPose.HEAD_SCALE})`,
      lids: DwellerDrawing.LIDS * (1 - Math.min(1, Math.max(0, look.eyes))),
      mouth: DwellerDrawing.MOUTH * Math.min(1, Math.max(0, look.mouth)),
      guitar: look.guitar,
      stream: DwellerDrawing.stream(look, joints.hands[0]),
    };
  }

  /** The legs: crossed on the mats sitting, under the hips on hands and knees, and between the
   * two as the figure leans down onto its hands. The further foot lifts with the beat. */
  private static legs(look: DwellerLook): readonly [Leg, Leg] {
    const { CRAWL, SITTING, KNEELING, MATS } = DwellerDrawing;
    const share = Math.min(1, Math.max(0, (look.lean - CRAWL.from) / (CRAWL.to - CRAWL.from)));
    const under = share * share * (3 - 2 * share);
    const floor = MATS + look.rise;
    const mix = (from: Spot, to: Spot): Spot => ({
      x: from.x + (to.x - from.x) * under,
      y: from.y + (to.y + floor - from.y) * under,
    });
    const made = (
      [hip, knee, ankle, toes]: readonly [Spot, Spot, Spot, Spot],
      [kneel, heel, tip]: readonly [Spot, Spot, Spot],
      tap: number,
    ): Leg => {
      const end = mix(ankle, heel);
      const point = DwellerDrawing.about(end, mix(toes, tip), -DwellerDrawing.TAP * tap);
      return {
        leg: DwellerDrawing.line([hip, mix(knee, kneel), end]),
        foot: DwellerDrawing.line([end, point]),
      };
    };
    return [made(SITTING[0], KNEELING[0], 0), made(SITTING[1], KNEELING[1], look.tap)];
  }

  /** The water from a bottle tipped over the pot, down to the water in it. */
  private static stream(look: DwellerLook, hand: Spot): string {
    const tip = look.tip ?? 0;
    if (look.holds[0] !== "bottle" || tip > DwellerDrawing.POURS) {
      return "";
    }
    const angle = (tip * Math.PI) / 180;
    const from = {
      x: hand.x + DwellerPose.BOTTLE_NECK * Math.sin(angle),
      y: hand.y - DwellerPose.BOTTLE_NECK * Math.cos(angle),
    };
    const to = { x: from.x - 7, y: Math.max(from.y + 4, DwellerDrawing.POT_WATER) };
    const text = (value: number): string => DwellerDrawing.text(value);
    return `M${text(from.x)} ${text(from.y)}Q${text(from.x - 6)} ${text((from.y + to.y) / 2)} ${text(to.x)} ${text(to.y)}`;
  }

  /** A point so far from `from` on the way to `to`. */
  private static towards(from: Spot, to: Spot, far: number): Spot {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    return length < 1e-9
      ? from
      : { x: from.x + (dx / length) * far, y: from.y + (dy / length) * far };
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

/** A leg sitting: its hip, knee, ankle and toes; and on hands and knees: its knee, ankle and
 * toes. */
type Limb = readonly [Spot, Spot, Spot, Spot];
type Knelt = readonly [Spot, Spot, Spot];

/** A leg's lines: from the hip over the knee to the ankle, and the bootie from there. */
interface Leg {
  readonly leg: string;
  readonly foot: string;
}
