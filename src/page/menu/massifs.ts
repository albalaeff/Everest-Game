import { Elevation } from "./elevation";
import { Face } from "./face";
import { Polyline } from "./polyline";
import type { RouteMap } from "./route-map";
import type { Skylines } from "./skylines";

/**
 * The mountains of the start's picture as faces, each closed under its skyline: the far ranges,
 * Lhotse, Everest with its North and Southwest Faces, the Western Cwm, Nuptse's wall and its
 * flank, the West Shoulder, Lingtren and Khumbutse, the Khumbu Glacier, the Icefall, and the ridge
 * the viewer stands on. `all` is every one of them, from the farthest to the nearest: where they
 * lie over each other, the nearer is drawn later.
 */
export class Massifs {
  /** How far under the picture the nearest faces are closed, so none ends in view. */
  private static readonly UNDER = Elevation.HEIGHT + 5;

  readonly tibet: Face;
  readonly changtse: Face;
  readonly south: Face;
  readonly lhotse: Face;
  /** Everest whole, its North Face, and the rest of it: the Southwest Face. */
  readonly everest: Face;
  readonly north: Face;
  readonly southwest: Face;
  /** The rock and ice under the Icefall and the Cwm's mouth, behind all that meets there. */
  readonly under: Face;
  readonly cwm: Face;
  readonly nuptseWall: Face;
  readonly nuptseFlank: Face;
  readonly shoulder: Face;
  readonly lingtren: Face;
  readonly glacier: Face;
  readonly icefall: Face;
  readonly near: Face;
  readonly all: readonly Face[];

  constructor(lines: Skylines, route: RouteMap) {
    const { LEFT, RIGHT } = Elevation;
    const face = (id: string, ...parts: readonly Polyline[]): Face =>
      new Face(id, new Polyline([]).joined(...parts));
    this.tibet = face("tibet", lines.tibetSky, Polyline.of(700, 720, LEFT, 720));
    this.changtse = face("changtse", lines.changtseSky, Polyline.of(430, 720, LEFT, 720));
    this.south = face("south", lines.southSky, Polyline.of(RIGHT, 720, 1360, 720));
    this.lhotse = face("lhotse", lines.lhotseSky, Polyline.of(1406, 580, 1100, 580));
    this.everest = face(
      "everest",
      lines.northRidge,
      route.ridge,
      Polyline.of(1118, 360, 1124, 420, 1130, 480),
      lines.cwmLeft.reversed(),
      Polyline.of(1040, 720, 384, 720),
    );
    this.north = face("north", lines.northRidge, lines.westRidge, Polyline.of(826, 720, 384, 720));
    this.southwest = this.everest.without("southwest", this.north);
    this.under = face(
      "under",
      Polyline.of(600, 690, 840, 640, 1040, 640, 1135, 660, 1260, 660, 1260, 810, 600, 810),
    );
    this.cwm = face("cwm", lines.cwmLeft, lines.cwmHead, lines.cwmRight);
    this.nuptseWall = face(
      "nuptse-wall",
      lines.nuptseCrest,
      lines.nuptseSpur,
      Polyline.of(1118, 728, 1112, 706, 1122, 686),
      lines.cwmRight.reversed(),
      Polyline.of(1308, 440),
    );
    this.nuptseFlank = face(
      "nuptse-flank",
      lines.nuptseSpur,
      Polyline.of(1200, 772, 1300, 790, 1420, 800, 1600, 812, RIGHT, 830),
      lines.nuptseRight.reversed().slice(0, -1),
    );
    this.shoulder = face(
      "shoulder",
      lines.shoulderLeft,
      lines.shoulderRight,
      lines.icefallLeft,
      Polyline.of(840, 762, 800, 768, 750, 766, 700, 758, 668, 740, 650, 712, 648, 680),
    );
    this.lingtren = face(
      "lingtren",
      lines.lingtrenSky,
      lines.khumbutseSpur,
      Polyline.of(836, 790, LEFT, 790),
    );
    this.glacier = face(
      "glacier",
      lines.glacierTop,
      Polyline.of(RIGHT, Massifs.UNDER, LEFT, Massifs.UNDER),
    );
    this.icefall = face(
      "icefall",
      lines.icefallLeft,
      Polyline.of(872, 773),
      lines.icefallRight.reversed(),
    );
    this.near = face("near", lines.nearSky, Polyline.of(RIGHT, Massifs.UNDER, LEFT, Massifs.UNDER));
    this.all = [
      this.tibet,
      this.changtse,
      this.south,
      this.lhotse,
      this.everest,
      this.north,
      this.under,
      this.cwm,
      this.nuptseWall,
      this.nuptseFlank,
      this.shoulder,
      this.lingtren,
      this.glacier,
      this.icefall,
      this.near,
    ];
  }
}
