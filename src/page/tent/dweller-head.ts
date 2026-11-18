import type { Spot } from "./dweller-pose";

/**
 * The head of the person in the tent (#264), drawn to life at a real head's size: in millimetres
 * from its middle, the height of the eyes, scaled to the tent's 300 pixels a metre. It's turned a
 * little to the viewer's left, toward the stove, so the nose stands out over the far cheek and the
 * near ear shows; lit from above and the right, where the lamp hangs, so the near cheek and the
 * forehead catch the light and the far cheek, the eye sockets, the underside of the nose and of the
 * lips and the throat are in shade. No outlines: the shapes are told apart by light and shade, as
 * the climber on the slope is. The eyes have lids, lashes, irises and a light in them; the face a
 * few days' stubble, a mountaineer's sunburn and the paler band their goggles leave; the hat is a
 * fleece beanie with the hair under it. Its colours are the picture's variables (`--skin`, `--hair`,
 * `--eyes`, `--hat`, ...), so a climber's own look is a matter of setting them. A pose moves the
 * lids, where the eyes look and how far the mouth is open (`DwellerHead.LID`, `GAZE`, `JAW`).
 */
export class DwellerHead {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = 0.3;
  /** Where the lips meet, from the head's middle, in the tent's pixels. */
  static readonly MOUTH: Spot = { x: -29 * DwellerHead.SCALE, y: 74 * DwellerHead.SCALE };
  /** How far the eyes can look each way, and how far the jaw drops, in millimetres. */
  static readonly GAZE = { x: 2.6, y: 1.4 };
  static readonly JAW = 9;
  /** Each eye's opening, its upper edge and its lower one, each from the inner corner to the
   * outer: the corners and two curves' control points between. An upper lid closing comes down
   * from the one to the other. */
  private static readonly EDGES: readonly {
    readonly upper: readonly number[];
    readonly lower: readonly number[];
  }[] = [
    {
      upper: [-9, 1, -5, -5, 5, -8.5, 11, -6.6, 15.5, -5.2, 18.4, -2.6, 20, 0.4],
      lower: [-9, 1, -7.4, 2.8, -5, 4.1, -2, 4.8, 5, 6.4, 15, 4.4, 20, 0.4],
    },
    {
      upper: [-41, 1.2, -44, -4, -51.5, -7.2, -57, -5.8, -60, -4.8, -62.3, -2.4, -63.4, 0.2],
      lower: [-41, 1.2, -42.3, 2.6, -44, 3.6, -47, 4.2, -52, 5.2, -59.5, 3.6, -63.4, 0.2],
    },
  ];
  /** The eyes' openings, from the head's middle: the near eye on the viewer's right, and the far
   * one, narrower, beside the nose's bridge. */
  private static readonly EYES = {
    near: "M-9 1C-5-5 5-8.5 11-6.6C15.5-5.2 18.4-2.6 20 .4C15 4.4 5 6.4-2 4.8C-5 4.1-7.4 2.8-9 1Z",
    far: "M-41 1.2C-44-4-51.5-7.2-57-5.8C-60-4.8-62.3-2.4-63.4.2C-59.5 3.6-52 5.2-47 4.2C-44 3.6-42.3 2.6-41 1.2Z",
  };
  /** Each iris's middle and its radius across, in the near eye and the far one, foreshortened. */
  private static readonly IRISES = [
    { x: 3.6, y: -0.2, across: 5.5 },
    { x: -51, y: -0.4, across: 4.4 },
  ] as const;

  /** `id` names the head's clips and shadings, so two heads can be in one picture. */
  constructor(private readonly id: string) {}

  /** The head's markup. Asleep, the eyes are shut and the mouth a little open, for good. */
  markup(asleep = false): string {
    const { id } = this;
    const { SCALE } = DwellerHead;
    return `<g transform="scale(${SCALE})">
<defs>${DwellerHead.defs(id)}</defs>
${DwellerHead.hair()}
${DwellerHead.ear()}
<path class="dw-skin" fill="url(#${id}-skin)" d="${DwellerHead.FACE}"/>
<path class="dw-far-shade" fill="url(#${id}-far)" d="${DwellerHead.FACE}"/>
${DwellerHead.shading(id)}
${DwellerHead.beard(id)}
${DwellerHead.eye(id, "near", 0, asleep)}${DwellerHead.eye(id, "far", 1, asleep)}
${DwellerHead.brows()}
${DwellerHead.nose(id)}
${DwellerHead.mouth(id, asleep)}
${DwellerHead.hat(id)}
</g>`;
  }

  /** An eye's upper lid, `open` of the way open, 0 shut: the skin over the eye above its edge,
   * and the edge, its lashes, which comes down from the opening's upper edge to its lower one,
   * flattening as it goes, as a lid does. Open, it's lifted a little clear of the eye. */
  static lid(index: 0 | 1, open: number): { readonly skin: string; readonly edge: string } {
    const edges = DwellerHead.EDGES[index] ?? DwellerHead.EDGES[0];
    const share = Math.min(1, Math.max(0, open));
    const lift = share >= 1 ? 1.6 : 0;
    const points = (edges?.upper ?? []).map((upper, at) => {
      const lower = edges?.lower[at] ?? upper;
      const value = lower + (upper - lower) * share;
      return at % 2 === 1 ? value - lift : value;
    });
    const text = (value: number): string => String(Math.round(value * 100) / 100);
    const [x0 = 0, y0 = 0, ...rest] = points.map(text);
    const curve = `M${x0} ${y0}C${rest.slice(0, 6).join(" ")}C${rest.slice(6, 12).join(" ")}`;
    const end = { x: rest[10] ?? "0", y: rest[11] ?? "0" };
    const far = index === 0 ? 30 : -75;
    const near = index === 0 ? -16 : -34;
    return {
      skin: `${curve}L${far} ${end.y}L${far} -32L${near} -32L${near} ${y0}Z`,
      edge: curve,
    };
  }

  /** The face's outline: from the chin round the near jaw, behind the ear and over the skull,
   * down the far temple, over the brow's and the cheekbone's bumps, and down the far cheek. */
  private static readonly FACE =
    "M-22 118C-6 119 14 112 30 100C42 92 50 84 54 72C60 58 66 40 72 28C80 10 82-20 79-46C74-86 46-116 2-121C-40-122-66-98-71-62C-73-40-73-22-70-10C-68-4-66.5 0-67 6C-69 16-70 24-67 34C-63 50-58 62-54 74C-50 88-42 102-36 110C-32 116-28 118-22 118Z";

  private static defs(id: string): string {
    return `<radialGradient id="${id}-skin" cx="0.62" cy="0.36" r="0.72" fx="0.66" fy="0.3">
<stop offset="0" class="dw-skin-light"/><stop offset="0.42" class="dw-skin-base"/><stop offset="0.86" class="dw-skin-shade"/><stop offset="1" class="dw-skin-deep"/></radialGradient>
<linearGradient id="${id}-far" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" class="dw-shade-on" stop-opacity="0.55"/><stop offset="0.3" class="dw-shade-on" stop-opacity="0.12"/><stop offset="0.42" class="dw-shade-on" stop-opacity="0"/><stop offset="1" class="dw-shade-on" stop-opacity="0"/></linearGradient>
<radialGradient id="${id}-soft"><stop offset="0" class="dw-shade-on" stop-opacity="0.42"/><stop offset="1" class="dw-shade-on" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-burn"><stop offset="0" class="dw-burn" stop-opacity="0.34"/><stop offset="1" class="dw-burn" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-stubble" cx="0.5" cy="0.62" r="0.62"><stop offset="0.55" class="dw-hair-tone" stop-opacity="0.3"/><stop offset="1" class="dw-hair-tone" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-hat" x1="0.1" y1="1" x2="0.8" y2="0">
<stop offset="0" class="dw-hat-shade"/><stop offset="0.55" class="dw-hat-base"/><stop offset="1" class="dw-hat-light"/></linearGradient>
<linearGradient id="${id}-lip" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" class="dw-lip-shade"/><stop offset="1" class="dw-lip-base"/></linearGradient>
<clipPath id="${id}-eye0"><path d="${DwellerHead.EYES.near}"/></clipPath>
<clipPath id="${id}-eye1"><path d="${DwellerHead.EYES.far}"/></clipPath>
<clipPath id="${id}-face"><path d="${DwellerHead.FACE}"/></clipPath>`;
  }

  /** The hair under the hat: the sideburn before the ear, behind it down to the nape, and a
   * little at the far temple. */
  private static hair(): string {
    return `<path class="dw-hair" d="M66-34C80-26 86 4 82 30C79 46 72 58 62 68L56 52C64 36 68 6 62-26Z"/>`;
  }

  /** The near ear: its rim, the hollow inside it in shade, and the lobe. */
  private static ear(): string {
    return `<g class="dw-ear-all">
<path class="dw-ear" d="M58-10C66-21 82-17 86-1C89 14 85 30 81 40C78 49 71 55 64 51C60 48 61 43 63 39C59 28 56 8 58-10Z"/>
<path class="dw-ear-hollow" d="M65 0C72-6 79 2 78 14C77 25 71 31 67 26C71 19 70 9 65 0Z"/>
<path class="dw-ear-rim" d="M60-9C67-18 80-14 83 0C85 13 82 27 78 37"/>
<path class="dw-ear-tragus" d="M60 14C64 12 66 17 63 21"/>
</g>`;
  }

  /** Light and shade on the face: the eye sockets and the shade under the brows; the paler band
   * the goggles leave; the sunburn on the nose and the cheeks; the light on the near cheekbone, the
   * forehead and the chin; the shade the nose throws on the far cheek, and under the jaw. */
  private static shading(id: string): string {
    return `<g clip-path="url(#${id}-face)">
<path class="dw-tan" d="M-74-26C-50-30 10-32 48-24C56-12 54 10 44 16C10 22-40 22-74 14Z"/>
<ellipse fill="url(#${id}-soft)" cx="4" cy="-4" rx="17" ry="10"/>
<ellipse fill="url(#${id}-soft)" cx="-51" cy="-3" rx="13" ry="9"/>
<ellipse fill="url(#${id}-burn)" cx="-34" cy="32" rx="13" ry="16"/>
<ellipse fill="url(#${id}-burn)" cx="14" cy="32" rx="24" ry="17"/>
<ellipse fill="url(#${id}-burn)" cx="-60" cy="30" rx="10" ry="14"/>
<ellipse fill="url(#${id}-glow)" cx="18" cy="22" rx="16" ry="9"/>
<ellipse fill="url(#${id}-glow)" cx="-8" cy="-42" rx="34" ry="12"/>
<ellipse fill="url(#${id}-glow)" cx="-26" cy="106" rx="11" ry="6"/>
<path fill="url(#${id}-soft)" d="M-37 8C-43 22-47 38-48 54C-55 48-57 30-52 14Z"/>
<path fill="url(#${id}-soft)" d="M-46 104C-30 116 10 112 40 92C40 104 20 122-20 124C-34 124-44 116-46 104Z"/>
</g>`;
  }

  /** A few days' stubble over the jaw, the chin and the upper lip, fading at its edges. */
  private static beard(id: string): string {
    return `<g clip-path="url(#${id}-face)">
<path fill="url(#${id}-stubble)" d="M-58 56C-56 84-44 112-22 120C6 122 34 104 58 70C54 56 50 40 46 30C38 50 22 62 0 64C-20 66-40 64-58 56Z"/>
<path class="dw-moustache" d="M-50 66C-44 60-36 58-30 60C-24 58-12 60-4 66C-14 64-24 63-30 64C-36 63-44 63-50 66Z"/>
</g>`;
  }

  /** An eye: the white, shaded under the lid; the iris, its dark rim, the pupil and the light in
   * it, which look about together (`GAZE`); the upper lid, which comes down over it to blink
   * (`LID`), its lashes along its edge; the crease over it and the line under it. */
  private static eye(id: string, which: "near" | "far", index: 0 | 1, asleep: boolean): string {
    const opening = DwellerHead.EYES[which];
    const iris = DwellerHead.IRISES[index];
    const lid = DwellerHead.lid(index, asleep ? 0 : 1);
    const crease =
      which === "near" ? "M-7.5-6C-2-12.5 9.5-13.5 17-8.4" : "M-42.5-5.2C-46-10.4-55-11.6-60.5-7.4";
    const under =
      which === "near" ? "M-6 3.6C0 7.6 10 7.8 18 2.6" : "M-43 3.4C-47 6.2-55 6.6-61 2.4";
    const lash =
      which === "near"
        ? "M-9.4 1C-5.4-5.4 5-9 11-7C15.6-5.6 18.6-2.8 20.4.6"
        : "M-40.8 1.2C-44.2-4.4-51.6-7.6-57.2-6.2C-60.4-5.2-62.6-2.6-63.8.4";
    return `<g class="dw-eye" data-eye="${index}">
<path class="dw-white" d="${opening}"/>
<g clip-path="url(#${id}-eye${index})">
<path class="dw-white-shade" d="${opening}"/>
<g class="dw-gaze"><ellipse class="dw-iris" cx="${iris.x}" cy="${iris.y}" rx="${iris.across}" ry="5.6"/><ellipse class="dw-iris-rim" cx="${iris.x}" cy="${iris.y}" rx="${iris.across}" ry="5.6"/><ellipse class="dw-pupil" cx="${iris.x}" cy="${iris.y}" rx="${iris.across * 0.42}" ry="2.4"/><circle class="dw-glint" cx="${iris.x + 1.7}" cy="${iris.y - 2}" r="1.15"/></g>
<path class="dw-lid-skin" data-lid="${index}" d="${lid.skin}"/><path class="dw-lid-edge" data-lid-edge="${index}" d="${lid.edge}"/>
<path class="dw-lid-shadow" d="${lash}"/>
</g>
<path class="dw-lash" d="${lash}"/>
<path class="dw-crease" d="${crease}"/>
<path class="dw-under" d="${under}"/>
</g>`;
  }

  /** The brows, thick at their inner ends and tapering out; the near one arched over its eye. */
  private static brows(): string {
    return `<path class="dw-brow" d="M-36-19.5C-44-26.5-56-28-67-21.6C-57-24-46-23-37-16.5Z"/>
<path class="dw-brow" d="M-19-19C-8-28.5 8-29.6 23-21.4C10-25.4-6-24.8-18.2-15.6Z"/>`;
  }

  /** The nose: its ridge against the far cheek, lit along its top; the far wing peeping past the
   * tip and the near wing, the nostril under it, the light on the tip and the shade under it. */
  private static nose(id: string): string {
    return `<g class="dw-nose">
<path class="dw-nose-side" d="M-30-2C-26 10-22 26-18 42C-14 46-14 52-18 54C-24 55-30 54-34 52Z"/>
<path class="dw-nose-ridge" d="M-31.5-4C-33.5 10-36.5 26-40.6 39.6C-42.4 45.8-41.4 50.2-37 51.6"/>
<path class="dw-nose-wing" d="M-40 46.4C-46 44.6-50.4 48.4-48.2 52.2C-46.6 54.6-42.6 53.8-40.2 51.4Z"/>
<path class="dw-nose-alar" d="M-23.6 43.4C-15.8 41.8-12 48-15 52.2C-17.8 55.2-23.6 54.4-26.8 53.2"/>
<path class="dw-nostril" d="M-30.4 52.2C-27.4 50.2-22.4 50.8-21 53C-24 54.8-28 54.9-30.4 52.2Z"/>
<path class="dw-nose-light" d="M-27.6 2C-28.6 14-30.4 27-33.2 39"/>
<ellipse fill="url(#${id}-glow)" cx="-33.5" cy="44" rx="5" ry="3.4"/>
<ellipse fill="url(#${id}-soft)" cx="-29" cy="58.5" rx="10" ry="3.2"/>
<path class="dw-philtrum" d="M-33 57.5C-33.6 61-33.4 64-32.4 66.4M-26.4 57.6C-25.8 61-26 64-26.8 66.4"/>
</g>`;
  }

  /** The mouth: the upper lip in shade, the lower one lit, the line between them; open, the
   * dark of the mouth and the upper teeth, and the lower lip and the chin down with the jaw
   * (`JAW`). */
  private static mouth(id: string, asleep: boolean): string {
    const open = asleep ? 0.18 : 0;
    return `<g class="dw-mouth">
<g class="dw-open" transform="translate(-29 73) scale(1 ${open}) translate(29 -73)"><path class="dw-mouth-inside" d="M-48 73C-40 70-20 70-7 73C-12 84-24 90-30 90C-38 90-46 84-48 73Z"/><path class="dw-teeth" d="M-44 73C-36 71.6-22 71.6-11 73L-12 76.4C-22 75.4-36 75.4-43 76.6Z"/></g>
<path class="dw-lip-upper" fill="url(#${id}-lip)" d="M-51 72C-44 69-38.4 66-33.2 67.2C-30.2 66-27 66-24 67.2C-16 66-8.4 69-4 72C-12 73.2-22 74.2-30 73.8C-38 74.2-46 73.6-51 72Z"/>
<g class="dw-jaw" transform="translate(0 ${open * DwellerHead.JAW})"><path class="dw-lip-lower" d="M-48.4 73.4C-40 75.4-26 75.8-8 73.2C-11.6 79.6-21.4 83-30.6 82.6C-39.6 82.2-46 78.4-48.4 73.4Z"/><ellipse class="dw-lip-light" cx="-27" cy="77.4" rx="7" ry="1.8"/></g>
<path class="dw-lips-line" d="M-51 72.4C-42 74.6-22 74.8-4 72.4"/>
</g>`;
  }

  /** The fleece hat: its crown over the skull, lit from above and the right, its ribbed cuff
   * folded up over the forehead and the ears' tops, and the shade it throws on the forehead. */
  private static hat(id: string): string {
    const ribs = Array.from({ length: 23 }, (_, index) => {
      const x = -74 + index * 7;
      const sag = 0.0016 * (x - 4) * (x - 4);
      return `M${x} ${-71 - 0 + sag * 0.55}L${x + 1} ${-43 + sag * 0.5}`;
    }).join("");
    return `<g class="dw-hat-all">
<path fill="url(#${id}-soft)" d="M-74-44C-50-54 10-58 52-46C70-40 80-32 86-24C82-18 70-22 52-34C10-46-50-44-74-34Z"/>
<path class="dw-hat" fill="url(#${id}-hat)" d="M-80-66C-84-112-42-138 4-136C52-134 88-104 88-52L86-24C76-34 64-40 52-46C10-58-50-54-78-40Z"/>
<path class="dw-hat-crown" d="M-62-108C-30-130 30-132 70-104"/>
<path class="dw-hat-cuff" fill="url(#${id}-hat)" d="M-79-68C-50-80 10-84 54-72C70-66 82-58 88-50L86-24C76-34 64-40 52-46C10-58-50-54-78-40Z"/>
<path class="dw-hat-ribs" d="${ribs}"/>
<path class="dw-hat-fold" d="M-79-68C-50-80 10-84 54-72C70-66 82-58 88-50"/>
</g>`;
  }
}
