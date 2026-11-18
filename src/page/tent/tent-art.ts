import { DwellerHead } from "./dweller-head";
import { CampSigns } from "../../rendering/camp-signs";
import type { TentSizes } from "../../rendering/camp-signs";

/** A point of the picture, in its pixels. */
type Pixel = readonly [x: number, y: number];

/**
 * The drawing of a tent cut open from end to end, as SVG markup (#258): the picture's own art, in
 * its own pixels, 300 to the metre, the floor 640 down. Outside, the sky, the peaks, the other
 * expeditions' tents and the ground, rubble at Base Camp and snow above; the fly's far wall, grey
 * over the vestibules and gold over the room, with its poles' sleeves, its pockets, its loft, a
 * line of drying socks and the lamp; a door in the vestibule's far side, open to the weather
 * while the stove burns; the floor, the mats and the sleeping bag; the boots, the stove on its
 * board with its pot, the snow for it, the bottles, the meals, the gas, the pack, the guitar; and
 * the cut edge of the fly in front. It draws from the tent's own profile (`CampSigns.profile`),
 * so the room is as long and as high as the knowledge base has it. The person, and everything
 * that moves, is `TentPicture`'s; the colours and what moves by itself are the style sheet's.
 */
export class TentArt {
  /** The picture's box, the floor's height in it, its pixels a metre, and where the tent's
   * door's end stands on the ground. */
  static readonly VIEW = { width: 1400, height: 800 };
  static readonly FLOOR = 640;
  static readonly SCALE = 300;
  static readonly FROM = 150;
  /** The mats' thickness under whoever sits: the foam and the pad on it. Where the stove stands
   * in the vestibule, and how far into the room the person's seat is and the sleeping bag
   * begins. */
  static readonly SEAT = 44;
  static readonly STOVE = 402;
  static readonly SEAT_IN = 195;
  static readonly BAG_IN = 315;
  /** Where the lamp hangs from the roof. */
  static readonly LAMP = 752;
  /** What a hand takes and puts back, in pixels: a bottle's body and its cap, and how far into
   * the room the nearest stands, on the foam; a meal's pouch, and how far into the room the
   * nearest lies; the pot, from the stove's foot up to its bottom, its rim and its handle's
   * middle; the snow sack, how far into the room and how high its snow; the burner's flame over
   * the floor; a spoon's handle below where it's pinched, its neck and its bowl's tip above. */
  static readonly BOTTLE = { width: 31, height: 71, cap: 13, lift: 12 };
  static readonly BOTTLE_IN = 72;
  static readonly POUCH = { width: 50, height: 58 };
  static readonly MEALS_IN = 414;
  static readonly POT = { half: 30, bottom: 58, rim: 120, handle: 98 };
  static readonly SNOW = { into: 14, top: 68 };
  static readonly FLAME = 62;
  static readonly SPOON = { handle: 24, neck: 31, tip: 52 };
  /** The devices (#271), life size: the handheld radio's body and its antenna, and how far into
   * the room its base is, lying on the pad with its antenna away from the seat; the mesh pocket
   * on the wall by the door, from the room's front and up from the floor; the satellite
   * tracker's case and its antenna's cap, and where it stands in the pocket, from its corner;
   * the pocket weather meter's body and its impeller's ring; and the GPS watch's face. */
  static readonly RADIO = { width: 19, height: 38, antenna: 27 };
  static readonly RADIO_IN = 305;
  static readonly POCKET = { into: 44, up: 272, width: 96, height: 58 };
  static readonly TRACKER = { width: 16, height: 30, cap: 8 };
  static readonly TRACKER_IN = { x: 39, y: 32 };
  static readonly METER = { width: 13, height: 27, ring: 7 };
  static readonly WATCH = { face: 8, strap: 12 };

  /** The fly's outline in pixels; where the room begins and ends along the floor; and the top
   * of the fly over a point of the floor. */
  readonly outline: readonly Pixel[];
  readonly room: { readonly from: number; readonly to: number };
  readonly end: number;

  constructor(sizes: TentSizes) {
    const { FROM, SCALE, FLOOR } = TentArt;
    this.outline = CampSigns.profile(sizes).map(([along, up]): Pixel => [
      FROM + along * SCALE,
      FLOOR - up * SCALE,
    ]);
    const front = FROM + (sizes.vestibule + 0.02 * sizes.length) * SCALE;
    this.room = { from: front, to: FROM + (sizes.vestibule + 0.98 * sizes.length) * SCALE };
    this.end = FROM + (sizes.vestibule + sizes.length + sizes.tail) * SCALE;
  }

  /** How high the fly's top is over `x` of the floor, in the picture's pixels down. */
  roof(x: number): number {
    const { outline } = this;
    for (let index = 1; index < outline.length; index += 1) {
      const from = outline[index - 1];
      const to = outline[index];
      if (from !== undefined && to !== undefined && x >= from[0] && x <= to[0]) {
        const share = to[0] === from[0] ? 0 : (x - from[0]) / (to[0] - from[0]);
        return from[1] + (to[1] - from[1]) * share;
      }
    }
    return TentArt.FLOOR;
  }

  /** The whole picture's markup but the person. */
  markup(): string {
    return [
      this.defs(),
      `<g class="tent-outside">${this.outside()}</g>`,
      `<g class="tent-shell">${this.shell()}</g>`,
      `<g class="tent-floor">${this.floor()}</g>`,
      `<g class="tent-props">${this.props()}</g>`,
      `<g class="tent-sleeper" opacity="0">${this.sleeper()}</g>`,
      `<g class="tent-dweller"></g>`,
      `<g class="tent-air">${this.air()}</g>`,
      `<g class="tent-near">${this.near()}</g>`,
      `<g class="tent-light" clip-path="url(#tent-inside)">`,
      `<rect class="tent-night" x="0" y="0" width="1400" height="800"/>`,
      `<rect class="tent-dark" x="0" y="0" width="1400" height="800" fill="url(#tent-dusk)"/>`,
      `<circle class="tent-lamp-glow" cx="${TentArt.LAMP}" cy="330" r="420" fill="url(#tent-glow)"/>`,
      `<circle class="tent-flame-glow" cx="${TentArt.STOVE}" cy="560" r="170" fill="url(#tent-fire)"/>`,
      `</g>`,
    ].join("");
  }

  private path(points: readonly Pixel[], closed = true): string {
    const line = points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join("");
    return closed ? `${line}Z` : line;
  }

  /** The fly's outline lowered by so much, between two points of the floor: the canopy inside. */
  private canopy(from: number, to: number, lower: number): readonly Pixel[] {
    return this.outline.filter(([x]) => x > from && x < to).map(([x, y]): Pixel => [x, y + lower]);
  }

  private defs(): string {
    return `<defs>
<linearGradient id="tent-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="tent-sky-top"/><stop offset="1" class="tent-sky-low"/></linearGradient>
<linearGradient id="tent-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="tent-wall-top"/><stop offset="1" class="tent-wall-low"/></linearGradient>
<linearGradient id="tent-porch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a7183"/><stop offset="1" stop-color="#454b59"/></linearGradient>
<radialGradient id="tent-dusk" cx="${(TentArt.LAMP / TentArt.VIEW.width).toFixed(3)}" cy="0.4" r="0.62"><stop offset="0" stop-color="#0a1030" stop-opacity="0.12"/><stop offset="0.5" stop-color="#0a1030" stop-opacity="0.5"/><stop offset="1" stop-color="#060a20" stop-opacity="0.86"/></radialGradient>
<radialGradient id="tent-glow"><stop offset="0" stop-color="#ffe9b0" stop-opacity="0.5"/><stop offset="0.4" stop-color="#ffd27a" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
<radialGradient id="tent-fire"><stop offset="0" stop-color="#8fd0ff" stop-opacity="0.42"/><stop offset="1" stop-color="#8fd0ff" stop-opacity="0"/></radialGradient>
<pattern id="tent-mesh" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0H7M0 0V7" stroke="#2a2d36" stroke-width="1" opacity="0.55"/></pattern>
<clipPath id="tent-inside"><path d="${this.path(this.outline)}"/></clipPath>
</defs>`;
  }

  private outside(): string {
    const stars = Array.from({ length: 46 }, (_, index) => {
      const x = (index * 397) % 1900;
      const y = (index * 211) % 520;
      const r = 1 + ((index * 7) % 3) * 0.5;
      return `<circle cx="${x - 250}" cy="${y - 60}" r="${r}"/>`;
    }).join("");
    const flakes = Array.from({ length: 40 }, (_, index) => {
      const x = (index * 173) % 1800;
      const delay = -((index * 37) % 70) / 10;
      const size = 2 + (index % 3);
      return `<circle cx="${x - 200}" cy="-20" r="${size}" style="animation-delay:${delay}s"/>`;
    }).join("");
    const far = [-120, 60, 1420, 1560]
      .map(
        (x, index) =>
          `<g class="tent-far" transform="translate(${x} 640) scale(${0.52 + (index % 2) * 0.14})"><path class="tent-far-fly tone-${index}" d="M-170 0C-160 -62 -90 -112 0 -116C92 -112 150 -70 172 0Z"/><path class="tent-far-porch" d="M96 -78C140 -58 162 -30 172 0H112Z"/></g>`,
      )
      .join("");
    return `<rect x="-3000" y="-3000" width="7400" height="3640" fill="url(#tent-sky)"/>
<g class="tent-stars">${stars}</g>
<path class="tent-peak far" d="M-3000 640V470L-900 400L-620 330L-430 250L-300 300L-160 210L-40 130L50 190L150 250L300 180L420 240L520 300L700 250L900 330L1040 290L1180 200L1290 110L1380 180L1500 260L1700 310L2000 380L4400 440V640Z"/>
<path class="tent-peak-snow" d="M-160 210L-40 130L50 190L10 205L-40 170L-90 215ZM1180 200L1290 110L1380 180L1330 190L1290 150L1230 205Z"/>
<path class="tent-peak near" d="M-3000 640V560L-700 520L-420 470L-250 500L-90 440L60 490L210 520L380 470L560 520L760 500L980 530L1150 480L1300 430L1450 480L1650 520L2100 540L4400 570V640Z"/>
<g class="tent-far-row">${far}</g>
<rect class="tent-ground" x="-3000" y="640" width="7400" height="3000"/>
<g class="tent-rubble"><path d="M-260 640l14-18 26 2 12 16zM-60 640l10-12 20 1 8 11zM40 640l8-9 15 2 6 7zM1380 640l12-16 24 3 10 13zM1500 640l9-10 18 1 8 9zM1640 640l14-20 28 4 12 16z"/></g>
<g class="tent-drift"><path d="M-3000 640C-600 630 -200 626 -40 634C40 638 100 640 150 640ZM1360 640C1420 632 1500 624 1700 628C2200 632 3200 636 4400 640Z"/></g>
<g class="tent-flakes">${flakes}</g>`;
  }

  private shell(): string {
    const { FLOOR } = TentArt;
    const { from, to } = this.room;
    const front = this.outline.filter(([x]) => x <= from + 40);
    // The door in the vestibule's far side: an arch, and its flap.
    const arch = (inset: number): string => {
      const left = TentArt.FROM + 46 + inset;
      const right = from - 22 - inset;
      const middle = (left + right) / 2;
      const top = FLOOR - 236 + inset;
      return `M${left} ${FLOOR}C${left} ${top + 60} ${middle - 60} ${top} ${middle} ${top}C${middle + 60} ${top} ${right} ${top + 60} ${right} ${FLOOR}Z`;
    };
    const wall: Pixel[] = [
      [from, FLOOR],
      [from + 4, FLOOR - 150],
      [from + 22, FLOOR - 270],
      ...this.canopy(from + 30, to - 30, 16),
      [to - 22, FLOOR - 262],
      [to - 4, FLOOR - 150],
      [to, FLOOR],
    ];
    const roofAt = (x: number, lower = 16): number => this.roof(x) + lower;
    const sleeve = (fromX: number, bow: Pixel, toX: number): string =>
      `<path class="tent-sleeve" d="M${fromX} ${FLOOR}Q${bow[0]} ${bow[1]} ${toX} ${roofAt(toX).toFixed(1)}"/>`;
    const lineFrom: Pixel = [from + 86, roofAt(from + 86) + 62];
    const lineTo: Pixel = [to - 96, roofAt(to - 96) + 70];
    const lineMid: Pixel = [(lineFrom[0] + lineTo[0]) / 2, (lineFrom[1] + lineTo[1]) / 2 + 26];
    const loft = { from: 870, to: 1050 };
    return `<path class="tent-porch-wall" fill-rule="evenodd" d="${this.path(this.outline)}${arch(0)}"/>
<g class="tent-door"><path class="tent-flap" d="${arch(3)}"/><path class="tent-zip" d="${arch(8)}" /></g>
<path class="tent-porch-seam" d="${this.path(front, false)}"/>
<path class="tent-room-wall" d="${this.path(wall)}" fill="url(#tent-wall)"/>
<g class="tent-wind">
${sleeve(from + 26, [from + 150, 330], 800)}
${sleeve(to - 26, [to - 150, 330], 850)}
${sleeve(from + 190, [from + 330, 400], 1040)}
${sleeve(to - 190, [to - 330, 400], 610)}
<path class="tent-seam" d="M${from + 6} ${FLOOR - 120}Q825 ${FLOOR - 150} ${to - 6} ${FLOOR - 120}"/>
</g>
<path class="tent-inner-door" d="M${from} ${FLOOR}C${from + 2} ${FLOOR - 160} ${from + 14} ${FLOOR - 250} ${from + 40} ${roofAt(from + 40).toFixed(1)}"/>
<path class="tent-door-roll" d="M${from + 14} ${roofAt(from + 30) + 26}q16 -10 30 2q4 12 -8 18q-16 2 -22 -20z"/>
<g class="tent-pocket" transform="translate(${from + TentArt.POCKET.into} ${FLOOR - TentArt.POCKET.up})"><rect width="${TentArt.POCKET.width}" height="${TentArt.POCKET.height}" rx="6" fill="#d19a36"/><rect x="8" y="14" width="16" height="38" rx="5" fill="#f2f2ee"/><rect x="8" y="14" width="16" height="9" rx="3" fill="#e08a2c"/><g class="tent-tracker" transform="translate(${TentArt.TRACKER_IN.x} ${TentArt.TRACKER_IN.y})">${TentArt.tracker()}</g><rect y="22" width="${TentArt.POCKET.width}" height="${TentArt.POCKET.height - 22}" rx="6" fill="#d19a36" opacity="0.5"/><rect width="${TentArt.POCKET.width}" height="${TentArt.POCKET.height}" rx="6" fill="url(#tent-mesh)"/><rect x="58" y="26" width="30" height="20" rx="6" fill="#2b2f39"/><circle cx="73" cy="36" r="6.5" fill="#dfe8f2"/></g>
<g class="tent-pocket" transform="translate(${to - 132} ${FLOOR - 190})"><rect width="92" height="54" rx="6" fill="#d19a36"/><rect width="92" height="54" rx="6" fill="url(#tent-mesh)"/><path d="M12 30q14 -16 28 0q14 -16 28 0" stroke="#17181d" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="72" y="12" width="12" height="34" rx="3" fill="#b9372c"/></g>
<g class="tent-loft"><path d="M${loft.from} ${roofAt(loft.from) + 6}L${loft.to} ${roofAt(loft.to) + 6}L${loft.to - 16} ${roofAt(loft.to) + 54}Q${(loft.from + loft.to) / 2} ${roofAt(960) + 78} ${loft.from + 16} ${roofAt(loft.from) + 54}Z" fill="url(#tent-mesh)" stroke="#2a2d36" stroke-width="2"/><path d="M${loft.from + 34} ${roofAt(loft.from) + 50}q14 -22 34 -16q16 8 8 24q-22 10 -42 -8z" fill="#c23b30"/><path d="M${loft.from + 96} ${roofAt(loft.from) + 58}q10 -24 36 -18q12 10 4 24q-22 8 -40 -6z" fill="#27323f"/></g>
<path class="tent-line" d="M${lineFrom[0]} ${lineFrom[1]}Q${lineMid[0]} ${lineMid[1]} ${lineTo[0]} ${lineTo[1]}"/>
<g class="tent-socks"><path d="M${lineFrom[0] + 186} ${lineFrom[1] + 24}v44q0 12 14 12h16v-14h-12v-42z" fill="#8a93a3"/><path d="M${lineFrom[0] + 226} ${lineFrom[1] + 26}v44q0 12 14 12h16v-14h-12v-42z" fill="#727c8d"/><path d="M${lineTo[0] - 96} ${lineTo[1] + 8}h44l-6 50h-32z" fill="#e0752e"/></g>
<g class="tent-lamp" transform="translate(${TentArt.LAMP} ${roofAt(TentArt.LAMP)})"><path d="M0 0v34" stroke="#2a2d36" stroke-width="2.5"/><rect x="-14" y="34" width="28" height="12" rx="4" fill="#2b2f39"/><rect class="tent-lamp-light" x="-12" y="46" width="24" height="28" rx="8"/><rect x="-14" y="72" width="28" height="7" rx="3" fill="#2b2f39"/></g>`;
  }

  private floor(): string {
    const { FLOOR } = TentArt;
    const { from, to } = this.room;
    const bag = from + TentArt.BAG_IN;
    const baffles = (left: number, right: number, top: number, bottom: number, apart: number) =>
      Array.from({ length: Math.floor((right - left) / apart) - 1 }, (_, index) => {
        const x = left + (index + 1) * apart;
        return `M${x} ${top + 3}Q${x - 5} ${(top + bottom) / 2} ${x} ${bottom - 2}`;
      }).join("");
    return `<path class="tent-tub" d="M${from - 4} ${FLOOR - 26}Q${from - 2} ${FLOOR - 2} ${from + 20} ${FLOOR}H${to - 20}Q${to + 2} ${FLOOR - 2} ${to + 4} ${FLOOR - 26}L${to + 4} ${FLOOR + 6}H${from - 4}Z"/>
<rect class="tent-foam" x="${from + 22}" y="${FLOOR - 16}" width="${to - from - 42}" height="14" rx="5"/>
<rect class="tent-pad" x="${from + 30}" y="${FLOOR - 42}" width="${to - from - 58}" height="27" rx="11"/>
<path class="tent-pad-seams" d="${baffles(from + 30, to - 28, FLOOR - 42, FLOOR - 15, 44)}"/>
<g class="tent-bag-empty"><path class="tent-bag" d="M${bag} ${FLOOR - 42}C${bag} ${FLOOR - 72} ${bag + 24} ${FLOOR - 84} ${bag + 70} ${FLOOR - 86}L1090 ${FLOOR - 90}C1140 ${FLOOR - 92} 1178 ${FLOOR - 82} 1188 ${FLOOR - 60}L1188 ${FLOOR - 42}Z"/><path class="tent-bag-seams" d="${baffles(bag, 1190, FLOOR - 88, FLOOR - 42, 38)}"/><path class="tent-bag-zip" d="M${bag + 12} ${FLOOR - 58}Q960 ${FLOOR - 70} 1170 ${FLOOR - 62}"/></g>
<g class="tent-shadows"><ellipse cx="${from + TentArt.SEAT_IN}" cy="${FLOOR - 41}" rx="118" ry="9"/><ellipse cx="${from + 536}" cy="${FLOOR - 41}" rx="66" ry="7"/><ellipse cx="${TentArt.STOVE}" cy="${FLOOR - 1}" rx="64" ry="6"/><ellipse cx="${TentArt.FROM + 120}" cy="${FLOOR - 1}" rx="92" ry="6"/></g>
<path class="tent-pillow" d="M1108 ${FLOOR - 92}q-4 -30 30 -32h28q26 2 24 30q-2 14 -22 14h-38q-18 0 -22 -12z"/>`;
  }

  private props(): string {
    const { FLOOR, FROM, STOVE } = TentArt;
    const { from, to } = this.room;
    const pad = FLOOR - TentArt.SEAT + 2;
    const bottle = (x: number, lift: number, index: number): string =>
      `<g class="tent-bottle" data-bottle="${index}" transform="translate(${x} ${FLOOR - 12 - lift})">${TentArt.bottle()}</g>`;
    const pouch = (x: number, index: number): string =>
      `<g class="tent-meal" data-meal="${index}" transform="translate(${x} ${pad}) rotate(${-8 + index * 6})">${TentArt.pouch(false)}</g>`;
    const canister = (x: number, lift: number, index: number): string =>
      `<g class="tent-gas" data-gas="${index}" transform="translate(${x} ${FLOOR - lift})"><path d="M-22 0V-26Q-22 -34 -12 -36H12Q22 -34 22 -26V0Z" fill="#c9372c"/><rect x="-22" y="-20" width="44" height="9" fill="#f2f2ee"/><rect x="-7" y="-43" width="14" height="8" rx="2" fill="#8b93a2"/></g>`;
    const oxygen = (x: number, index: number): string =>
      `<g class="tent-oxygen" data-oxygen="${index}" transform="translate(${x} ${pad})"><rect x="-15" y="-112" width="30" height="112" rx="13" fill="#c4652f"/><rect x="-7" y="-126" width="14" height="16" rx="3" fill="#8b93a2"/><rect x="-15" y="-72" width="30" height="10" fill="#8f4318"/></g>`;
    return `<g class="tent-crampons" transform="translate(${FROM + 22} ${FLOOR - 4})"><path d="M0 0h54M4 0l-4 10M16 0l-2 11M30 0l0 11M44 0l3 11M54 0l6 9" stroke="#a3acc0" stroke-width="4" stroke-linecap="round" fill="none"/></g>
<g class="tent-boots" transform="translate(${FROM + 76} ${FLOOR})"><path d="M0 0V-64Q0 -74 12 -74H32Q42 -74 42 -62V-24L62 -20Q72 -16 72 -8V0Z" fill="#b0842c"/><path d="M0 -8H72V0H0Z" fill="#17171c"/><path d="M0 -64H42V-52H0Z" fill="#17171c"/><path d="M8 -46H36M8 -36H38M10 -26H42" stroke="#17171c" stroke-width="3"/><g transform="translate(50 -2)"><path d="M0 0V-60Q0 -70 12 -70H30Q40 -70 40 -58V-24L58 -20Q68 -16 68 -8V0Z" fill="#c8973a"/><path d="M0 -8H68V0H0Z" fill="#17171c"/><path d="M0 -60H40V-48H0Z" fill="#17171c"/></g></g>
<g class="tent-stove" transform="translate(${STOVE} ${FLOOR})"><rect x="-56" y="-6" width="112" height="7" rx="2" fill="#8a7a5c"/><g class="tent-mug" transform="translate(-42 -6)"><path d="M-11 0V-24H11V0Z" fill="#e6ebf2"/><path d="M-11 -12q-9 0 -9 6t9 6" stroke="#e6ebf2" stroke-width="4" fill="none"/></g><path d="M-24 -6V-30Q-24 -38 -14 -40H14Q24 -38 24 -30V-6Z" fill="#c9372c"/><rect x="-24" y="-24" width="48" height="9" fill="#f2f2ee"/><rect x="-8" y="-48" width="16" height="9" rx="2" fill="#8b93a2"/><path d="M-22 -48h44l-4 -8h-36z" fill="#3c404a"/><g class="tent-flame"><path d="M-16 -56q4 -16 8 0q4 -18 8 0q4 -16 8 0q4 -14 8 0z"/></g><g class="tent-pot-all">${TentArt.pot(`<g class="tent-pot-snow"><path d="M-24 -118q6 -14 16 -8q8 -12 18 -2q10 -6 14 10z" fill="#f4f8fc"/></g>`)}</g></g>
<g class="tent-snow-sack" transform="translate(${from + TentArt.SNOW.into} ${FLOOR})"><path d="M-22 0Q-30 -40 -18 -62H20Q32 -40 24 0Z" fill="#2f6cc4"/><path d="M-18 -62q8 -18 20 -10q10 -12 18 10z" fill="#f4f8fc"/><path d="M-20 -30Q0 -24 22 -30" stroke="#1d4a8e" stroke-width="3" fill="none"/></g>
<g class="tent-guitar-rest" transform="translate(${from + 352} ${pad - 80}) rotate(-80) scale(0.84)">${TentArt.guitar()}</g>
${[0, 1, 2].map((index) => oxygen(from + 618 + index * 36, index)).join("")}
<g class="tent-pack" transform="translate(${from + 536} ${pad})"><path d="M-52 0Q-64 -110 -50 -186Q-40 -214 0 -216Q42 -214 50 -186Q64 -110 54 0Z" fill="#262e47"/><path d="M-50 -186Q-40 -214 0 -216Q42 -214 50 -186Q40 -160 0 -158Q-40 -160 -50 -186Z" fill="#313a59"/><path d="M-34 -150V-20M34 -150V-20" stroke="#15171f" stroke-width="7"/><rect x="-26" y="-112" width="52" height="62" rx="8" fill="#1d2338"/><path d="M-20 -80H20" stroke="#ff8f45" stroke-width="4"/><path d="M-58 -120q-14 40 -4 110" stroke="#15171f" stroke-width="8" fill="none" stroke-linecap="round"/><g class="tent-pack-axe"><path d="M62 -8L44 -228" stroke="#b8c2d0" stroke-width="7" stroke-linecap="round"/><path d="M20 -214L44 -228L70 -238" stroke="#c3ccd9" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><g class="tent-pack-tool"><path d="M-66 -12L-50 -204" stroke="#5c84b8" stroke-width="7" stroke-linecap="round"/><path d="M-74 -196L-50 -204L-26 -196" stroke="#c3ccd9" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><g class="tent-pack-jumar" transform="translate(0 -140)"><rect x="-10" y="-6" width="20" height="36" rx="6" fill="#b5bdca"/><rect x="-10" y="14" width="20" height="16" rx="5" fill="#c9332c"/></g></g>
<g class="tent-radio" transform="translate(${from + TentArt.RADIO_IN} ${pad - TentArt.RADIO.width / 2}) rotate(90)">${TentArt.radio()}</g>
${[
  [2, 55, 10],
  [1, 38, 0],
  [0, TentArt.BOTTLE_IN, 0],
]
  .map(([index = 0, x = 0, lift = 0]) => bottle(from + x, lift, index))
  .join("")}
${[0, 1, 2, 3].map((index) => pouch(from + TentArt.MEALS_IN + index * 25, index)).join("")}
${[0, 1, 2].map((index) => canister(to + 22 + (index === 2 ? 17 : index * 34), index === 2 ? 36 : 0, index)).join("")}
<g class="tent-duffel" transform="translate(${to + 108} ${FLOOR})"><path d="M-36 0Q-46 -30 -32 -44H36Q48 -30 38 0Z" fill="#c23b30"/><path d="M-18 -44V0M18 -44V0" stroke="#272a33" stroke-width="6"/><path d="M-18 -44q18 -18 36 0" stroke="#272a33" stroke-width="5" fill="none"/></g>
<g class="tent-left-tool" transform="translate(${from + 590} ${FLOOR + 1}) rotate(90)"><path d="M0 0V-176" stroke="#5c84b8" stroke-width="7" stroke-linecap="round"/><path d="M-22 -168L0 -176L22 -168" stroke="#c3ccd9" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
<g class="tent-left-jumar" transform="translate(${from + 530} ${FLOOR - 2}) rotate(90)"><rect x="-10" y="-6" width="20" height="36" rx="6" fill="#b5bdca"/><rect x="-10" y="14" width="20" height="16" rx="5" fill="#c9332c"/><path d="M0 30q16 20 40 14" stroke="#2f6bd0" stroke-width="5" fill="none"/></g>`;
  }

  /** A water bottle, standing on its base at the origin: its body with the water showing in it,
   * its sleeve, its cap and the cap's loop. On the floor and in a hand it's the same bottle. */
  static bottle(): string {
    const { width, height, cap } = TentArt.BOTTLE;
    const half = width / 2;
    return `<rect x="${-half}" y="${-height}" width="${width}" height="${height}" rx="8" fill="#27323f"/><rect class="tent-water" x="${-half + 3}" y="${-height + 10}" width="${width - 6}" height="${height - 14}" rx="6"/><rect x="${-half}" y="${-height + 25}" width="${width}" height="26" fill="#3f9488" opacity="0.92"/><path d="M${half - 5} ${-height + 8}V-8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.22" fill="none"/><rect x="-10" y="${-height - cap}" width="20" height="${cap + 1}" rx="4" fill="#dfe6f0"/><path d="M10 ${-height - cap + 4}q11 4 6 20" stroke="#dfe6f0" stroke-width="2.6" fill="none"/>`;
  }

  /** A freeze-dried meal's pouch, standing on its base at the origin: foil, with its label;
   * `open`, its top torn off and dark inside, or sealed. */
  static pouch(open: boolean): string {
    const { width, height } = TentArt.POUCH;
    const half = width / 2;
    const top = open
      ? `<path d="M${-half} ${-height}L${half} ${-height}L${half - 0.6} ${-height + 7}L${-half + 0.6} ${-height + 7}Z" fill="#3a3530"/><path d="M${-half} ${-height}H${half}" stroke="#dfe6f0" stroke-width="1.6" fill="none"/>`
      : `<path d="M${-half} ${-height}L${half} ${-height}L${half - 1} ${-height + 10}L${-half + 1} ${-height + 10}Z" fill="#8e9aa8"/>`;
    return `<path d="M${-half + 3} 0L${-half} ${-height}L${half} ${-height}L${half - 3} 0Z" fill="#b9c4d0"/>${top}<rect x="-14" y="${-height + 18}" width="28" height="18" rx="3" fill="#e8742c"/><path d="M-9 ${-height + 24}h18M-9 ${-height + 30}h11" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.85"/><path d="M${half - 6} ${-height + 12}L${half - 7} -6" stroke="#fff" stroke-width="1.8" opacity="0.3" fill="none"/>`;
  }

  /** The stove's pot, from the stove's foot on the floor: its body with its bands, its folding
   * handle on the side toward the viewer, `inside` it, and its rim over that. On the stove and
   * in a hand it's the same pot. */
  static pot(inside = ""): string {
    const { half, bottom, rim, handle } = TentArt.POT;
    return `<path class="tent-pot" d="M${-half} ${-bottom}H${half}V${-rim + 4}Q${half} ${-rim} ${half - 4} ${-rim}H${-half + 4}Q${-half} ${-rim} ${-half} ${-rim + 4}Z"/><path d="M${-half} ${-bottom - 16}H${half}M${-half} ${-bottom - 8}H${half}" stroke="#6b7385" stroke-width="2"/><rect class="tent-pot-handle" x="-10" y="${-handle - 5}" width="20" height="10" rx="4"/><path d="M-13 ${-handle}h3M10 ${-handle}h3" stroke="#4b5262" stroke-width="3" stroke-linecap="round"/>${inside}<path class="tent-pot-rim" d="M${-half - 2} ${-rim}H${half + 2}" stroke="#dfe6f0" stroke-width="4" stroke-linecap="round"/>`;
  }

  /** The handheld radio (#271), standing on its base at the origin: its black body, the
   * speaker's grille, its amber display, the channel knob and the antenna at its corner. On the
   * pad and in a hand it's the same radio. */
  static radio(): string {
    const { width, height, antenna } = TentArt.RADIO;
    const half = width / 2;
    const grille = [10, 14, 18, 22].map((up) => `M${-half + 4} ${-up}H${half - 4}`).join("");
    return `<path d="M${-half + 3.5} ${-height}V${-height - antenna}" stroke="#101216" stroke-width="4.4" stroke-linecap="round" fill="none"/><rect x="${half - 8}" y="${-height - 5}" width="6" height="6" rx="1.5" fill="#6b7385"/><rect x="${-half}" y="${-height}" width="${width}" height="${height}" rx="4" fill="#1b1e26"/><rect x="${-half}" y="${-height}" width="4" height="${height}" rx="2" fill="#2b303c"/><rect class="tent-radio-lcd" x="${-half + 3.5}" y="${-height + 5}" width="${width - 7}" height="8" rx="1.5" fill="#f0b040"/><path d="${grille}" stroke="#07080a" stroke-width="1.6" stroke-linecap="round" fill="none"/><rect x="${-half - 1.6}" y="${-height + 12}" width="2.6" height="9" rx="1.2" fill="#e2671e"/>`;
  }

  /** The satellite tracker (#271), standing on its base at the origin: its orange case, its
   * screen and keys, and the black cap of its antenna. */
  static tracker(): string {
    const { width, height, cap } = TentArt.TRACKER;
    const half = width / 2;
    return `<rect x="${-half + 2.5}" y="${-height - cap}" width="${width - 5}" height="${cap + 3}" rx="3" fill="#15171d"/><rect x="${-half}" y="${-height}" width="${width}" height="${height}" rx="3.5" fill="#e2671e"/><rect x="${-half}" y="${-height}" width="3.4" height="${height}" rx="1.7" fill="#f08a45"/><rect x="${-half + 2.8}" y="${-height + 4}" width="${width - 5.6}" height="11" rx="1.5" fill="#cfdcd6"/><path d="M${-half + 4} ${-height + 7.5}h5M${-half + 4} ${-height + 11}h7" stroke="#2b2f39" stroke-width="1.2" stroke-linecap="round" fill="none"/><rect x="${-half + 3}" y="${-height + 19}" width="${width - 6}" height="6" rx="1.5" fill="#15171d"/>`;
  }

  /** The pocket weather meter (#271), standing on its base at the origin: its yellow body, its
   * grey display and keys, and the impeller in its ring at the top, open to the wind. */
  static meter(): string {
    const { width, height, ring } = TentArt.METER;
    const half = width / 2;
    const hub = -height - ring + 1;
    return `<rect x="${-half}" y="${-height}" width="${width}" height="${height}" rx="3.5" fill="#e7b43a"/><rect x="${-half}" y="${-height}" width="3" height="${height}" rx="1.5" fill="#f3cd6a"/><rect x="${-half + 2.4}" y="${-height + 4}" width="${width - 4.8}" height="10" rx="1.5" fill="#cfdcd6"/><circle cx="-2.6" cy="${-height + 19.5}" r="1.7" fill="#2b2f39"/><circle cx="2.6" cy="${-height + 19.5}" r="1.7" fill="#2b2f39"/><circle cx="0" cy="${hub}" r="${ring}" fill="#2b2f39"/><circle cx="0" cy="${hub}" r="${ring - 2.4}" fill="#9db0c6"/><path d="M0 ${hub - ring + 2.6}V${hub + ring - 2.6}M${-ring + 2.6} ${hub}H${ring - 2.6}" stroke="#2b2f39" stroke-width="1.5" fill="none"/>`;
  }

  /** The GPS watch (#271) on a wrist, the hand ahead along -y from the origin: its strap round
   * the sleeve's cuff and its round face, the display lit. */
  static watch(): string {
    const { face, strap } = TentArt.WATCH;
    return `<rect x="-17" y="${-strap / 2}" width="34" height="${strap}" rx="3" fill="#15171d"/><circle r="${face + 2}" fill="#15171d"/><circle r="${face}" fill="#2f3541"/><circle class="tent-watch-face" r="${face - 2}" fill="#d9ece2"/><path d="M-3 -1.5h6M-2 2h4" stroke="#2b2f39" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;
  }

  /** A long spoon, its bowl up, from where the fingers pinch it at the origin. */
  static spoon(): string {
    const { handle, neck, tip } = TentArt.SPOON;
    return `<path class="dw-spoon" d="M-1.1 ${handle}L1.1 ${handle}L1.5 ${-neck}L-1.5 ${-neck}Z"/><path class="dw-spoon" d="M0 ${-neck + 1}C4.4 ${-neck + 1} 5.9 ${-neck - 5} 5.6 ${-neck - 11}C5.3 ${-tip + 4} 2.6 ${-tip} 0 ${-tip}C-2.6 ${-tip} -5.3 ${-tip + 4} -5.6 ${-neck - 11}C-5.9 ${-neck - 5} -4.4 ${-neck + 1} 0 ${-neck + 1}Z"/><path class="dw-spoon-light" d="M-2.8 ${-neck - 12}C-2.5 ${-neck - 8} -1 ${-neck - 4} 1.2 ${-neck - 3}"/>`;
  }

  /** The guitar, lying along +x from its body's end: its body, sound hole and bridge, its neck
   * and frets, its head and its strings. */
  static guitar(): string {
    const frets = Array.from({ length: 9 }, (_, index) => {
      const x = 76 + index * (15 - index * 0.5);
      return `M${x.toFixed(1)} -8.5V8.5`;
    }).join("");
    const strings = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5]
      .map((y) => `M-52 ${y}L236 ${(y * 0.8).toFixed(1)}`)
      .join("");
    return `<path class="guitar-body" d="M-100 0C-100 -58 -40 -62 -8 -40C10 -50 62 -48 66 0C62 48 10 50 -8 40C-40 62 -100 58 -100 0Z"/>
<path class="guitar-edge" d="M-100 0C-100 -58 -40 -62 -8 -40C10 -50 62 -48 66 0C62 48 10 50 -8 40C-40 62 -100 58 -100 0Z"/>
<circle class="guitar-rose" cx="6" cy="0" r="20"/><circle class="guitar-hole" cx="6" cy="0" r="15"/>
<path class="guitar-guard" d="M2 18q26 6 34 -12q6 22 -10 34q-18 4 -24 -22z"/>
<rect class="guitar-bridge" x="-58" y="-17" width="9" height="34" rx="2"/>
<rect class="guitar-neck" x="62" y="-9.5" width="156" height="19"/>
<path class="guitar-frets" d="${frets}"/>
<path class="guitar-head" d="M216 -9.5L226 -15H256Q262 -15 262 -9V9Q262 15 256 15H226L216 9.5Z"/>
<path class="guitar-pegs" d="M230 -15v-6M242 -15v-6M254 -15v-6M230 15v6M242 15v6M254 15v6"/>
<path class="guitar-strings" d="${strings}"/>`;
  }

  /** The sleeping bag with someone in it: the bag over them, its hood round the face on the
   * pillow, the eyes shut. */
  private sleeper(): string {
    const { FLOOR } = TentArt;
    const bag = this.room.from + TentArt.BAG_IN;
    const seams = Array.from({ length: 9 }, (_, index) => {
      const x = bag + 36 + index * 38;
      return `M${x} ${FLOOR - 104}Q${x - 6} ${FLOOR - 72} ${x} ${FLOOR - 44}`;
    }).join("");
    return `<g class="tent-breathing"><path class="tent-bag" d="M${bag} ${FLOOR - 42}C${bag - 6} ${FLOOR - 84} ${bag + 16} ${FLOOR - 100} ${bag + 70} ${FLOOR - 104}L1040 ${FLOOR - 118}C1090 ${FLOOR - 122} 1118 ${FLOOR - 118} 1128 ${FLOOR - 108}L1128 ${FLOOR - 42}Z"/><path class="tent-bag-seams" d="${seams}"/></g>
<path class="tent-bag-hood" d="M1100 ${FLOOR - 112}C1108 ${FLOOR - 150} 1160 ${FLOOR - 160} 1190 ${FLOOR - 130}C1204 ${FLOOR - 104} 1196 ${FLOOR - 70} 1178 ${FLOOR - 56}L1120 ${FLOOR - 50}Z"/>
<g class="tent-sleeper-head" transform="translate(1150 ${FLOOR - 102}) rotate(76)">${new DwellerHead("dw-sleeper").markup(true)}</g>
<path class="tent-bag-hood-rim" d="M1112 ${FLOOR - 118}C1124 ${FLOOR - 146} 1164 ${FLOOR - 150} 1184 ${FLOOR - 126}" />
<g class="tent-zed"><text x="1180" y="${FLOOR - 190}">z</text><text x="1204" y="${FLOOR - 224}">z</text><text x="1232" y="${FLOOR - 262}">Z</text></g>`;
  }

  /** A head from its middle, turned a little toward the stove: the neck, the hair, the ear, the
   * face with the goggles' paler band across the eyes, the cheeks the wind burnt, the stubble,
   * the eyes with their lids, the brows, the nose, the mouth, and the hat. */
  private air(): string {
    return `<g class="tent-steam" transform="translate(${TentArt.STOVE} ${TentArt.FLOOR - 128})"><circle r="10"/><circle r="13" cx="8"/><circle r="9" cx="-9"/><circle r="12" cx="2"/></g>
<g class="tent-notes"><text x="${this.room.from + 250}" y="${TentArt.FLOOR - 230}">♪</text><text x="${this.room.from + 286}" y="${TentArt.FLOOR - 196}">♫</text><text x="${this.room.from + 226}" y="${TentArt.FLOOR - 176}">♪</text></g>`;
  }

  /** The cut edge of the fly nearest the viewer, and the ground it stands on, cut through. */
  private near(): string {
    const { FLOOR } = TentArt;
    return `<path class="tent-cut" d="${this.path(this.outline, false)}"/>
<path class="tent-cut-in" d="${this.path(this.outline, false)}"/>
<path class="tent-valance" d="M${TentArt.FROM - 16} ${FLOOR + 5}H${this.end + 16}"/>
<rect class="tent-section" x="-3000" y="${FLOOR + 9}" width="7400" height="3000"/>
<g class="tent-stones"><path d="M40 ${FLOOR + 40}l20 -12 34 4 10 16 -20 14 -36 -4zM330 ${FLOOR + 76}l28 -14 40 8 6 20 -30 12 -40 -8zM700 ${FLOOR + 44}l22 -10 30 6 4 14 -22 10 -30 -6zM1010 ${FLOOR + 84}l30 -14 44 6 8 22 -34 14 -42 -8zM1290 ${FLOOR + 40}l18 -10 28 4 6 14 -20 10 -28 -4z"/></g>`;
  }
}
