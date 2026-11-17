import type { Point } from "../../physics";
import type { Elevation } from "./elevation";
import { Polyline } from "./polyline";
import { Ridgeline } from "./ridgeline";
import type { RouteMap } from "./route-map";

/**
 * The ridges of the start's picture: every skyline from Changtse to Nuptse, the banks of the
 * Icefall and the edges of the Western Cwm, as the mountain shows them from above Kala Patthar.
 * Each massif's top stands at its altitude on the picture's scale and as far to the right of
 * Everest's summit as it does along the picture's bearing; the lines between the tops are the
 * picture's own numbers (docs/conventions/rendering.md → the massifs' places), broken into a
 * ridge's teeth by a seeded generator each (`Ridgeline`). Everest's skyline on the right is the
 * route's ridge, so the rope lies along it.
 */
export class Skylines {
  /** The massifs' tops: metres to the right of Everest's summit, and altitude in metres. */
  private static readonly LHOTSE = [2620, 8516] as const;
  private static readonly NUPTSE = [3235, 7861] as const;
  private static readonly WEST_SHOULDER = [-200, 7268] as const;
  private static readonly LHO_LA = [-1198, 6006] as const;
  private static readonly KHUMBUTSE = [-1393, 6636] as const;
  private static readonly LINGTREN = [-2370, 6749] as const;
  private static readonly NORTH_COL = [-2797, 7020] as const;
  private static readonly CHANGTSE = [-3655, 7543] as const;

  readonly summit: Point;
  readonly lhotse: Point;
  readonly changtse: Point;
  /** Everest's skyline on the left, from the North Col up to the summit. */
  readonly northRidge: Ridgeline;
  /** The West Ridge, towards the viewer: it parts the North Face from the Southwest Face. */
  readonly westRidge: Polyline;
  /** From the South Col over Lhotse and down towards Nuptse. */
  readonly lhotseSky: Ridgeline;
  /** How many of `lhotseSky`'s points lead up to Lhotse's top, the top included. */
  readonly toLhotse: number;
  readonly nuptseCrest: Ridgeline;
  readonly nuptseRight: Ridgeline;
  /** Nuptse's spur towards the viewer, down to the Khumbu Glacier. */
  readonly nuptseSpur: Ridgeline;
  /** The West Shoulder's skyline up from the Lho La, and its crest down into the Cwm's mouth. */
  readonly shoulderLeft: Ridgeline;
  readonly shoulderRight: Ridgeline;
  readonly icefallLeft: Polyline;
  readonly icefallRight: Polyline;
  readonly cwmLeft: Polyline;
  readonly cwmHead: Polyline;
  readonly cwmRight: Polyline;
  /** Lingtren and Khumbutse, nearer, across the Lho La, and Khumbutse's spur down to Base Camp. */
  readonly lingtrenSky: Ridgeline;
  readonly khumbutseSpur: Ridgeline;
  /** Changtse and the North Col, far behind; Tibet's hills under them; the ranges to the south. */
  readonly changtseSky: Ridgeline;
  /** How many of `changtseSky`'s points lead up to Changtse's top, the top included. */
  readonly toChangtse: number;
  readonly tibetSky: Ridgeline;
  readonly southSky: Ridgeline;
  readonly glacierTop: Polyline;
  /** The ridge the viewer stands on. */
  readonly nearSky: Ridgeline;

  constructor(route: RouteMap, elevation: Elevation) {
    const top = ([right, altitude]: readonly [number, number]): Point =>
      elevation.place(right, altitude);
    const one = (point: Point): Polyline => new Polyline([point]);
    const ridge = (
      rough: number,
      least: number,
      seed: number,
      ...parts: readonly Polyline[]
    ): Ridgeline => new Ridgeline(new Polyline([]).joined(...parts).points, { rough, least, seed });
    const summit = route.ridge.points[0] ?? top([0, 0]);
    const southCol = route.ridge.points.at(-1) ?? summit;
    const lhotse = top(Skylines.LHOTSE);
    const nuptse = top(Skylines.NUPTSE);
    const shoulder = top(Skylines.WEST_SHOULDER);
    const lhoLa = top(Skylines.LHO_LA);
    const northCol = top(Skylines.NORTH_COL);
    const changtse = top(Skylines.CHANGTSE);
    this.summit = summit;
    this.lhotse = lhotse;
    this.changtse = changtse;

    this.northRidge = ridge(
      0.07,
      16,
      11,
      one(northCol),
      Polyline.of(430, 452, 470, 436, 505, 412, 540, 392, 572, 366, 600, 345, 632, 322, 660, 300),
      Polyline.of(692, 276, 720, 252, 742, 242, 760, 226, 782, 208, 800, 196, 822, 182, 838, 172),
      Polyline.of(850, 165),
      one(summit),
    );
    this.westRidge = one(summit).joined(
      Polyline.of(857, 190, 853, 225, 850, 262, 845, 300, 841, 338, 836, 380, 830, 410),
      one(shoulder),
    );
    const upLhotse = one(southCol).joined(
      Polyline.of(1126, 311, 1140, 305, 1158, 296, 1175, 285, 1192, 273, 1210, 262, 1230, 250),
      Polyline.of(1250, 238, 1268, 229, 1285, 222, 1296, 218),
      one(lhotse),
    );
    this.lhotseSky = ridge(
      0.09,
      12,
      13,
      upLhotse,
      Polyline.of(1314, 221, 1322, 225, 1330, 220, 1338, 224, 1350, 233, 1362, 248, 1375, 270),
      Polyline.of(1386, 290, 1396, 310, 1406, 326),
    );
    this.toLhotse = Skylines.upTo(this.lhotseSky, lhotse);
    this.nuptseCrest = ridge(
      0.1,
      9,
      14,
      Polyline.of(1312, 364, 1322, 352, 1332, 360, 1343, 346, 1354, 354, 1364, 338, 1376, 347),
      Polyline.of(1388, 334, 1399, 340),
      one(nuptse),
    );
    this.nuptseRight = ridge(
      0.14,
      12,
      15,
      one(nuptse),
      Polyline.of(1424, 338, 1440, 350, 1458, 368, 1480, 392, 1500, 410, 1530, 438, 1560, 462),
      Polyline.of(1600, 496, 1650, 530, 1700, 556, 1760, 590, 1820, 616, 1880, 640),
    );
    this.nuptseSpur = ridge(
      0.06,
      16,
      16,
      one(nuptse),
      Polyline.of(1404, 360, 1396, 400, 1384, 440, 1370, 480, 1352, 520, 1330, 560, 1302, 598),
      Polyline.of(1270, 632, 1236, 664, 1200, 692, 1168, 720, 1140, 746),
    );
    this.shoulderLeft = ridge(
      0.08,
      12,
      17,
      one(lhoLa),
      Polyline.of(664, 625, 672, 606, 682, 585, 690, 570, 702, 545, 715, 520, 728, 498, 742, 480),
      Polyline.of(756, 464, 770, 452, 785, 443, 800, 436, 814, 431),
      one(shoulder),
    );
    this.shoulderRight = ridge(
      0.08,
      14,
      18,
      one(shoulder),
      Polyline.of(838, 434, 850, 440, 870, 455, 890, 470, 910, 490, 930, 510, 952, 532, 975, 555),
      Polyline.of(995, 580, 1015, 610, 1030, 636, 1040, 657),
    );
    this.icefallLeft = Polyline.of(
      ...[1040, 657, 1022, 672, 1002, 684, 977, 698, 951, 712, 926, 726, 900, 740, 880, 749],
      ...[862, 758],
    );
    this.icefallRight = Polyline.of(
      ...[1130, 671, 1114, 690, 1092, 706, 1062, 722, 1022, 740, 982, 756, 941, 770, 902, 779],
    );
    this.cwmLeft = Polyline.of(1040, 657, 1062, 622, 1085, 590, 1110, 558, 1135, 522);
    this.cwmHead = Polyline.of(1135, 522, 1170, 527, 1210, 526, 1255, 523, 1300, 521);
    this.cwmRight = Polyline.of(1300, 521, 1262, 553, 1225, 585, 1190, 614, 1158, 642, 1130, 671);
    this.lingtrenSky = ridge(
      0.13,
      11,
      19,
      Polyline.of(-280, 500, -240, 524, -190, 552, -130, 584, -60, 612, 0, 628, 60, 612, 120, 640),
      Polyline.of(180, 655, 220, 668, 262, 650, 300, 640, 332, 622, 360, 610, 382, 592, 400, 580),
      Polyline.of(418, 556, 430, 540, 445, 526),
      one(top(Skylines.LINGTREN)),
      Polyline.of(470, 524, 485, 535, 500, 541, 520, 556, 540, 570, 558, 582, 575, 590, 590, 574),
      Polyline.of(602, 558, 612, 545),
      one(top(Skylines.KHUMBUTSE)),
      Polyline.of(632, 548, 640, 566, 646, 590, 650, 615),
      one(lhoLa),
    );
    this.khumbutseSpur = ridge(
      0.1,
      12,
      24,
      one(lhoLa),
      Polyline.of(668, 668, 690, 698, 718, 726, 752, 746, 800, 764, 836, 772),
    );
    const upChangtse = Polyline.of(
      ...[-280, 500, -220, 484, -160, 492, -100, 470, -50, 476, 0, 462, 40, 450, 80, 440],
      ...[115, 428, 150, 415, 178, 402, 200, 395, 220, 387],
    ).joined(one(changtse));
    this.changtseSky = ridge(
      0.1,
      14,
      20,
      upChangtse,
      Polyline.of(252, 390, 265, 400, 282, 415, 300, 430, 320, 444, 340, 455, 362, 465),
      one(northCol),
      Polyline.of(430, 482),
    );
    this.toChangtse = Skylines.upTo(this.changtseSky, changtse);
    this.tibetSky = ridge(
      0.1,
      22,
      21,
      Polyline.of(-280, 540, -200, 520, -120, 532, -60, 512, 0, 522, 80, 506, 160, 516, 240, 499),
      Polyline.of(320, 509, 400, 497, 470, 506, 540, 499, 600, 512, 700, 522),
    );
    this.southSky = ridge(
      0.12,
      14,
      22,
      Polyline.of(1360, 500, 1400, 468, 1425, 452, 1455, 470, 1490, 440, 1520, 455, 1552, 428),
      Polyline.of(1580, 445, 1600, 436, 1640, 450, 1690, 424, 1740, 440, 1790, 412, 1840, 430),
      Polyline.of(1880, 418),
    );
    this.glacierTop = Polyline.of(
      ...[-280, 750, 0, 742, 200, 732, 400, 738, 560, 748, 650, 742, 700, 758, 800, 768],
      ...[862, 757, 902, 778, 980, 760, 1060, 750, 1140, 746, 1200, 772, 1300, 790, 1420, 800],
      ...[1600, 812, 1880, 826],
    );
    this.nearSky = ridge(
      0.2,
      13,
      23,
      Polyline.of(-280, 800, -200, 812, -120, 798, -60, 810, 0, 806, 60, 796, 140, 810, 220, 820),
      Polyline.of(320, 832, 420, 842, 520, 848, 640, 854, 760, 860, 880, 864, 1000, 860, 1100, 852),
      Polyline.of(1180, 840, 1240, 822, 1290, 802, 1330, 784, 1362, 766, 1392, 752, 1420, 746),
      Polyline.of(1452, 743, 1480, 751, 1510, 747, 1540, 757, 1570, 751, 1600, 759, 1640, 752),
      Polyline.of(1700, 768, 1760, 760, 1820, 776, 1880, 770),
    );
  }

  /** How many of a ridge's points lead up to a top of it, the top included. */
  private static upTo(ridge: Polyline, top: Point): number {
    return ridge.points.findIndex((point) => point.x === top.x && point.y === top.y) + 1;
  }
}
