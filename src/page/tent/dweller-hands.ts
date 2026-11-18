/**
 * The hands of the person in the tent (#264), and what they hold, drawn to life at a real hand's
 * size: in millimetres, scaled to the tent's 300 pixels a metre, in the hand's own frame, the
 * middle of the palm, where it grips, at the origin, the wrist 70 mm behind it at -y and the
 * fingers ahead along +y. It's a right hand seen from its back, the thumb at +x; the left is its
 * mirror image. Open, it lies relaxed, the fingers a little curled; closed, it's a fist round what
 * it holds, the fingers curled over it and the thumb across them. What it holds is drawn first,
 * so the fingers close over it: a long spoon, a bottle in its sleeve, an energy bar, a lighter, a
 * lump of snow, a meal's pouch, a pick. The skin is the face's (`--skin`), lit from the right.
 */
export class DwellerHands {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = 0.3;
  /** How far the bottle's mouth is from the hand that holds it by its middle, in the tent's
   * pixels: where it pours from, and what goes to the lips. */
  static readonly BOTTLE_NECK = 150 * DwellerHands.SCALE;
  /** How far beyond the hand the spoon's bowl is, and the bar's end, along its fingers. */
  static readonly SPOON = 150 * DwellerHands.SCALE;
  static readonly BAR = 112 * DwellerHands.SCALE;

  /** `id` names the hand's shadings, so each hand's can be told apart. */
  constructor(private readonly id: string) {}

  /** The hand, open (`"open"`) or round what it holds (`"fist"`), its gradient named after the
   * hand's id and its shape. */
  markup(shape: "open" | "fist"): string {
    const id = `${this.id}-${shape}`;
    const fingers = shape === "open" ? DwellerHands.open() : DwellerHands.fist();
    return `<g class="dw-hand-${shape}" transform="scale(${DwellerHands.SCALE})">
<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-44" y1="0" x2="46" y2="0"><stop offset="0" class="dw-skin-shade"/><stop offset="0.5" class="dw-skin-base"/><stop offset="0.85" class="dw-skin-light"/><stop offset="1" class="dw-skin-base"/></linearGradient>
${fingers.replaceAll("SKIN", `url(#${id})`)}
</g>`;
  }

  /** What a hand holds, each drawn in the hand's frame; the game shows the one held. */
  static held(): string {
    const { SCALE } = DwellerHands;
    return `<g transform="scale(${SCALE})">
<g class="dw-held" data-held="spoon"><path class="dw-spoon" d="M-3-60L3-60L4.5 120L-4.5 120Z"/><path class="dw-spoon" d="M0 118C14 118 19 136 18 154C17 172 8 184 0 184C-8 184-17 172-18 154C-19 136-14 118 0 118Z"/><path class="dw-spoon-light" d="M-9 150C-8 138-3 130 4 128"/></g>
<g class="dw-held" data-held="bar"><rect class="dw-bar-wrap" x="-21" y="-30" width="42" height="112" rx="5"/><path class="dw-bar" d="M-19 82L-19 118C-14 124-6 120 0 124C6 120 14 124 19 118L19 82Z"/><path class="dw-bar-tear" d="M-21 82L-15 90L-9 82L-3 90L3 82L9 90L15 82L21 90"/><rect class="dw-bar-label" x="-14" y="0" width="28" height="44" rx="3"/></g>
<g class="dw-held" data-held="lighter"><rect class="dw-lighter" x="-14" y="-10" width="28" height="84" rx="7"/><rect class="dw-lighter-top" x="-12" y="70" width="24" height="20" rx="3"/><path class="dw-spark" d="M0 92C-10 104-8 120 0 134C8 120 10 104 0 92Z"/></g>
<g class="dw-held" data-held="snow"><path class="dw-snow" d="M-50 20C-60-34-10-56 26-40C62-26 66 24 40 46C10 66-44 64-50 20Z"/><path class="dw-snow-shade" d="M-50 20C-40 48 0 62 40 46C20 40-20 40-50 20Z"/></g>
<g class="dw-held" data-held="bottle"><rect class="dw-bottle" x="-52" y="-112" width="104" height="238" rx="30"/><rect class="dw-bottle-water" x="-42" y="-86" width="84" height="200" rx="22"/><rect class="dw-bottle-sleeve" x="-53" y="-40" width="106" height="94"/><path class="dw-bottle-light" d="M34-90V100"/><rect class="dw-bottle-cap" x="-34" y="-152" width="68" height="44" rx="10"/><path class="dw-bottle-loop" d="M30-140C60-136 58-104 38-100"/></g>
<g class="dw-held" data-held="pouch"><path class="dw-pouch" d="M-80 70L-86-130L86-130L80 70C40 80-40 80-80 70Z"/><path class="dw-pouch-top" d="M-86-130L86-130L84-104L-84-104Z"/><rect class="dw-pouch-label" x="-50" y="-70" width="100" height="60" rx="8"/><path class="dw-pouch-light" d="M58-96L54 56"/></g>
<g class="dw-held" data-held="pick"><path class="dw-pick" d="M-2 40C12 38 26 44 24 52C20 62 8 72 2 74C-4 66-10 56-12 50C-12 44-8 41-2 40Z"/></g>
</g>`;
  }

  /** The open hand: the back of it from the wrist to the knuckles, four fingers a little curled,
   * the thumb at its side, the tendons faint under the skin, and the nails. */
  private static open(): string {
    const back =
      "M-27-72C-29-50-35-20-39 6C-40 14-38 22-32 24L34 26C40 22 42 14 41 6C38-20 32-50 29-72Z";
    const fingers = [
      DwellerHands.finger(-28, 20, 54, 16.5, -3),
      DwellerHands.finger(-10, 24, 62, 17.5, -1),
      DwellerHands.finger(8, 25, 60, 17, 1),
      DwellerHands.finger(25, 22, 48, 15, 3),
    ];
    const thumb = DwellerHands.finger(24, -36, 62, 21, 24);
    return `<path class="dw-hand-shadow" d="${back}" transform="translate(-5 6)"/>
${thumb.shape}
<path class="dw-hand-skin" fill="SKIN" d="${back}"/>
${fingers.map(({ shape }) => shape).join("")}
<path class="dw-tendons" d="M-20-58L-24 12M-6-60L-8 16M8-60L9 18M22-58L26 14"/>
<path class="dw-knuckles" d="M-34 18Q-28 13-22 18M-16 21Q-10 16-4 21M2 22Q8 17 14 22M19 20Q24 15 30 20"/>
${[...fingers, thumb].map(({ nail }) => nail).join("")}`;
  }

  /** The fist: the back of the hand, the fingers' middle joints curled in a row over what it
   * holds, the creases between them, and the thumb across the first two. */
  private static fist(): string {
    const back =
      "M-27-72C-30-48-36-22-38 2C-38 10-34 14-28 14L32 16C38 14 41 8 40 0C38-24 32-48 29-72Z";
    const curled = [
      { x: -30, width: 17.5, low: 38 },
      { x: -12, width: 18, low: 42 },
      { x: 6.5, width: 17.5, low: 41 },
      { x: 24.5, width: 15.5, low: 35 },
    ]
      .map(
        ({ x, width, low }) =>
          `<path class="dw-hand-skin" fill="SKIN" d="M${x} 6C${x - 1} ${low - 10} ${x + 2} ${low} ${x + width / 2} ${low}C${x + width - 2} ${low} ${x + width + 1} ${low - 10} ${x + width} 6Z"/>`,
      )
      .join("");
    return `<path class="dw-hand-shadow" d="${back}" transform="translate(-5 6)"/>
<path class="dw-hand-skin" fill="SKIN" d="${back}"/>
${curled}
<path class="dw-creases" d="M-12.5 12V36M6 12V38M24.5 12V32"/>
<path class="dw-tendons" d="M-20-58L-22 6M-6-60L-6 8M8-60L10 8M22-58L26 6"/>
<path class="dw-knuckles" d="M-30 10Q-22 4-14 10M-12 12Q-3 6 6 12M6.5 12Q15 6 24 12M24.5 10Q31 5 39 9"/>
<path class="dw-hand-skin" fill="SKIN" d="M40-34C50-20 46 4 34 20C26 30 14 34 4 32C0 30 0 24 6 22C16 20 24 12 26 0C28-12 26-24 24-30Z"/>
<path class="dw-nail" d="M4 26C8 24 12 25 14 28C11 31 6 31 4 26Z"/>`;
  }

  /** A finger from its knuckle at (`x`, `y`), `long` and `wide`, leaning `lean` degrees toward
   * +x as it goes: a strip rounded at its tip, and the nail on it. */
  private static finger(
    x: number,
    y: number,
    long: number,
    wide: number,
    lean: number,
  ): { readonly shape: string; readonly nail: string } {
    const angle = (lean * Math.PI) / 180;
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);
    const half = wide / 2;
    // Across the finger, at its root and at its tip, narrowing a little.
    const across = { x: dy, y: -dx };
    const tip = { x: x + dx * long, y: y + dy * long };
    const end = half * 0.86;
    const round = (value: number): number => Math.round(value * 10) / 10;
    const point = (from: { x: number; y: number }, by: number): string =>
      `${round(from.x + across.x * by)} ${round(from.y + across.y * by)}`;
    const beyond = `${round(tip.x + dx * end * 1.25)} ${round(tip.y + dy * end * 1.25)}`;
    const shape = `<path class="dw-hand-skin" fill="SKIN" d="M${point({ x, y }, -half)}L${point(tip, -end)}Q${beyond} ${point(tip, end)}L${point({ x, y }, half)}Z"/>`;
    const nailAt = { x: tip.x - dx * 4, y: tip.y - dy * 4 };
    const nail = `<ellipse class="dw-nail" cx="${round(nailAt.x)}" cy="${round(nailAt.y)}" rx="${round(end * 0.62)}" ry="${round(end * 0.8)}" transform="rotate(${-lean} ${round(nailAt.x)} ${round(nailAt.y)})"/>`;
    return { shape, nail };
  }
}
