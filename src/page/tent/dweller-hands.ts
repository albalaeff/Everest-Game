import { HandBones, Vector3 } from "./hand-bones";
import type { Grip, HandShape, HandTurn } from "./hand-bones";
import { TentArt } from "./tent-art";

/** What a hand holds: a spoon, empty or with a spoonful on it, or in the fist to stir with; a
 * bottle; an energy bar; a meal's pouch, open or sealed, or lifted by its top, or its seal
 * between finger and thumb; a lump of snow; a lighter, or one lit; the guitar's pick, or its
 * neck; the pot, by its handle; and the devices (#271): the radio, the tracker, the weather
 * meter, and the watch, which is on the wrist of the open hand that's turned up to read it. */
export type Held =
  | "nothing"
  | "spoon"
  | "spoonful"
  | "stirrer"
  | "seal"
  | "bottle"
  | "bar"
  | "pouch"
  | "sealed"
  | "lifted"
  | "snow"
  | "lighter"
  | "lit"
  | "pick"
  | "neck"
  | "pot"
  | "radio"
  | "tracker"
  | "meter"
  | "watch";

/** A part of a hand as it's drawn this frame: its skin's outline, and a nail on it, if one shows;
 * both SVG paths in the picture's pixels, empty where there's nothing. */
export interface HandPart {
  readonly skin: string;
  readonly nail: string;
}

/** A hand as it's drawn this frame: its parts, from the furthest to the nearest, in the three
 * places they're drawn: behind the sleeve's cuff, between it and what the hand holds, and in
 * front of what it holds. */
export interface HandDrawing {
  readonly back: readonly HandPart[];
  readonly mid: readonly HandPart[];
  readonly front: readonly HandPart[];
}

/**
 * The hands of the person in the tent (#264, #269, #274), drawn as they're seen: a hand is
 * `HandBones`' hand in three dimensions, posed for what it holds and turned as the arm brings it,
 * and each of its parts, the palm and each bone of the fingers and the thumb, is drawn as it
 * shows from in front: a bone a rounded, tapered shape from one joint to the next, shorter as it
 * points at the viewer, a nail on a fingertip whose back is turned to the viewer, the palm round
 * the rim of it. The parts are drawn from the furthest to the nearest, each behind or in front of
 * the sleeve's cuff and of what the hand holds as it is: round a bottle, the fingers that wrap its
 * front are in front of it and the palm behind it, or, the back of the hand turned to the viewer,
 * the palm in front and the fingers round behind; a hand that reaches toward the viewer is over
 * its sleeve, one that reaches away under it. What a hand holds is drawn in the thing's own frame,
 * upright, where it's held at the origin, in the picture's pixels: the bottle, the pouch, the pot
 * and the spoon are the tent's own (`TentArt`), so what's taken from the floor is what was
 * standing there. The pot is carried by the handle on its near side, so it's behind the arm that
 * carries it, not in front of it as the rest is. The skin is the face's (`--skin`), each part
 * shaded across from its dark side to its lit one, toward the lamp.
 */
export class DwellerHands {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = HandBones.SCALE;
  /** How the hand closes on each thing it holds. */
  static readonly GRIPS: Readonly<Record<Held, Grip>> = {
    nothing: "open",
    spoon: "pinch",
    spoonful: "pinch",
    stirrer: "fist",
    seal: "seal",
    bar: "bar",
    pick: "pinch",
    bottle: "wrap",
    pouch: "plate",
    sealed: "plate",
    lifted: "top",
    snow: "cup",
    lighter: "lighter",
    lit: "lighter",
    neck: "fret",
    pot: "pot",
    radio: "cradle",
    tracker: "cradle",
    meter: "cradle",
    watch: "open",
  };
  /** How many parts a hand has, and so how many each of its places can draw: the palm, and the
   * three bones of each finger and of the thumb. */
  static readonly PARTS = 16;
  /** How far nearer the viewer than the wrist a part of the hand is drawn over the sleeve's cuff,
   * in pixels: the rest goes into the sleeve. */
  private static readonly CUFF = 4;
  /** What's carried behind the arm: the pot, by its handle. */
  static readonly CARRIED: readonly Held[] = ["pot"];
  /** How far above its base a pouch is held; and where the pot's lip is from its handle, on the
   * side it pours to, upright. */
  static readonly POUCH_HELD = 12;
  static readonly POT_LIP = { x: TentArt.POT.half, y: TentArt.POT.handle - TentArt.POT.rim };
  /** How far behind an open hand's middle its watch is, on the sleeve's cuff. */
  static readonly WATCH_WORN = 72 * DwellerHands.SCALE + 9;
  /** How much nearer its handle's end a spoon is held in the fist than pinched. */
  static readonly STIRRER_HELD = 12;
  /** How far from where it's held each thing's working end is, in the tent's pixels: a bottle's
   * mouth, the middle of a spoon's bowl, pinched or in the fist, a bar's bitten end, a lighter's
   * flame, a pouch's opening. */
  static readonly REACH = {
    bottle: TentArt.BOTTLE.height / 2 + TentArt.BOTTLE.cap,
    spoon: (TentArt.SPOON.neck + TentArt.SPOON.tip) / 2,
    stirrer: (TentArt.SPOON.neck + TentArt.SPOON.tip) / 2 + DwellerHands.STIRRER_HELD,
    bar: 24,
    lighter: 17,
    pouch: TentArt.POUCH.height - DwellerHands.POUCH_HELD - 3,
    radio: TentArt.RADIO.height / 2,
    meter: TentArt.METER.height / 2 + TentArt.METER.ring,
  } as const;

  /** `id` names the hand's shading, so each hand's can be told apart. */
  constructor(private readonly id: string) {}

  /** The hand's shading: across each part from its dark side, down and to the left, to its lit
   * one, toward the lamp. */
  defs(): string {
    return `<linearGradient id="${this.id}-skin" x1="0" y1="0.8" x2="1" y2="0.2"><stop offset="0" class="dw-skin-shade"/><stop offset="0.45" class="dw-skin-base"/><stop offset="0.85" class="dw-skin-light"/><stop offset="1" class="dw-skin-base"/></linearGradient>`;
  }

  /** One of the hand's places to draw its parts in, `name`d, with room for all of them. */
  place(name: string): string {
    const part = `<g class="dw-part"><path class="dw-hand-skin" fill="url(#${this.id}-skin)"/><path class="dw-nail"/></g>`;
    return `<g class="dw-hand" data-part="${name}">${part.repeat(DwellerHands.PARTS)}</g>`;
  }

  /** A hand drawn: `shape`, turned so, its wrist at `wrist` in the picture's pixels, toward the
   * viewer by its z; split by the depth of what it holds (none: `null`) and of its sleeve's cuff,
   * the wrist's. */
  static drawn(
    shape: HandShape,
    turn: HandTurn,
    wrist: Vector3,
    thing: number | null,
  ): HandDrawing {
    const { SCALE, CUFF } = DwellerHands;
    const place = (local: Vector3): Vector3 => wrist.plus(turn.of(local).times(SCALE));
    const parts: { readonly depth: number; readonly part: HandPart }[] = [];
    // The palm, round its rim, its back and its front, and the ball of the thumb over the
    // thumb's first bone, which joins the thumb to it however the thumb is turned.
    const rim = HandBones.PALM.flatMap(([x, y, top, under]) => [
      place(new Vector3(x, y, top)),
      place(new Vector3(x, y, under)),
    ]);
    const [base, knuckle] = shape.thumb.joints;
    if (base !== undefined && knuckle !== undefined) {
      const ball = base.toward(knuckle, 0.5);
      const bone = knuckle.minus(base).unit();
      const across = bone.cross(Vector3.OUT).unit();
      const deep = across.cross(bone).unit();
      const thick = (shape.thumb.radii[0] ?? 12) * 0.95;
      for (const off of [across, across.times(-1), deep, deep.times(-1)]) {
        rim.push(place(ball.plus(off.times(thick))));
      }
    }
    parts.push({
      depth: rim.reduce((sum, { z }) => sum + z, 0) / rim.length,
      part: { skin: DwellerHands.hull(rim), nail: "" },
    });
    for (const digit of [shape.thumb, ...shape.fingers]) {
      const joints = digit.joints.map(place);
      const last = joints.length - 2;
      for (let bone = 0; bone <= last; bone += 1) {
        const from = joints[bone] ?? wrist;
        const to = joints[bone + 1] ?? from;
        const thick = (digit.radii[bone] ?? 8) * SCALE;
        const thin = (digit.radii[bone + 1] ?? 8) * SCALE;
        const back = turn.of(digit.backs[bone] ?? Vector3.OUT);
        parts.push({
          depth: (from.z + to.z) / 2,
          part: {
            skin: DwellerHands.bone(from, thick, to, thin),
            nail: bone === last ? DwellerHands.nail(from, to, thin, back) : "",
          },
        });
      }
    }
    parts.sort((a, b) => a.depth - b.depth);
    const sleeve = wrist.z + CUFF;
    const back: HandPart[] = [];
    const mid: HandPart[] = [];
    const front: HandPart[] = [];
    for (const { depth, part } of parts) {
      if (thing !== null && depth > thing) {
        front.push(part);
      } else if (depth > sleeve) {
        (thing === null ? front : mid).push(part);
      } else {
        back.push(part);
      }
    }
    return { back, mid, front };
  }

  /** The spoon as the fist holds it to stir, upright, where it's held at the origin. */
  static stirrer(): string {
    return `<g transform="translate(0 ${-DwellerHands.STIRRER_HELD})">${TentArt.spoon()}</g>`;
  }

  /** What a hand holds behind its arm, upright in its own frame, where it's held at the origin:
   * the pot, whose handle is on its near side, so the arm that carries it is in front of it. */
  static carried(): string {
    return `<g class="dw-held" data-held="pot"><g transform="translate(0 ${TentArt.POT.handle})">${TentArt.pot()}</g></g>`;
  }

  /** What a hand holds in front of its arm, each upright in its own frame, where it's held at
   * the origin; the game shows the one held. */
  static things(): string {
    const held = (name: Held, art: string): string =>
      `<g class="dw-held" data-held="${name}">${art}</g>`;
    const spoon = TentArt.spoon();
    const lighter = (lit: boolean): string =>
      `<rect class="dw-lighter" x="-4.2" y="-12" width="8.4" height="24" rx="2"/><rect class="dw-lighter-top" x="-3.6" y="-17" width="7.2" height="6" rx="1"/>${lit ? '<path class="dw-spark" d="M0 -17C-3.2 -21 -2.6 -26 0 -31C2.6 -26 3.2 -21 0 -17Z"/>' : ""}`;
    const pouch = (open: boolean): string =>
      `<g transform="translate(0 ${DwellerHands.POUCH_HELD})">${TentArt.pouch(open)}</g>`;
    return [
      held("spoon", spoon),
      held(
        "spoonful",
        `${spoon}<path class="dw-food" d="M-4.5 -40C-4.5 -47 4.5 -47 4.5 -40C3 -37.4 -3 -37.4 -4.5 -40Z"/>`,
      ),
      held("stirrer", DwellerHands.stirrer()),
      held(
        "bottle",
        `<g transform="translate(0 ${TentArt.BOTTLE.height / 2})">${TentArt.bottle()}</g>`,
      ),
      held(
        "bar",
        `<rect class="dw-bar-wrap" x="-6.3" y="-12" width="12.6" height="24" rx="1.5"/><path class="dw-bar" d="M-5.7 -12L-5.7 -22.5C-4 -24.6 -2 -23 0 -24.6C2 -23 4 -24.6 5.7 -22.5L5.7 -12Z"/><path class="dw-bar-tear" d="M-6.3 -12L-4.2 -14.4L-2.1 -12L0 -14.4L2.1 -12L4.2 -14.4L6.3 -12"/><rect class="dw-bar-label" x="-4.2" y="-6" width="8.4" height="13" rx="1"/>`,
      ),
      held("pouch", pouch(true)),
      held("sealed", pouch(false)),
      held("lifted", pouch(false)),
      held("snow", DwellerHands.lump()),
      held("lighter", lighter(false)),
      held("lit", lighter(true)),
      held(
        "radio",
        `<g transform="translate(0 ${TentArt.RADIO.height / 2})">${TentArt.radio()}</g>`,
      ),
      held(
        "tracker",
        `<g transform="translate(0 ${TentArt.TRACKER.height / 2})">${TentArt.tracker()}</g>`,
      ),
      held(
        "meter",
        `<g transform="translate(0 ${TentArt.METER.height / 2})">${TentArt.meter()}</g>`,
      ),
      held(
        "watch",
        `<g transform="translate(0 ${DwellerHands.WATCH_WORN})">${TentArt.watch()}</g>`,
      ),
      held(
        "pick",
        `<path class="dw-pick" d="M-0.6 2C3.6 1.4 7.8 3.2 7.2 5.6C6 8.6 2.4 11.6 0.6 12.2C-1.2 9.8 -3 6.8 -3.6 5C-3.6 3.2 -2.4 2.3 -0.6 2Z"/>`,
      ),
    ].join("");
  }

  /** A lump of snow, its middle at the origin: a broken chunk, lit from above. */
  static lump(): string {
    return `<path class="dw-snow" d="M-16 4L-14 -10L-4 -15L8 -14L16 -5L15 8L6 14L-8 14Z"/><path class="dw-snow-shade" d="M-16 4L-8 14L6 14L15 8L5 6L-6 8Z"/><path class="dw-snow-edge" d="M-14 -10L-5 -6L8 -14M-5 -6L-6 8"/>`;
  }

  /** A bone as it's seen: round at each joint, `thick` and `thin` its radii there, and straight
   * between, as the two round ends' outline is; just a round where it points at the viewer. */
  private static bone(from: Vector3, thick: number, to: Vector3, thin: number): string {
    const t = (value: number): string => DwellerHands.text(value);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const far = Math.hypot(dx, dy);
    if (far + Math.min(thick, thin) <= Math.max(thick, thin) + 1e-6) {
      const [centre, radius] = thick >= thin ? [from, thick] : [to, thin];
      return `M${t(centre.x - radius)} ${t(centre.y)}a${t(radius)} ${t(radius)} 0 1 0 ${t(2 * radius)} 0a${t(radius)} ${t(radius)} 0 1 0 ${t(-2 * radius)} 0Z`;
    }
    const way = Math.atan2(dy, dx);
    const open = Math.acos(Math.min(1, Math.max(-1, (thick - thin) / far)));
    const on = (centre: Vector3, radius: number, angle: number): string =>
      `${t(centre.x + radius * Math.cos(angle))} ${t(centre.y + radius * Math.sin(angle))}`;
    const toLarge = 2 * open > Math.PI ? 1 : 0;
    const fromLarge = 2 * open < Math.PI ? 1 : 0;
    return `M${on(from, thick, way + open)}L${on(to, thin, way + open)}A${t(thin)} ${t(thin)} 0 ${toLarge} 0 ${on(to, thin, way - open)}L${on(from, thick, way - open)}A${t(thick)} ${t(thick)} 0 ${fromLarge} 0 ${on(from, thick, way + open)}Z`;
  }

  /** A fingertip's nail, on the back of its last bone toward the tip, if that's turned to the
   * viewer: a rounded shape as long as half the bone and two-thirds as wide as the finger. */
  private static nail(from: Vector3, to: Vector3, radius: number, back: Vector3): string {
    if (back.z < 0.2) {
      return "";
    }
    const way = to.minus(from);
    const long = way.size;
    if (long < 1e-6) {
      return "";
    }
    const along = way.times(1 / long);
    const side = along.cross(back).unit();
    const middle = to.minus(along.times(long * 0.32)).plus(back.times(radius * 0.72));
    const length = long * 0.3;
    const width = radius * 0.62;
    const corners = [
      middle.plus(along.times(length)).plus(side.times(width)),
      middle.plus(along.times(length)).minus(side.times(width)),
      middle.minus(along.times(length)).minus(side.times(width)),
      middle.minus(along.times(length)).plus(side.times(width)),
    ];
    return DwellerHands.rounded(corners);
  }

  /** The outline round points, the corners rounded: the smallest shape with all of them in it,
   * each corner a curve from the middle of one side to the middle of the next. */
  private static hull(points: readonly Vector3[]): string {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const turn = (o: Vector3, a: Vector3, b: Vector3): number =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (from: readonly Vector3[]): Vector3[] => {
      const kept: Vector3[] = [];
      for (const point of from) {
        while (kept.length >= 2) {
          const last = kept[kept.length - 1];
          const before = kept[kept.length - 2];
          if (last === undefined || before === undefined || turn(before, last, point) > 0) {
            break;
          }
          kept.pop();
        }
        kept.push(point);
      }
      kept.pop();
      return kept;
    };
    return DwellerHands.rounded([...half(sorted), ...half([...sorted].reverse())]);
  }

  /** A closed shape through the middles of its sides, each corner rounded. */
  private static rounded(corners: readonly Vector3[]): string {
    const t = (value: number): string => DwellerHands.text(value);
    const count = corners.length;
    if (count < 3) {
      return "";
    }
    const middle = (index: number): Vector3 => {
      const a = corners[index % count] ?? Vector3.ZERO;
      const b = corners[(index + 1) % count] ?? Vector3.ZERO;
      return a.toward(b, 0.5);
    };
    const start = middle(count - 1);
    let path = `M${t(start.x)} ${t(start.y)}`;
    corners.forEach((corner, index) => {
      const next = middle(index);
      path += `Q${t(corner.x)} ${t(corner.y)} ${t(next.x)} ${t(next.y)}`;
    });
    return `${path}Z`;
  }

  /** A number as the drawing writes it: to a tenth of a pixel, and never `-0`. */
  private static text(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded === 0 ? 0 : rounded);
  }
}
