import { TentArt } from "./tent-art";

/** What a hand holds: a spoon, empty or with a spoonful on it, or in the fist to stir with; a
 * bottle; an energy bar; a meal's pouch, open or sealed, or its seal between finger and thumb; a
 * lump of snow; a lighter, or one lit; the guitar's pick, or its neck; the pot, by its handle;
 * and the devices (#271): the radio, the tracker, the weather meter, and the watch, which is on
 * the wrist of the open hand that's turned up to read it. */
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

/** How a hand is shaped: open; wrapped round something wide, a bottle; laid across something
 * flat, a pouch; closed tight round something thin; pinching, as a pen is held; or cradling a
 * device that lies along it (#271), as a radio or a phone is held: the palm behind it, the
 * fingers round one edge and the thumb on the other. */
export type Shape = "open" | "wide" | "flat" | "tight" | "pinch" | "cradle";

/** How a hand lies to what it holds: its fingers across it, or along it. */
export type Grip = "across" | "along";

/**
 * The hands of the person in the tent (#264, #269), and what they hold, drawn to life at a real
 * hand's size: in millimetres, scaled to the tent's 300 pixels a metre, in the hand's own frame,
 * where it grips at the origin, the wrist behind it at -y and the fingers ahead along +y. A hand
 * is drawn in two layers, with what it holds between them, so the thing is in the hand and not
 * under it or over it: wrapped round a bottle or laid across a pouch, the palm is behind the thing
 * and the fingers lie across its front; closed tight, the fist covers the middle of something
 * thin, a lighter, the spoon the pot is stirred with or the pot's handle; pinching, the thumb and
 * the first finger are over a spoon or a bar and the other fingers under it, as a pen is held;
 * open, the whole hand is in front. It's a right hand seen from its back, the thumb at +x; the
 * left is its mirror image. What a hand holds is drawn in the thing's own frame, upright, where
 * it's held at the origin, in the picture's pixels: the bottle, the pouch, the pot and the spoon
 * are the tent's own (`TentArt`), so what's taken from the floor is what was standing there. The
 * pot is carried by the handle on its near side, so it's behind the arm that carries it, not in
 * front of it as the rest is. The skin is the face's (`--skin`).
 */
export class DwellerHands {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = 0.3;
  /** The shape of the hand that holds each thing. */
  static readonly SHAPES: Readonly<Record<Held, Shape>> = {
    nothing: "open",
    spoon: "pinch",
    spoonful: "pinch",
    stirrer: "tight",
    seal: "pinch",
    bar: "pinch",
    pick: "pinch",
    bottle: "wide",
    pouch: "flat",
    sealed: "flat",
    snow: "wide",
    lighter: "tight",
    lit: "tight",
    neck: "tight",
    pot: "tight",
    radio: "cradle",
    tracker: "cradle",
    meter: "cradle",
    watch: "open",
  };
  /** How each shape lies to what it holds, the open hand to where it points. */
  static readonly GRIPS: Readonly<Record<Shape, Grip>> = {
    open: "along",
    pinch: "along",
    wide: "across",
    flat: "across",
    tight: "across",
    cradle: "along",
  };
  /** How far behind where each shape grips its wrist is, in the tent's pixels. */
  static readonly WRIST: Readonly<Record<Shape, number>> = {
    open: 72 * DwellerHands.SCALE,
    wide: 88 * DwellerHands.SCALE,
    flat: 118 * DwellerHands.SCALE,
    tight: 80 * DwellerHands.SCALE,
    pinch: 105 * DwellerHands.SCALE,
    cradle: 96 * DwellerHands.SCALE,
  };
  /** How far what each shape holds can turn in it, off square or off straight, in degrees: a
   * spoon lies along the finger that pinches it, so hardly at all. */
  static readonly CANT: Readonly<Record<Shape, number>> = {
    open: 0,
    wide: 45,
    flat: 30,
    tight: 40,
    pinch: 24,
    cradle: 30,
  };
  /** What swings freely in the hand, whichever way the hand is turned: the pot, on its
   * handle. */
  static readonly TURNS: Readonly<Partial<Record<Held, true>>> = { pot: true };
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

  /** The hand's shading, lit from its thumb's side. */
  defs(): string {
    return `<linearGradient id="${this.id}-skin" gradientUnits="userSpaceOnUse" x1="-44" y1="0" x2="46" y2="0"><stop offset="0" class="dw-skin-shade"/><stop offset="0.5" class="dw-skin-base"/><stop offset="0.85" class="dw-skin-light"/><stop offset="1" class="dw-skin-base"/></linearGradient>`;
  }

  /** What of each shape is behind what the hand holds: a wrapping hand's palm, and a pinching
   * hand's back with the fingers under the thing. */
  back(): string {
    return this.layer({
      wide: DwellerHands.palm(88, 50),
      flat: DwellerHands.palm(118, 84),
      pinch: DwellerHands.pinchBack(),
      cradle: DwellerHands.cradleBack(),
    });
  }

  /** What of each shape is in front of what the hand holds: the open hand, a wrapping hand's
   * fingers, the fist, and a pinching hand's thumb and first finger. */
  front(): string {
    return this.layer({
      open: DwellerHands.open(),
      wide: DwellerHands.across([46, 51, 50, 44], -56, false),
      flat: DwellerHands.across([-16, -7, -10, -22], -92, true),
      tight: DwellerHands.fist(),
      pinch: DwellerHands.pinchFront(),
      cradle: DwellerHands.cradleFront(),
    });
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
      `<rect class="dw-lighter" x="-4.2" y="-12" width="8.4" height="24" rx="2"/><rect class="dw-lighter-top" x="-3.6" y="-17" width="7.2" height="6" rx="1"/>${lit ? '<path class="dw-spark" d="M0 -17C-3.2 -21 -2.6 -26 0 -31C2.6 -26 3.2 -21 0 -17Z"/>' : ""}<path class="dw-thumb" d="M3.4 1C6.6 -3 6.4 -9.5 4 -14.6C2 -16.6 -0.8 -15.6 -1 -13C-0.2 -8.5 -0.8 -3.5 -2.2 0.6Z"/>`;
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
      held(
        "snow",
        `<g transform="translate(${-DwellerHands.LUMP_HELD} 0)">${DwellerHands.lump()}</g>`,
      ),
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

  /** How far toward the fingertips a lump of snow is held, so it shows beyond them. */
  static readonly LUMP_HELD = 7;

  /** A lump of snow, its middle at the origin: a broken chunk, lit from above. */
  static lump(): string {
    return `<path class="dw-snow" d="M-16 4L-14 -10L-4 -15L8 -14L16 -5L15 8L6 14L-8 14Z"/><path class="dw-snow-shade" d="M-16 4L-8 14L6 14L15 8L5 6L-6 8Z"/><path class="dw-snow-edge" d="M-14 -10L-5 -6L8 -14M-5 -6L-6 8"/>`;
  }

  /** The shapes of a layer, each in a group the game shows when the hand is so shaped. */
  private layer(shapes: Readonly<Partial<Record<Shape, string>>>): string {
    const skin = `url(#${this.id}-skin)`;
    const groups = Object.entries(shapes)
      .map(
        ([shape, art]) =>
          `<g class="dw-shape" data-shape="${shape}">${art.replaceAll("SKIN", skin)}</g>`,
      )
      .join("");
    return `<g transform="scale(${DwellerHands.SCALE})">${groups}</g>`;
  }

  /** The open hand: the back of it from the wrist to the knuckles, four fingers a little curled,
   * the thumb at its side, the tendons faint under the skin, and the nails. */
  private static open(): string {
    const back =
      "M-27-72C-29-50-35-20-39 6C-40 14-38 22-32 24L34 26C40 22 42 14 41 6C38-20 32-50 29-72Z";
    const fingers = [
      DwellerHands.finger({ x: -28, y: 20 }, { x: -30.8, y: 74 }, 16.5),
      DwellerHands.finger({ x: -10, y: 24 }, { x: -11.1, y: 86 }, 17.5),
      DwellerHands.finger({ x: 8, y: 25 }, { x: 9, y: 85 }, 17),
      DwellerHands.finger({ x: 25, y: 22 }, { x: 27.5, y: 70 }, 15),
    ];
    const thumb = DwellerHands.finger({ x: 24, y: -36 }, { x: 49.2, y: 20.6 }, 21);
    return `<path class="dw-hand-shadow" d="${back}" transform="translate(-5 6)"/>
${thumb.shape}
<path class="dw-hand-skin" fill="SKIN" d="${back}"/>
${fingers.map(({ shape }) => shape).join("")}
<path class="dw-tendons" d="M-20-58L-24 12M-6-60L-8 16M8-60L9 18M22-58L26 14"/>
<path class="dw-knuckles" d="M-34 18Q-28 13-22 18M-16 21Q-10 16-4 21M2 22Q8 17 14 22M19 20Q24 15 30 20"/>
${[...fingers, thumb].map(({ nail }) => nail).join("")}`;
  }

  /** A wrapping hand's palm, behind what it holds: from the wrist, `wrist` behind the grip, to
   * the knuckles, `knuckles` behind it. */
  private static palm(wrist: number, knuckles: number): string {
    const middle = (wrist + knuckles) / 2;
    return `<path class="dw-hand-skin" fill="SKIN" d="M-27 ${-wrist}C-30 ${-middle - 6} -36 ${-middle + 4} -38 ${-knuckles}L38 ${-knuckles}C36 ${-middle + 4} 30 ${-middle - 6} 27 ${-wrist}Z"/>`;
  }

  /** A wrapping hand's four fingers, laid across the front of what it holds from their knuckles
   * at `from` to where each ends: round the thing's far edge, out of sight, or, `tips`, on its
   * face, with their nails. */
  private static across(to: readonly number[], from: number, tips: boolean): string {
    const fingers = [-27, -9, 9, 27].map((x, index) =>
      DwellerHands.finger({ x, y: from }, { x, y: to[index] ?? 0 }, 17.4, tips ? 0.86 : 0.97),
    );
    const far = Math.min(...to);
    const creases = [-18, 0, 18].map((x) => `M${x} ${from + 9}V${far - 4}`).join("");
    const knuckles = [-27, -9, 9, 27]
      .map((x) => `M${x - 6.5} ${from + 7}Q${x} ${from - 1} ${x + 6.5} ${from + 7}`)
      .join("");
    return `<path class="dw-hand-shadow" d="M-36 ${from + 4}H36V${far}H-36Z" transform="translate(-4 4)"/>
${fingers.map(({ shape }) => shape).join("")}
<path class="dw-creases" d="${creases}"/>
<path class="dw-knuckles" d="${knuckles}"/>
${tips ? fingers.map(({ nail }) => nail).join("") : ""}`;
  }

  /** The fist: the back of the hand, and the fingers curled in a row over what it holds, the
   * creases between them. */
  private static fist(): string {
    const back =
      "M-27-80C-30-62-36-42-38-26C-38-18-34-14-28-14L32-12C38-14 41-20 40-28C38-46 32-62 29-80Z";
    const curled = [
      { x: -27, width: 17.5, low: 20 },
      { x: -9, width: 18, low: 24 },
      { x: 9, width: 17.5, low: 23 },
      { x: 27, width: 15.5, low: 18 },
    ]
      .map(({ x, width, low }) => {
        const half = width / 2;
        return `<path class="dw-hand-skin" fill="SKIN" d="M${x - half} -18C${x - half - 1} ${low - 10} ${x - half + 2} ${low} ${x} ${low}C${x + half - 2} ${low} ${x + half + 1} ${low - 10} ${x + half} -18Z"/>`;
      })
      .join("");
    return `<path class="dw-hand-shadow" d="${back}" transform="translate(-5 6)"/>
<path class="dw-hand-skin" fill="SKIN" d="${back}"/>
${curled}
<path class="dw-creases" d="M-18 -12V17M0 -12V20M18 -12V16"/>
<path class="dw-tendons" d="M-20-66L-22-20M-6-68L-6-18M8-68L10-18M22-66L26-20"/>
<path class="dw-knuckles" d="M-34 -14Q-27 -21 -20 -14M-16 -12Q-9 -19 -2 -12M2 -12Q9 -19 16 -12M20 -14Q27 -20 34 -15"/>`;
  }

  /** A cradling hand, behind the device that lies along it (#271): the palm from the wrist to
   * the fingers' roots, and the fingers on behind the device. */
  private static cradleBack(): string {
    const palm =
      "M-27-96C-30-74-37-44-39-18C-40-6-38 6-34 16L34 18C39 8 41-6 40-18C38-44 31-74 28-96Z";
    const behind = [-27, -9, 9, 27].map(
      (x, index) =>
        DwellerHands.finger({ x, y: 12 }, { x, y: [56, 66, 64, 52][index] ?? 56 }, 17).shape,
    );
    return `<path class="dw-hand-shadow" d="${palm}" transform="translate(-5 6)"/>
${behind.join("")}
<path class="dw-hand-skin" fill="SKIN" d="${palm}"/>`;
  }

  /** A cradling hand, in front of the device: the fingers' ends come round its far edge onto
   * its face, and the thumb lies on its near edge, where a radio's key is. */
  private static cradleFront(): string {
    const tips = [-34, -16, 2, 20].map((y) =>
      DwellerHands.finger({ x: -40, y: y + 3 }, { x: -17, y }, 15.5, 0.8),
    );
    const thumb = DwellerHands.finger({ x: 37, y: -58 }, { x: 21, y: -4 }, 19, 0.8);
    return `${tips.map(({ shape }) => shape).join("")}${thumb.shape}
<path class="dw-knuckles" d="M30 -60Q37 -66 43 -59"/>
${tips.map(({ nail }) => nail).join("")}${thumb.nail}`;
  }

  /** A pinching hand, behind what it holds: its back, and the three fingers curled under the
   * thing, the second supporting it where it's held. */
  private static pinchBack(): string {
    const back =
      "M-26-105C-29-90-34-70-35-56C-35-50-32-46-27-46L30-44C34-46 36-50 35-56C33-70 30-90 27-105Z";
    const under = [
      DwellerHands.finger({ x: -25, y: -48 }, { x: -22, y: -24 }, 13),
      DwellerHands.finger({ x: -10, y: -49 }, { x: -9, y: -13 }, 15),
      DwellerHands.finger({ x: 6, y: -50 }, { x: -1, y: -3 }, 16),
    ];
    return `<path class="dw-hand-shadow" d="${back}" transform="translate(-5 6)"/>
<path class="dw-hand-skin" fill="SKIN" d="${back}"/>
${under.map(({ shape }) => shape).join("")}
<path class="dw-tendons" d="M-20-92L-24-54M-6-94L-8-52M8-94L8-52M22-92L25-54"/>
<path class="dw-knuckles" d="M-31 -50Q-25 -56 -19 -50M-16 -51Q-10 -57 -4 -51M0 -52Q6 -58 12 -52"/>`;
  }

  /** A pinching hand, in front of what it holds: the first finger and the thumb, their tips
   * together on the thing. */
  private static pinchFront(): string {
    const first = DwellerHands.finger({ x: 23, y: -50 }, { x: 5, y: 0 }, 16);
    const thumb = DwellerHands.finger({ x: 36, y: -80 }, { x: 11, y: -3 }, 19, 0.8);
    return `${thumb.shape}${first.shape}
<path class="dw-knuckles" d="M16 -52Q23 -58 30 -52"/>
${first.nail}${thumb.nail}`;
  }

  /** A finger from its knuckle at `from` to its tip at `to`, `wide` at its root and `taper` of
   * that at its tip: a strip rounded at its tip, and the nail on it. */
  private static finger(
    from: { readonly x: number; readonly y: number },
    to: { readonly x: number; readonly y: number },
    wide: number,
    taper = 0.86,
  ): { readonly shape: string; readonly nail: string } {
    const long = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const dx = (to.x - from.x) / long;
    const dy = (to.y - from.y) / long;
    const half = wide / 2;
    const end = half * taper;
    // Across the finger, at its root and at its tip, narrowing a little.
    const across = { x: dy, y: -dx };
    const round = (value: number): number => Math.round(value * 10) / 10;
    const point = (at: { readonly x: number; readonly y: number }, by: number): string =>
      `${round(at.x + across.x * by)} ${round(at.y + across.y * by)}`;
    const beyond = `${round(to.x + dx * end * 1.25)} ${round(to.y + dy * end * 1.25)}`;
    const shape = `<path class="dw-hand-skin" fill="SKIN" d="M${point(from, -half)}L${point(to, -end)}Q${beyond} ${point(to, end)}L${point(from, half)}Z"/>`;
    const nailAt = { x: to.x - dx * 4, y: to.y - dy * 4 };
    const turn = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    const nail = `<ellipse class="dw-nail" cx="${round(nailAt.x)}" cy="${round(nailAt.y)}" rx="${round(end * 0.62)}" ry="${round(end * 0.8)}" transform="rotate(${round(turn)} ${round(nailAt.x)} ${round(nailAt.y)})"/>`;
    return { shape, nail };
  }
}
