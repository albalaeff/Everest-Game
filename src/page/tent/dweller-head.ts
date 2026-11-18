import type { Spot } from "./dweller-pose";

/** A point of the head, in millimetres from its middle at the height of the eyes: across to the
 * viewer's right, down, and toward the viewer. */
interface Point extends Spot {
  readonly z: number;
}

/** A face's measurements, in millimetres, as a character's would be set (#264): what the drawing
 * is made from, so another face is another set of them. */
export interface Features {
  /** Half the face's width at the cheekbones, at the jaw's angle and at the chin. */
  readonly cheeks: number;
  readonly jaw: number;
  readonly chin: number;
  /** The eyes: how far each is from the middle, how wide and how open. */
  readonly eyes: { readonly apart: number; readonly wide: number; readonly open: number };
  /** The brows: how thick at their inner ends, and how high they arch. */
  readonly brows: { readonly thick: number; readonly arch: number };
  /** The nose: from its bridge to its tip, its width across the wings, and how far its tip
   * stands out from the face. */
  readonly nose: { readonly long: number; readonly wide: number; readonly out: number };
  /** The mouth's width, and how full the upper lip and the lower are. */
  readonly lips: { readonly wide: number; readonly upper: number; readonly lower: number };
  /** The ears' height; and the stubble, 0 for none to 1 for a week's. */
  readonly ears: number;
  readonly stubble: number;
}

/** A head's cross-section at a height: its half-width, its half-depth, and how far forward its
 * middle is. */
interface Section {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

/**
 * The head of the person in the tent (#264), drawn to life at a real head's size and proportions:
 * the eyes halfway down the head, the nose's base and the mouth a third and a half of the way on
 * to the chin, an eye's width between the eyes. It's a head in three dimensions, its cross-sections
 * from the crown to the chin, turned a little to the viewer's left, toward the stove (`TURN`), and
 * drawn as seen: the outline is the turned sections', and the face is drawn front on, in
 * millimetres from its measurements (`Features`), and wrapped round the head, so the far eye and
 * the far half of the mouth are narrower, the nose stands out over the far cheek and the near ear
 * shows. No outlines: light and shade tell the shapes apart, lit from above and the right, where
 * the lamp hangs, with soft shades for the eye sockets, the far side of the nose and what it
 * throws, under the lip and along the jaw. The face is a mountaineer's: a few days' stubble,
 * sunburn, and the paler band their goggles leave; the hat is a ribbed beanie, the hair under it.
 * The colours are the picture's variables (`--skin`, `--hair`, `--eyes`, `--hat`, ...). A pose
 * moves the lids, where the eyes look and how far the mouth is open (`lid`, `GAZE`, `open`).
 */
export class DwellerHead {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = 0.3;
  /** How far the head is turned to the viewer's left, in degrees. */
  static readonly TURN = 16;
  /** The player's climber's face. */
  static readonly CLIMBER: Features = {
    cheeks: 68,
    jaw: 56,
    chin: 21,
    eyes: { apart: 31, wide: 28, open: 9.5 },
    brows: { thick: 4.2, arch: 3 },
    nose: { long: 50, wide: 35, out: 24 },
    lips: { wide: 50, upper: 6.5, lower: 8.5 },
    ears: 60,
    stubble: 0.75,
  };
  /** How far the eyes can look each way, and how far the jaw drops, in millimetres. */
  static readonly GAZE = { x: 2.2, y: 1.3 };
  static readonly JAW = 8;
  /** The head's height above the eyes and below them: the crown's, and the chin's; and how far
   * behind the face's surface the eyes are, in their sockets. */
  private static readonly CROWN = -121;
  private static readonly CHIN = 119;
  private static readonly SOCKET = 7;
  /** Where the lips meet, from the head's middle, in the tent's pixels. */
  static readonly MOUTH: Spot = new DwellerHead("mouth").mouthAt();

  private readonly cos = Math.cos((DwellerHead.TURN * Math.PI) / 180);
  private readonly sin = Math.sin((DwellerHead.TURN * Math.PI) / 180);

  /** `id` names the head's clips and shadings, so two heads can be in one picture. */
  constructor(
    private readonly id: string,
    private readonly features: Features = DwellerHead.CLIMBER,
  ) {}

  /** The head's markup, in millimetres, scaled to the picture. Asleep, the eyes are shut and the
   * mouth a little open, for good. */
  markup(asleep = false): string {
    const { id } = this;
    return `<g transform="scale(${DwellerHead.SCALE})">
<defs>${this.defs()}</defs>
<path class="dw-skin" fill="url(#${id}-skin)" d="${this.outline()}"/>
<g clip-path="url(#${id}-face)">${this.shading()}${this.stubble()}${this.nape()}</g>
${this.eye(0, asleep)}${this.eye(1, asleep)}
${this.brows()}
${this.nose()}
${this.mouth(asleep)}
${this.ear()}
${this.sideburns()}
${this.hat()}
</g>`;
  }

  /** An eye's upper lid, `open` of the way open, 0 shut: the skin over the eye above its edge,
   * and the edge, its lashes, which comes down from the opening's upper edge to its lower one,
   * as a lid does. `0` is the near eye, on the viewer's right, `1` the far one. */
  lid(index: 0 | 1, open: number): { readonly skin: string; readonly edge: string } {
    const share = Math.min(1, Math.max(0, open));
    const { upper, lower } = this.opening(index);
    const edge = upper.map((point, at) => {
      const under = lower[at] ?? point;
      return {
        x: under.x + (point.x - under.x) * share,
        y: under.y + (point.y - under.y) * share,
      };
    });
    const first = edge[0] ?? { x: 0, y: 0 };
    const last = edge[edge.length - 1] ?? first;
    const top = Math.min(...edge.map(({ y }) => y)) - 14;
    const t = (value: number): string => DwellerHead.text(value);
    const curve = DwellerHead.curve(edge);
    return {
      skin: `${curve}L${t(last.x)} ${t(top)}L${t(first.x)} ${t(top)}Z`,
      edge: curve,
    };
  }

  /** The mouth `share` open, 0 shut: how its dark is stretched down from where the lips meet,
   * and how far the lower lip drops with the jaw. */
  open(share: number): { readonly mouth: string; readonly jaw: string } {
    const wide = Math.min(1, Math.max(0, share));
    const { x, y } = this.at(0, this.lipsMeet());
    const t = (value: number): string => DwellerHead.text(value);
    return {
      mouth: `translate(${t(x)} ${t(y)}) scale(1 ${wide.toFixed(3)}) translate(${t(-x)} ${t(-y)})`,
      jaw: `translate(0 ${(wide * DwellerHead.JAW).toFixed(2)})`,
    };
  }

  /** Where the lips meet, in the tent's pixels from the head's middle. */
  private mouthAt(): Spot {
    const { x, y } = this.at(0, this.lipsMeet());
    return { x: x * DwellerHead.SCALE, y: y * DwellerHead.SCALE };
  }

  private lipsMeet(): number {
    return 66 + this.features.lips.upper * 0.3;
  }

  // The head in three dimensions.

  /** The head's cross-section at height `y`: the skull's above the cheekbones, the face's bones
   * below, narrowing to the chin and coming forward as they do. */
  private section(y: number): Section {
    const { cheeks, jaw, chin } = this.features;
    const table: readonly (readonly [number, number, number, number])[] = [
      [DwellerHead.CROWN, 10, 14, -8],
      [-112, 44, 60, -8],
      [-92, 66, 86, -8],
      [-62, 75, 97, -8],
      [-30, 77, 99, -7],
      [0, 74, 95, -5],
      [20, cheeks, 86, 0],
      [45, cheeks - 4, 74, 10],
      [68, (cheeks - 4 + jaw) / 2 + 1, 61, 20],
      [86, jaw, 52, 28],
      [100, (jaw + chin) / 2 + 3, 42, 38],
      [110, chin + 8, 34, 46],
      [116, chin - 2, 24, 54],
      [DwellerHead.CHIN, chin * 0.35, 14, 60],
    ];
    const below = table.findIndex(([height]) => height >= y);
    const after = below < 0 ? table[table.length - 1] : table[below];
    const before = below <= 0 ? after : table[below - 1];
    if (after === undefined || before === undefined) {
      return { a: 0, b: 0, c: 0 };
    }
    const span = after[0] - before[0];
    const share = span === 0 ? 0 : Math.min(1, Math.max(0, (y - before[0]) / span));
    const mix = (from: number, to: number): number => from + (to - from) * share;
    return {
      a: mix(before[1], after[1]),
      b: mix(before[2], after[2]),
      c: mix(before[3], after[3]),
    };
  }

  /** How far forward the face's front is at a point of it: broader than the skull's curve over
   * the face, and coming round to it at the sides. */
  private surface(x: number, y: number): number {
    const { a, b, c } = this.section(y);
    const out = Math.min(1, Math.max(0, (Math.abs(x) / Math.max(a, 1) - 0.5) / 0.5));
    const side = out * out * (3 - 2 * out);
    const share = Math.min(1, Math.abs(x) / (a * (1.15 - 0.15 * side)));
    return c + b * Math.sqrt(1 - share * share);
  }

  /** A point of the face, drawn front on at (`x`, `y`), wrapped round the head and turned:
   * `back` millimetres behind the face's surface. */
  private at(x: number, y: number, back = 0): Spot {
    return this.seen({ x, y, z: this.surface(x, y) - back });
  }

  /** A point as the turned head shows it. */
  private seen({ x, y, z }: Point): Spot {
    return { x: x * this.cos - z * this.sin, y };
  }

  /** How wide something on the face at (`x`, `y`) looks for each millimetre it's wide front on. */
  private across(x: number, y: number): number {
    return Math.abs(this.at(x + 0.5, y).x - this.at(x - 0.5, y).x);
  }

  /** Where the head's outline is at height `y`, on its far side (-1) or its near one (1). */
  private edge(y: number, side: 1 | -1): Spot {
    const { a, b, c } = this.section(y);
    const wide = Math.sqrt(a * a * this.cos * this.cos + b * b * this.sin * this.sin);
    return { x: -c * this.sin + side * wide, y };
  }

  /** The head's outline as seen: each section's turned width down the far side, and back up the
   * near one. */
  private outline(): string {
    const heights: number[] = [];
    for (let y = DwellerHead.CROWN; y < DwellerHead.CHIN; y += 6) {
      heights.push(y);
    }
    heights.push(DwellerHead.CHIN);
    const far = heights.map((y) => this.edge(y, -1));
    const near = [...heights].reverse().map((y) => this.edge(y, 1));
    return DwellerHead.closed([...far, ...near]);
  }

  // The face.

  private defs(): string {
    const { id } = this;
    const soft = (name: string, colour: string, alpha: number): string =>
      `<radialGradient id="${id}-${name}"><stop offset="0" stop-color="${colour}" stop-opacity="${alpha}"/><stop offset="0.55" stop-color="${colour}" stop-opacity="${(alpha * 0.45).toFixed(3)}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
    return `<radialGradient id="${id}-skin" cx="0.62" cy="0.4" r="0.7" fx="0.68" fy="0.32">
<stop offset="0" class="dw-skin-light"/><stop offset="0.45" class="dw-skin-base"/><stop offset="0.85" class="dw-skin-shade"/><stop offset="1" class="dw-skin-deep"/></radialGradient>
<linearGradient id="${id}-far" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="dw-shade-on" stop-opacity="0.5"/><stop offset="0.22" class="dw-shade-on" stop-opacity="0.16"/><stop offset="0.4" class="dw-shade-on" stop-opacity="0"/></linearGradient>
${soft("dark", "#2a1209", 0.34)}
${soft("light", "#fff4e8", 0.3)}
${soft("burn", "#c43a28", 0.2)}
${soft("pale", "#f3d2b4", 0.42)}
<radialGradient id="${id}-white" cx="0.5" cy="0.1" r="0.95"><stop offset="0" stop-color="#7d6a5e"/><stop offset="0.5" stop-color="#d6ccc2"/><stop offset="1" stop-color="#ebe4dc"/></radialGradient>
<radialGradient id="${id}-iris"><stop offset="0" class="dw-iris-in"/><stop offset="0.55" class="dw-iris-mid"/><stop offset="1" class="dw-iris-out"/></radialGradient>
<linearGradient id="${id}-hat" x1="0.1" y1="1" x2="0.8" y2="0"><stop offset="0" class="dw-hat-shade"/><stop offset="0.55" class="dw-hat-base"/><stop offset="1" class="dw-hat-light"/></linearGradient>
<linearGradient id="${id}-upper-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dw-lip-shade"/><stop offset="1" class="dw-lip-base"/></linearGradient>
<linearGradient id="${id}-lower-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dw-lip-base"/><stop offset="0.55" class="dw-lip-light"/><stop offset="1" class="dw-lip-base"/></linearGradient>
<pattern id="${id}-hairs" width="9" height="9" patternUnits="userSpaceOnUse">${DwellerHead.hairs()}</pattern>
<filter id="${id}-soften" x="-0.3" y="-0.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="3"/></filter>
<mask id="${id}-beard"><path fill="#fff" filter="url(#${id}-soften)" d="${this.beardArea()}"/></mask>
<clipPath id="${id}-face"><path d="${this.outline()}"/></clipPath>
<clipPath id="${id}-eye0"><path d="${this.eyeOpening(0)}"/></clipPath>
<clipPath id="${id}-eye1"><path d="${this.eyeOpening(1)}"/></clipPath>`;
  }

  /** A soft spot of light or shade on the face, wrapped round it as the face is. */
  private spot(fill: string, x: number, y: number, rx: number, ry: number, turn = 0): string {
    const at = this.at(x, y);
    const t = (value: number): string => DwellerHead.text(value);
    const turned = turn === 0 ? "" : ` transform="rotate(${turn} ${t(at.x)} ${t(at.y)})"`;
    return `<ellipse fill="url(#${this.id}-${fill})" cx="${t(at.x)}" cy="${t(at.y)}" rx="${t(rx * this.across(x, y))}" ry="${t(ry)}"${turned}/>`;
  }

  /** Light and shade on the face, clipped to it: the goggles' paler band, the sunburn below it
   * and on the nose; the far side's shade; the eye sockets and the cheeks' hollows; the lit near
   * cheekbone, forehead and chin; under the lower lip and along the jaw. */
  private shading(): string {
    const { apart } = this.features.eyes;
    return `${this.spot("pale", 0, -3, 92, 22)}
${this.spot("burn", 40, 28, 18, 14)}
${this.spot("burn", -40, 28, 16, 14)}
${this.spot("burn", 0, 30, 14, 18)}
<rect fill="url(#${this.id}-far)" x="-90" y="-130" width="190" height="260"/>
${this.spot("dark", apart, -2, 19, 11)}
${this.spot("dark", -apart, -2, 19, 11)}
${this.spot("dark", 15, 1, 6, 7)}
${this.spot("dark", -15, 1, 6, 7)}
${this.spot("dark", 50, 52, 12, 24, -12)}
${this.spot("dark", -50, 52, 12, 24, 12)}
${this.spot("light", 44, 16, 16, 9, -10)}
${this.spot("light", 6, -34, 34, 9)}
${this.spot("light", 6, 101, 11, 7)}
${this.spot("dark", 0, 86, 15, 4)}
${this.spot("dark", 30, 108, 26, 9, -30)}
${this.spot("dark", -30, 108, 22, 9, 30)}`;
  }

  /** A few days' stubble: darker, cooler skin over the jaw, the chin and the upper lip, fading at
   * its edges, with the hairs' grain. */
  private stubble(): string {
    const { stubble } = this.features;
    if (stubble <= 0) {
      return "";
    }
    const area = this.beardArea();
    return `<g mask="url(#${this.id}-beard)" opacity="${stubble.toFixed(2)}"><path class="dw-stubble" d="${area}"/><path fill="url(#${this.id}-hairs)" d="${area}"/></g>`;
  }

  /** Where the stubble grows: the jaw from the sideburns, the lower cheeks to their line, the
   * chin and the upper lip under the nose, round the lips. */
  private beardArea(): string {
    const half = this.features.lips.wide / 2;
    const front: readonly (readonly [number, number])[] = [
      [70, 12],
      [64, 34],
      [50, 44],
      [34, 52],
      [half + 2, 58],
      [16, 55],
      [6, 54],
      [-6, 54],
      [-16, 55],
      [-half - 2, 58],
      [-34, 52],
      [-50, 44],
      [-64, 34],
      [-70, 12],
      [-66, 64],
      [-54, 92],
      [-34, 112],
      [0, 122],
      [34, 112],
      [54, 92],
      [66, 64],
    ];
    return DwellerHead.closed(front.map(([x, y]) => this.at(x, y)));
  }

  /** The hair at the back of the head under the hat, behind the near ear down to the nape. */
  private nape(): string {
    const ear = this.seen({ x: 70, y: 0, z: -4 });
    return `<path class="dw-hair" d="${DwellerHead.closed([
      { x: ear.x + 4, y: -16 },
      { x: ear.x + 6, y: 20 },
      { x: ear.x + 12, y: 44 },
      { x: this.edge(50, 1).x + 2, y: 50 },
      { x: this.edge(20, 1).x + 2, y: 20 },
      { x: this.edge(-16, 1).x + 2, y: -16 },
    ])}"/>`;
  }

  // The eyes.

  /** An eye's opening as the turned head shows it: its upper edge and its lower one, each from
   * the inner corner to the outer, with as many points, so a lid can come down from one to the
   * other. */
  private opening(index: 0 | 1): { readonly upper: Spot[]; readonly lower: Spot[] } {
    const { apart, wide, open } = this.features.eyes;
    const side = index === 0 ? 1 : -1;
    const half = wide / 2;
    const tall = open / 9.5;
    // From the inner corner, by the nose, to the outer: the upper edge highest a little inward
    // of the middle, the lower lowest a little outward, the outer corner a touch higher.
    const upper: readonly (readonly [number, number])[] = [
      [-half, 1],
      [-half + 3.2, -2.6],
      [-4.5, -5.2],
      [2, -5.5],
      [8, -4.2],
      [half - 1.5, -1.6],
      [half, -0.6],
    ];
    const lower: readonly (readonly [number, number])[] = [
      [-half, 1],
      [-half + 3.6, 2.7],
      [-5, 4],
      [1, 4.5],
      [7, 3.9],
      [half - 2.2, 2],
      [half, -0.6],
    ];
    const place = ([x, y]: readonly [number, number]): Spot =>
      this.at(side * (apart + x), y * tall, DwellerHead.SOCKET);
    return { upper: upper.map(place), lower: lower.map(place) };
  }

  private eyeOpening(index: 0 | 1): string {
    const { upper, lower } = this.opening(index);
    return DwellerHead.closed([...upper, ...[...lower].reverse().slice(1, -1)]);
  }

  /** An eye: the white, shaded under the lid; the iris, its dark ring, the pupil and the light in
   * it, which look about together (`GAZE`); the upper lid, which comes down over it to blink, its
   * lashes along its edge; the pink inner corner, the crease over it and the line under it. */
  private eye(index: 0 | 1, asleep: boolean): string {
    const { id } = this;
    const { apart } = this.features.eyes;
    const side = index === 0 ? 1 : -1;
    const centre = this.at(side * apart, -0.6, DwellerHead.SOCKET);
    const narrow = this.across(side * apart, 0);
    const lid = this.lid(index, asleep ? 0 : 1);
    const { upper, lower } = this.opening(index);
    const t = (value: number): string => DwellerHead.text(value);
    const iris = 5.4;
    const crease = DwellerHead.curve(
      upper
        .slice(1, -1)
        .map(({ x, y }, at) => ({ x, y: y - 3.2 - Math.sin((at / 4) * Math.PI) * 0.8 })),
    );
    const under = DwellerHead.curve(lower.slice(1, -1).map(({ x, y }) => ({ x, y: y + 2.2 })));
    const inner = upper[0] ?? centre;
    const ellipse = (kind: string, rx: number, ry: number, dx = 0, dy = 0): string =>
      `<ellipse class="${kind}" cx="${t(centre.x + dx * narrow)}" cy="${t(centre.y + dy)}" rx="${t(rx * narrow)}" ry="${t(ry)}"/>`;
    return `<g class="dw-eye" data-eye="${index}">
<path class="dw-white" fill="url(#${id}-white)" d="${this.eyeOpening(index)}"/>
<g clip-path="url(#${id}-eye${index})">
<g class="dw-gaze"><ellipse fill="url(#${id}-iris)" class="dw-iris" cx="${t(centre.x)}" cy="${t(centre.y)}" rx="${t(iris * narrow)}" ry="${t(iris)}"/>${ellipse("dw-iris-ring", iris, iris)}${ellipse("dw-pupil", 2.1, 2.1)}${ellipse("dw-glint", 0.95, 0.95, 1.7, -1.8)}</g>
<path class="dw-lid-shade" d="${DwellerHead.curve(upper.map(({ x, y }) => ({ x, y: y + 1.4 })))}"/>
<path class="dw-lid-skin" data-lid="${index}" d="${lid.skin}"/>
</g>
<path class="dw-lid-edge" data-lid-edge="${index}" d="${lid.edge}"/>
<circle class="dw-caruncle" cx="${t(inner.x - side * 0.9 * narrow)}" cy="${t(inner.y + 0.2)}" r="1.1"/>
<path class="dw-crease" d="${crease}"/>
<path class="dw-under" d="${under}"/>
</g>`;
  }

  /** The brows: thick at their inner ends over the nose, arched over the eyes and tapering out to
   * their tails, in the hair's colour. */
  private brows(): string {
    const { apart, wide } = this.features.eyes;
    const { thick, arch } = this.features.brows;
    const half = wide / 2;
    const spine: readonly (readonly [number, number, number])[] = [
      [-half + 1.5, -13.8, thick],
      [-6, -17 - arch * 0.55, thick * 0.92],
      [3, -18.2 - arch, thick * 0.78],
      [11, -16.6 - arch * 0.6, thick * 0.5],
      [half + 5, -12, 0.7],
    ];
    const brow = (side: 1 | -1): string => {
      const top = spine.map(([x, y, t]) => this.at(side * (apart + x), y - t / 2, 1));
      const bottom = [...spine]
        .reverse()
        .map(([x, y, t]) => this.at(side * (apart + x), y + t / 2, 1));
      return `<path class="dw-brow" d="${DwellerHead.closed([...top, ...bottom])}"/>`;
    };
    return `${brow(1)}${brow(-1)}`;
  }

  // The nose and the mouth.

  /** The nose: the shade on its far side and what it throws on the far cheek, the light along its
   * bridge and on its tip, its wings, the nostrils under it, its shadow on the lip, and the folds
   * from its wings down past the mouth. */
  private nose(): string {
    const { id, features } = this;
    const { long, wide, out } = features.nose;
    const front = (y: number): number => this.surface(0, y);
    const tipY = -10 + long;
    const point = (x: number, y: number, z: number): Spot => this.seen({ x, y, z });
    const bridge = point(0, -9, front(-9) - 4);
    const ridge = point(0, 14, front(14) + out * 0.42);
    const tip = point(0, tipY, front(tipY) + out);
    const under = point(0, tipY + 7, front(tipY + 7) + out * 0.55);
    const base = point(0, tipY + 10, front(tipY + 10) + 3);
    const wing = (side: 1 | -1): Spot => point((side * wide) / 2, tipY + 4, front(tipY + 4) - 1);
    const t = (value: number): string => DwellerHead.text(value);
    const nearWing = wing(1);
    const farWing = wing(-1);
    // The far side of the nose, from the bridge down its ridge to the tip and the far wing, and
    // back up the cheek beside it, in shade.
    const side = DwellerHead.closed([
      bridge,
      ridge,
      { x: tip.x + 1, y: tip.y },
      under,
      farWing,
      this.at(-14, 20),
      this.at(-9, -2),
    ]);
    const narrow = this.across(0, tipY + 6);
    const nostril = (x: number, rx: number, turn: number): string => {
      const at = point(x, tipY + 8.5, front(tipY + 8.5) + out * 0.28);
      return `<ellipse class="dw-nostril" cx="${t(at.x)}" cy="${t(at.y)}" rx="${t(rx * narrow)}" ry="1.5" transform="rotate(${turn} ${t(at.x)} ${t(at.y)})"/>`;
    };
    const wingLine = (side: 1 | -1): string => {
      const w = (side * wide) / 2;
      return DwellerHead.curve([
        point(w * 0.7, tipY - 6, front(tipY - 6) + 2),
        point(w * 1.02, tipY + 1, front(tipY + 1)),
        point(w * 0.95, tipY + 7, front(tipY + 7) + 1),
        point(w * 0.55, tipY + 9.5, front(tipY + 9.5) + 3),
      ]);
    };
    const fold = (side: 1 | -1): string =>
      DwellerHead.curve([
        this.at(side * (wide / 2 + 2), tipY + 2),
        this.at(side * (wide / 2 + 7), tipY + 14),
        this.at(side * (features.lips.wide / 2 + 5), 72),
      ]);
    const shadow = this.at(-5, tipY + 16);
    return `<g class="dw-nose">
<path fill="url(#${id}-dark)" d="${side}"/>
<ellipse fill="url(#${id}-dark)" cx="${t(shadow.x)}" cy="${t(shadow.y)}" rx="${t(13 * this.across(-5, tipY + 16))}" ry="4.2"/>
<path class="dw-nose-bridge" d="${DwellerHead.curve([point(2.5, -3, front(-3) - 2), point(2.8, 14, front(14) + out * 0.42), point(2.4, tipY - 6, front(tipY - 6) + out * 0.8)])}"/>
<path class="dw-nose-under" d="${DwellerHead.closed([farWing, under, nearWing, base])}"/>
<path class="dw-nose-wing" d="${wingLine(1)}"/>
<path class="dw-nose-wing far" d="${wingLine(-1)}"/>
${nostril(5.6, 3.1, -14)}${nostril(-5.4, 2.4, 14)}
<ellipse fill="url(#${id}-light)" cx="${t(tip.x + 1.6)}" cy="${t(tip.y - 2.6)}" rx="${t(5.5 * narrow)}" ry="4.2"/>
<ellipse class="dw-nose-glint" cx="${t(tip.x + 1.2)}" cy="${t(tip.y - 2.2)}" rx="${t(1.5 * narrow)}" ry="1.1"/>
<path class="dw-fold" d="${fold(1)}"/>
<path class="dw-fold far" d="${fold(-1)}"/>
</g>`;
  }

  /** The mouth: the upper lip in shade, the lower one lit, the line between them darker at the
   * corners; open, the dark of the mouth and the upper teeth, and the lower lip dropping with the
   * jaw (`open`). */
  private mouth(asleep: boolean): string {
    const { id, features } = this;
    const { wide, upper, lower } = features.lips;
    const half = wide / 2;
    const meet = this.lipsMeet();
    // The lips stand a little out of the face in the middle, and the corners sink into it.
    const depth = (x: number): number => -2.5 + (Math.abs(x) / half) ** 2 * 6;
    const lip = (points: readonly (readonly [number, number])[]): Spot[] =>
      points.map(([x, y]) => this.at(x, y, depth(x)));
    const line = lip([
      [-half, meet],
      [-half * 0.55, meet + 0.9],
      [0, meet + 0.6],
      [half * 0.55, meet + 0.9],
      [half, meet],
    ]);
    const bow = lip([
      [half * 0.7, meet - upper * 0.55],
      [half * 0.22, meet - upper],
      [0, meet - upper * 0.82],
      [-half * 0.22, meet - upper],
      [-half * 0.7, meet - upper * 0.55],
    ]);
    const chin = lip([
      [half * 0.62, meet + lower * 0.62],
      [0, meet + lower],
      [-half * 0.62, meet + lower * 0.62],
    ]);
    const inside = lip([
      [half * 0.55, meet + 5],
      [0, meet + 7],
      [-half * 0.55, meet + 5],
    ]);
    const teeth = DwellerHead.closed([
      ...lip([
        [-half * 0.62, meet + 0.6],
        [0, meet + 0.4],
        [half * 0.62, meet + 0.6],
      ]),
      ...lip([
        [half * 0.55, meet + 2.6],
        [0, meet + 3],
        [-half * 0.55, meet + 2.6],
      ]),
    ]);
    const { mouth, jaw } = this.open(asleep ? 0.16 : 0);
    const t = (value: number): string => DwellerHead.text(value);
    const corner = (x: number): string => {
      const at = this.at(x, meet + 0.4, depth(x));
      return `<circle class="dw-corner" cx="${t(at.x)}" cy="${t(at.y)}" r="1.4"/>`;
    };
    const lit = this.at(half * 0.18, meet + lower * 0.55, depth(0));
    return `<g class="dw-mouth">
<g class="dw-open" transform="${mouth}"><path class="dw-mouth-inside" d="${DwellerHead.closed([...line, ...inside])}"/><path class="dw-teeth" d="${teeth}"/></g>
<path class="dw-lip-upper" fill="url(#${id}-upper-lip)" d="${DwellerHead.closed([...line, ...bow])}"/>
<g class="dw-jaw" transform="${jaw}"><path class="dw-lip-lower" fill="url(#${id}-lower-lip)" d="${DwellerHead.closed([...line, ...chin])}"/><ellipse fill="url(#${id}-light)" cx="${t(lit.x)}" cy="${t(lit.y)}" rx="${t(9 * this.across(0, meet))}" ry="2.4"/></g>
<path class="dw-lips-line" d="${DwellerHead.curve(line)}"/>
${corner(half)}${corner(-half)}
</g>`;
  }

  // The ear, the hair and the hat.

  /** The near ear, seen from a little in front: its rim, the fold inside it and the hollow, warm
   * with the sun. */
  private ear(): string {
    const tall = this.features.ears / 60;
    // In the ear's own frame: millimetres back from its front edge, and down from its top.
    const shape: readonly (readonly [number, number])[] = [
      [0, 8],
      [4, 0],
      [16, -2],
      [26, 6],
      [30, 20],
      [27, 36],
      [20, 48],
      [12, 58],
      [5, 60],
      [1, 54],
      [3, 44],
      [1, 30],
    ];
    const fold: readonly (readonly [number, number])[] = [
      [8, 10],
      [18, 8],
      [22, 20],
      [18, 36],
      [12, 44],
    ];
    const hollow: readonly (readonly [number, number])[] = [
      [6, 22],
      [14, 18],
      [17, 28],
      [12, 40],
      [6, 38],
    ];
    // The ear stands out from the side of the head, turned a little forward: seen at the turn,
    // it's narrowed as much.
    const narrow = Math.cos(((65 - DwellerHead.TURN) * Math.PI) / 180);
    const root = this.seen({ x: 70, y: -6, z: -4 });
    const place = ([back, down]: readonly [number, number]): Spot => ({
      x: root.x + back * narrow,
      y: root.y + down * tall,
    });
    return `<g class="dw-ear-all">
<path class="dw-ear" d="${DwellerHead.closed(shape.map(place))}"/>
<path class="dw-ear-hollow" d="${DwellerHead.closed(hollow.map(place))}"/>
<path class="dw-ear-rim" d="${DwellerHead.curve(fold.map(place))}"/>
</g>`;
  }

  /** The sideburns before the ears, from under the hat: in three dimensions, as the ears are, the
   * far one at the edge of the face. */
  private sideburns(): string {
    const strip = (side: 1 | -1): string =>
      DwellerHead.closed(
        (
          [
            [66, -10, 30],
            [70, -10, 12],
            [70, 10, 10],
            [68, 17, 18],
            [67, 6, 26],
          ] as const
        ).map(([x, y, z]) => this.seen({ x: side * x, y, z })),
      );
    return `<path class="dw-sideburn" d="${strip(1)}"/><path class="dw-sideburn" d="${strip(-1)}"/>`;
  }

  /** The fleece hat on the skull: its crown, lit from above and the right, and its ribbed cuff
   * folded up over the forehead and the ears' tops, low at the back; the shade it throws on the
   * forehead. */
  private hat(): string {
    const { id } = this;
    const turn = (DwellerHead.TURN * Math.PI) / 180;
    // Round the visible half of the head, from the far side to the near.
    const around = Array.from(
      { length: 25 },
      (_, step) => turn - Math.PI / 2 + (step / 24) * Math.PI,
    );
    const on = (angle: number, height: number, out: number): Spot => {
      const { a, b, c } = this.section(height);
      return this.seen({
        x: (a + out) * Math.sin(angle),
        y: height,
        z: c + (b + out) * Math.cos(angle),
      });
    };
    // How far up the cuff's lower edge is round the head: over the forehead, down over the ears'
    // tops, lower at the back.
    const low = (angle: number): number => -38 + 34 * (1 - Math.cos(angle)) ** 0.9;
    const high = (angle: number): number => low(angle) - 30;
    const cuff = around.map((angle) => on(angle, low(angle), 6));
    const fold = around.map((angle) => on(angle, high(angle), 8));
    const top = (y: number, side: 1 | -1): Spot => {
      const { a, b, c } = this.section(y);
      const wide = Math.sqrt((a + 7) ** 2 * this.cos ** 2 + (b + 7) ** 2 * this.sin ** 2);
      return { x: -c * this.sin + side * wide, y: y - 4 };
    };
    const firstCuff = cuff[0] ?? { x: -80, y: -10 };
    const lastCuff = cuff[cuff.length - 1] ?? { x: 80, y: -10 };
    const heights = [-12, -30, -50, -70, -90, -106, -116, DwellerHead.CROWN];
    const farCrown = heights.filter((y) => y < firstCuff.y).map((y) => top(y, -1));
    const nearCrown = [...heights]
      .reverse()
      .filter((y) => y < lastCuff.y)
      .map((y) => top(y, 1));
    const crown = DwellerHead.closed([...[...cuff].reverse(), ...farCrown, ...nearCrown]);
    const band = DwellerHead.closed([...cuff, ...[...fold].reverse()]);
    const t = (value: number): string => DwellerHead.text(value);
    const ribs = around
      .map((angle) => {
        const from = on(angle, low(angle) - 1.5, 6.5);
        const to = on(angle, high(angle) + 1.5, 8);
        return `M${t(from.x)} ${t(from.y)}L${t(to.x)} ${t(to.y)}`;
      })
      .join("");
    const shade = DwellerHead.closed([
      ...cuff.map(({ x, y }) => ({ x, y: y + 7 })),
      ...[...cuff].reverse().map(({ x, y }) => ({ x, y: y - 2 })),
    ]);
    const wrinkle = DwellerHead.curve(
      around
        .slice(4, -4)
        .map((angle) => on(angle, high(angle) - 34 + 10 * (1 - Math.cos(angle)), 7)),
    );
    return `<g class="dw-hat-all">
<path class="dw-hat-shadow" d="${shade}" filter="url(#${id}-soften)"/>
<path class="dw-hat" fill="url(#${id}-hat)" d="${crown}"/>
<path class="dw-hat-crown" d="${wrinkle}"/>
<path class="dw-hat-cuff" fill="url(#${id}-hat)" d="${band}"/>
<path class="dw-hat-ribs" d="${ribs}"/>
<path class="dw-hat-fold" d="${DwellerHead.curve(fold)}"/>
</g>`;
  }

  // Paths.

  /** A smooth curve through `points`, as a path: Catmull-Rom, as cubic Béziers. */
  private static curve(points: readonly Spot[]): string {
    return DwellerHead.through(points, false);
  }

  /** A smooth closed shape through `points`. */
  private static closed(points: readonly Spot[]): string {
    return `${DwellerHead.through(points, true)}Z`;
  }

  private static through(points: readonly Spot[], closed: boolean): string {
    const t = (value: number): string => DwellerHead.text(value);
    const count = points.length;
    const first = points[0];
    if (first === undefined) {
      return "";
    }
    const pick = (at: number): Spot => {
      const index = closed ? (at + count) % count : Math.min(count - 1, Math.max(0, at));
      return points[index] ?? first;
    };
    let path = `M${t(first.x)} ${t(first.y)}`;
    const segments = closed ? count : count - 1;
    for (let at = 0; at < segments; at += 1) {
      const p0 = pick(at - 1);
      const p1 = pick(at);
      const p2 = pick(at + 1);
      const p3 = pick(at + 2);
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      path += `C${t(c1.x)} ${t(c1.y)} ${t(c2.x)} ${t(c2.y)} ${t(p2.x)} ${t(p2.y)}`;
    }
    return path;
  }

  /** The stubble's hairs in a tile: short dark dots scattered, the same each time. */
  private static hairs(): string {
    let seed = 7;
    const next = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return Array.from({ length: 46 }, () => {
      const x = next() * 9;
      const y = next() * 9;
      const r = 0.2 + next() * 0.22;
      return `<circle class="dw-hairs" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`;
    }).join("");
  }

  private static text(value: number): string {
    return String(Math.round(value * 100) / 100);
  }
}
