import type { Point } from "../../physics";
import { Palette } from "../../rendering/palette";
import { Elevation } from "./elevation";
import type { Face, Lie, Shape } from "./face";
import { Massifs } from "./massifs";
import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";
import type { RouteMap } from "./route-map";
import { Skylines } from "./skylines";

/** What's drawn on one face, cut to its outline, or on the picture whole; `dawn`: the first light,
 * which shows only as the day comes. */
export interface Coat {
  readonly face: Face | null;
  readonly dawn: boolean;
  readonly shapes: readonly Shape[];
}

/**
 * The mountains of the start's picture, painted: each face in its colour for the blue hour before
 * the sun, with the texture a face has from this side, drawn by seeded generators: the beds of
 * rock across Everest's summit pyramid, the ribs and gullies of its Southwest Face, the flutings
 * of Nuptse's wall, the West Shoulder's snow over its rock, the crevasses across the Cwm and the
 * Icefall's blocks. The sun comes up to the left of the view, as in May, so the first light is on
 * the tops' left sides and along the ridges' left edges: those coats are the dawn's. `behind` is
 * what stands behind the summit's plume, `front` what stands in front of it; the colours are the
 * picture's own, darker and bluer than the day's (`Palette`).
 */
export class MenuMountains {
  /** The first light's colours: orange at a summit, pink further down. */
  private static readonly HOT = 0xffa67c;
  private static readonly COOL = 0xe27a9c;
  private static readonly ROCK = 0x1e2558;
  /** How a rim of light and a band of glow fade away from the summit. */
  private static readonly RIM_FADE = 1.2;
  private static readonly GLOW_FADE = 1.35;
  /** How much the bands of a summit's glow overlap, in pixels, so no seam shows. */
  private static readonly SEAM = 0.6;

  readonly lines: Skylines;
  readonly faces: Massifs;
  readonly behind: readonly Coat[];
  readonly front: readonly Coat[];

  constructor(route: RouteMap, elevation: Elevation) {
    this.lines = new Skylines(route, elevation);
    this.faces = new Massifs(this.lines, route);
    this.behind = [...this.farRanges(), ...this.lhotse(), ...this.everest(route)];
    this.front = [
      ...this.cwm(),
      ...this.nuptse(),
      ...this.shoulder(),
      ...this.lingtren(),
      ...this.glacier(),
      this.rims(route),
    ];
  }

  /** The far ranges, pale and warm in the air towards the sun. */
  private farRanges(): readonly Coat[] {
    const { lines, faces } = this;
    const { changtse } = lines;
    const shade = faces.changtse.part(
      "changtse-shade",
      new Polyline([changtse]).joined(
        Polyline.of(252, 390, 282, 415, 320, 444, 384, 471, 430, 482, 430, 560, 270, 560, 246, 440),
      ),
    );
    const lit = faces.changtse.part(
      "changtse-lit",
      Polyline.of(120, 370, 244, 370, 236, 440, 120, 440),
    );
    return [
      MenuMountains.coat(null, [MenuMountains.wash(faces.tibet, 0x8a6b9b)]),
      MenuMountains.coat(faces.changtse, [
        MenuMountains.wash(faces.changtse, 0x5c5a94),
        MenuMountains.wash(shade, 0x484884, 0.8),
        this.ribs(faces.changtse, lines.changtseSky.along(17, new PictureRandom(301)), 302, {
          lie: MenuMountains.lie(101, 9, [30, 96], [4, 8]),
          fill: 0x7a75aa,
          opacity: 0.3,
        }),
      ]),
      MenuMountains.coat(
        faces.changtse,
        MenuMountains.glow(lit, 378, 5, 9, 0.5, 0.36, changtse.x),
        true,
      ),
      MenuMountains.coat(faces.south, [
        MenuMountains.wash(faces.south, 0x4b4f8c),
        this.ribs(faces.south, lines.southSky.along(13, new PictureRandom(303)), 304, {
          lie: MenuMountains.lie(80, 10, [30, 90], [4, 9]),
          fill: 0x373c78,
          opacity: 0.6,
        }),
      ]),
    ];
  }

  /** Lhotse and its face, at the head of the Cwm: ice, its summit's rock, the Geneva Spur and
   * the Yellow Band across it. */
  private lhotse(): readonly Coat[] {
    const { lines, faces } = this;
    const face = faces.lhotse;
    const rock = face.part(
      "lhotse-rock",
      Polyline.of(1232, 249, 1268, 229, 1285, 222).joined(
        new Polyline([lines.lhotse]),
        Polyline.of(1314, 221, 1338, 224, 1350, 233, 1375, 270, 1406, 326, 1384, 330, 1356, 306),
        Polyline.of(1334, 296, 1310, 270, 1288, 280, 1268, 262, 1248, 266),
      ),
    );
    const lit = face.part("lhotse-lit", Polyline.of(1180, 200, 1326, 200, 1300, 300, 1180, 300));
    const starts = [
      ...lines.lhotseSky.slice(0, lines.toLhotse).along(14, new PictureRandom(306)),
      ...face.scatter(16, new PictureRandom(307)),
    ];
    return [
      MenuMountains.coat(face, [
        MenuMountains.wash(face, 0x36437f),
        MenuMountains.wash(face.between(430, 590), 0x4759a6, 0.35),
        MenuMountains.wash(rock, MenuMountains.ROCK, 0.9),
        this.ledges(rock, 30, 305, {
          lie: MenuMountains.lie(-22, 10, [9, 30], [1.4, 3.6]),
          fill: 0x4d5da4,
          opacity: 0.6,
        }),
        this.ribs(face, [{ x: 1121, y: 317 }], 311, {
          lie: MenuMountains.lie(55, 0, [78, 78], [14, 14]),
          fill: MenuMountains.ROCK,
          opacity: 0.85,
        }),
        this.ribs(face, starts, 308, {
          lie: MenuMountains.lie(97, 5, [70, 200], [3, 7]),
          fill: 0x5569b6,
          opacity: 0.27,
        }),
        this.ribs(face, face.scatter(20, new PictureRandom(309)), 310, {
          lie: MenuMountains.lie(98, 5, [40, 150], [2.5, 6]),
          fill: 0x212a62,
          opacity: 0.4,
        }),
        this.ledges(face.between(356, 384), 20, 312, {
          lie: MenuMountains.lie(-9, 4, [16, 44], [2, 4.5]),
          fill: 0x8a83a8,
          opacity: 0.34,
        }),
      ]),
      MenuMountains.coat(
        face,
        MenuMountains.glow(lit, 212, 6, 9, -0.5, 0.42, lines.lhotse.x),
        true,
      ),
    ];
  }

  /** Everest: the Southwest Face's dark rock with snow on its ledges, the North Face to the left
   * of the West Ridge, and the first light on the top of it. */
  private everest(route: RouteMap): readonly Coat[] {
    const { lines, faces } = this;
    const { everest, north, southwest } = faces;
    const summit = lines.summit;
    const hinge = summit.x;
    const cap = everest.part(
      "summit-snow",
      new Polyline([summit]).joined(
        route.ridge.slice(1, 8),
        Polyline.of(900, 201, 880, 210, 860, 202, 857, 190),
      ),
    );
    const capLit = everest.part("summit-lit", Polyline.of(860, 150, 924, 150, 924, 192, 860, 204));
    return [
      MenuMountains.coat(everest, [
        MenuMountains.wash(southwest, 0x1c2253),
        this.ribs(southwest, route.ridge.along(21, new PictureRandom(330)), 331, {
          lie: MenuMountains.lie(85, 6, [90, 250], [7, 14]),
          fill: 0x111640,
          opacity: 0.5,
        }),
        this.ribs(southwest, Polyline.of(940, 318, 1034, 300).points, 333, {
          lie: MenuMountains.lie(70, 4, [200, 300], [7, 10]),
          fill: 0x3d4b93,
          opacity: 0.4,
        }),
        this.ledges(southwest, 220, 332, {
          lie: MenuMountains.lie(-4, 5, [13, 66], [1.3, 4.4]),
          fill: 0x4857a1,
          opacity: 0.52,
          high: 0.15,
        }),
        MenuMountains.wash(everest.bed(246, 260, 0.12, hinge), 0x8179a4, 0.24),
        MenuMountains.wash(cap, 0x4d5ba1, 0.75),
      ]),
      MenuMountains.coat(everest, MenuMountains.glow(capLit, 156, 4, 9, 0.07, 0.34, hinge), true),
      MenuMountains.coat(north, [
        MenuMountains.wash(north, 0x3d4583),
        MenuMountains.wash(north.between(390, 720), 0x4d4e8b, 0.3),
        this.ribs(
          north,
          [
            ...lines.northRidge.reversed().along(23, new PictureRandom(321)),
            ...north.scatter(12, new PictureRandom(322), 0.5),
          ],
          323,
          { lie: MenuMountains.lie(116, 7, [70, 200], [5, 10]), fill: 0x5b66ab, opacity: 0.24 },
        ),
        this.ledges(north, 210, 320, {
          lie: MenuMountains.lie(-6.8, 3.5, [14, 74], [1.3, 4.2]),
          fill: 0x252b62,
          opacity: 0.5,
          high: 0.8,
        }),
        this.ribs(north, Polyline.of(840, 194, 806, 220).points, 324, {
          lie: MenuMountains.lie(113, 2, [150, 215], [5, 7.5]),
          fill: 0x6672b8,
          opacity: 0.32,
        }),
        MenuMountains.wash(north.bed(246, 260, 0.12, hinge), 0x8179a4, 0.24),
      ]),
      MenuMountains.coat(
        north,
        [
          MenuMountains.wash(north.bed(150, 330, 0.12, hinge), 0xd27a9a, 0.13),
          ...MenuMountains.glow(north, 150, 11, 10.5, 0.12, 0.66, hinge),
        ],
        true,
      ),
    ];
  }

  /** The Western Cwm, its crevasses from wall to wall, over the rock and ice under its mouth. */
  private cwm(): readonly Coat[] {
    const { lines, faces } = this;
    const random = new PictureRandom(6400);
    const right = lines.cwmRight.reversed();
    const crevasses = [0.08, 0.2, 0.31, 0.43, 0.52, 0.63, 0.74, 0.86].map((share) => {
      const from = lines.cwmLeft.at(share * lines.cwmLeft.length);
      const to = right.at(share * right.length);
      const a = {
        x: from.x + (to.x - from.x) * random.within(0.05, 0.3),
        y: from.y + (to.y - from.y) * 0.1,
      };
      const b = { x: to.x - (to.x - a.x) * random.within(0.05, 0.35), y: to.y };
      const sag = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + random.within(1.5, 4) };
      return new Polyline([a, sag, b]).path();
    });
    return [
      MenuMountains.coat(null, [MenuMountains.wash(faces.under, 0x1a2152)]),
      MenuMountains.coat(faces.cwm, [
        MenuMountains.wash(faces.cwm, 0x465ca6),
        MenuMountains.wash(faces.cwm.between(615, 680), 0x5b73c0, 0.45),
        { path: crevasses.join(""), stroke: 0x27356f, width: 0.8, opacity: 0.7 },
      ]),
    ];
  }

  /** Nuptse: its fluted north wall over the Cwm, and its dark flank towards the viewer. */
  private nuptse(): readonly Coat[] {
    const { lines, faces } = this;
    const wall = faces.nuptseWall;
    const flank = faces.nuptseFlank;
    const spur = lines.nuptseSpur;
    const flutings = MenuMountains.lie(119, 4, [90, 250], [3.5, 7.5]);
    return [
      MenuMountains.coat(wall, [
        MenuMountains.wash(wall, 0x293470),
        MenuMountains.wash(wall.between(560, 760), 0x182051, 0.5),
        this.ribs(
          wall,
          [
            ...lines.nuptseCrest.along(7, new PictureRandom(340)),
            ...spur.slice(0, spur.points.length / 2).along(17, new PictureRandom(341)),
            ...wall.scatter(28, new PictureRandom(342), 0.4),
          ],
          343,
          { lie: flutings, fill: 0x5a6fba, opacity: 0.32 },
        ),
        this.ribs(
          wall,
          [
            ...lines.nuptseCrest.along(9, new PictureRandom(344)),
            ...wall.scatter(24, new PictureRandom(345), 0.3),
          ],
          346,
          { lie: MenuMountains.lie(119, 4, [70, 220], [3, 7]), fill: 0x141b4a, opacity: 0.45 },
        ),
      ]),
      MenuMountains.coat(flank, [
        MenuMountains.wash(flank, 0x151b49),
        this.ribs(
          flank,
          [
            ...lines.nuptseRight.along(19, new PictureRandom(350)),
            ...spur.along(32, new PictureRandom(351)),
            ...flank.scatter(14, new PictureRandom(352)),
          ],
          353,
          { lie: MenuMountains.lie(72, 7, [110, 300], [7, 15]), fill: 0x232d69, opacity: 0.6 },
        ),
        this.ribs(flank, flank.scatter(26, new PictureRandom(354)), 355, {
          lie: MenuMountains.lie(72, 7, [80, 220], [5, 11]),
          fill: 0x0c1134,
          opacity: 0.5,
        }),
        this.ledges(flank, 60, 356, {
          lie: MenuMountains.lie(30, 10, [10, 36], [1.5, 4]),
          fill: 0x2e3975,
          opacity: 0.5,
          high: 0.6,
        }),
      ]),
    ];
  }

  /** The West Shoulder, in front of Everest: snow along its crest, ribs down it, rock and a band
   * of hanging ice lower down. */
  private shoulder(): readonly Coat[] {
    const { lines, faces } = this;
    const face = faces.shoulder;
    const skyline = lines.shoulderLeft.joined(lines.shoulderRight);
    const crest = lines.shoulderLeft.slice(-34).joined(lines.shoulderRight.slice(0, 44)).path();
    return [
      MenuMountains.coat(face, [
        MenuMountains.wash(face, 0x323f7f),
        { path: crest, stroke: 0x566ab5, width: 60, opacity: 0.5 },
        { path: crest, stroke: 0x7287cf, width: 24, opacity: 0.36 },
        this.ribs(face, skyline.along(27, new PictureRandom(360)), 361, {
          lie: MenuMountains.lie(96, 6, [90, 240], [7, 13]),
          fill: 0x1a2152,
          opacity: 0.5,
        }),
        this.ribs(
          face,
          [
            ...skyline.along(31, new PictureRandom(362)),
            ...face.scatter(18, new PictureRandom(363)),
          ],
          364,
          { lie: MenuMountains.lie(97, 6, [70, 200], [4, 8]), fill: 0x5b6fb9, opacity: 0.3 },
        ),
        this.ledges(face.between(570, 790), 64, 365, {
          lie: MenuMountains.lie(-3, 7, [9, 34], [1.5, 4.5]),
          fill: 0x161c4b,
          opacity: 0.42,
        }),
        this.ledges(face.between(586, 624), 30, 366, {
          lie: MenuMountains.lie(5, 5, [14, 42], [2.5, 5]),
          fill: 0x8499dc,
          opacity: 0.5,
        }),
      ]),
    ];
  }

  /** Khumbutse and Lingtren, nearer, across the Lho La. */
  private lingtren(): readonly Coat[] {
    const face = this.faces.lingtren;
    return [
      MenuMountains.coat(face, [
        MenuMountains.wash(face, 0x151b47),
        this.ribs(face, this.lines.lingtrenSky.along(15, new PictureRandom(370)), 371, {
          lie: MenuMountains.lie(106, 9, [40, 130], [5, 10]),
          fill: 0x2a366f,
          opacity: 0.7,
        }),
        this.ledges(face, 70, 372, {
          lie: MenuMountains.lie(-8, 8, [8, 30], [1.5, 3.5]),
          fill: 0x35417d,
          opacity: 0.5,
          high: 0.5,
        }),
      ]),
    ];
  }

  /** The Khumbu Glacier's moraine, and the Icefall coming down to it in blocks. */
  private glacier(): readonly Coat[] {
    const { glacier, icefall } = this.faces;
    const random = new PictureRandom(5300);
    const stripes: [string[], string[]] = [[], []];
    for (let index = 0; index < 40; index++) {
      const y = 748 + (index % 26) * 4.6 + random.swing(2);
      const x = random.within(Elevation.LEFT - 100, 1300);
      const length = random.within(240, 620);
      stripes[index % 2]?.push(
        Polyline.of(
          ...[x, y, x + length / 2, y + length * 0.035 + random.swing(2)],
          ...[x + length, y + length * 0.075],
        ).path(),
      );
    }
    const blocks: [string[], string[], string[]] = [[], [], []];
    const ice = new PictureRandom(5364);
    for (const { x, y } of icefall.scatter(190, ice)) {
      const wide = ice.within(3, 9);
      const tall = ice.within(2, 5.5);
      // The blocks lie along the ice's flow, down to the left.
      const rise = wide * ice.within(-0.75, -0.35) * 0.55;
      const block = Polyline.of(
        ...[x, y, x + wide, y + rise, x + wide + ice.swing(1), y + rise + tall],
        ...[x + ice.swing(1), y + tall],
      ).path(true);
      const light = ice.fraction();
      blocks[light < 0.45 ? 1 : light < 0.85 ? 0 : 2].push(block);
    }
    return [
      MenuMountains.coat(glacier, [
        MenuMountains.wash(glacier, 0x222959),
        { path: stripes[0].join(""), stroke: 0x35407d, width: 1.3, opacity: 0.5 },
        { path: stripes[1].join(""), stroke: 0x151a42, width: 1.3, opacity: 0.55 },
      ]),
      MenuMountains.coat(icefall, [
        MenuMountains.wash(icefall, 0x445aa2),
        { path: blocks[0].join(""), fill: 0x24316d, opacity: 0.62 },
        { path: blocks[1].join(""), fill: 0x7f97de, opacity: 0.55 },
        { path: blocks[2].join(""), fill: 0xb9c9f5, opacity: 0.5 },
      ]),
    ];
  }

  /** The light along the ridges' edges towards the sun, strongest at each summit. */
  private rims(route: RouteMap): Coat {
    const { lines } = this;
    return MenuMountains.coat(
      null,
      [
        ...MenuMountains.rim(lines.northRidge.reversed().slice(0, 60), 0xffb893, 1.9, 0.95, 9),
        { path: route.ridge.slice(0, 6).path(), stroke: 0xffd2b4, width: 1.3, opacity: 0.75 },
        ...MenuMountains.rim(
          lines.lhotseSky.slice(0, lines.toLhotse).reversed(),
          0xffad8c,
          1.3,
          0.85,
          6,
        ),
        ...MenuMountains.rim(lines.nuptseCrest.reversed(), 0xffa58c, 1.3, 0.6, 4),
        ...MenuMountains.rim(lines.shoulderLeft.reversed().slice(0, 40), 0xff9f8e, 1.3, 0.5, 5),
        ...MenuMountains.rim(
          lines.changtseSky.slice(0, lines.toChangtse).reversed().slice(0, 26),
          0xffb49a,
          1.3,
          0.55,
          5,
        ),
        { path: lines.westRidge.slice(0, 5).path(), stroke: 0xffb9a0, width: 0.8, opacity: 0.4 },
      ],
      true,
    );
  }

  private ribs(
    face: Face,
    starts: readonly Point[],
    seed: number,
    look: { lie: Lie; fill: number; opacity: number },
  ): Shape {
    return {
      path: face.ribs(starts, look.lie, new PictureRandom(seed)),
      fill: look.fill,
      opacity: look.opacity,
    };
  }

  private ledges(
    face: Face,
    count: number,
    seed: number,
    look: { lie: Lie; fill: number; opacity: number; high?: number },
  ): Shape {
    return {
      path: face.ledges(count, look.lie, new PictureRandom(seed), look.high ?? 0),
      fill: look.fill,
      opacity: look.opacity,
    };
  }

  private static coat(face: Face | null, shapes: readonly Shape[], dawn = false): Coat {
    return { face, dawn, shapes };
  }

  /** A face, or a part of one, filled whole. */
  private static wash(face: Face, fill: number, opacity?: number): Shape {
    return opacity === undefined ? { path: face.path, fill } : { path: face.path, fill, opacity };
  }

  private static lie(
    angle: number,
    spread: number,
    lengths: readonly [number, number],
    widths: readonly [number, number],
  ): Lie {
    return { angle, spread, lengths, widths };
  }

  /** The first light on a summit: bands along the rock's beds from `top` pixels down the picture,
   * `count` of them, each `height` deep, fading down from the top. */
  private static glow(
    face: Face,
    top: number,
    count: number,
    height: number,
    dip: number,
    strength: number,
    hinge: number,
  ): readonly Shape[] {
    return Array.from({ length: count }, (_, band) => {
      const share = band / count;
      const from = top + band * height;
      return MenuMountains.wash(
        face.bed(from, from + height + MenuMountains.SEAM, dip, hinge),
        Palette.mix(MenuMountains.HOT, MenuMountains.COOL, share),
        strength * (1 - share) ** MenuMountains.GLOW_FADE,
      );
    });
  }

  /** Light along a ridge from its summit, in `steps` stretches, each fainter than the last. */
  private static rim(
    ridge: Polyline,
    stroke: number,
    width: number,
    strength: number,
    steps: number,
  ): readonly Shape[] {
    const count = ridge.points.length;
    const size = Math.max(2, Math.ceil(count / steps));
    const shapes: Shape[] = [];
    for (let from = 0; from < count - 1; from += size - 1) {
      shapes.push({
        path: ridge.slice(from, from + size).path(),
        stroke,
        width,
        opacity: strength * (1 - from / Math.max(1, count - 1)) ** MenuMountains.RIM_FADE,
      });
    }
    return shapes;
  }
}
