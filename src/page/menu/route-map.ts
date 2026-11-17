import type { KnowledgeBase } from "../../content/knowledge-base";
import type { Point } from "../../physics";
import type { Elevation } from "./elevation";
import { Polyline } from "./polyline";
import { Ridgeline } from "./ridgeline";

/** What a place of the route is: a camp, a landmark of the summit ridge, or the summit. */
export type PlaceKind = "camp" | "landmark" | "summit";

/** A place of the route on the start's picture. */
export interface RoutePlace {
  /** Its name in the knowledge base, `route.<id>-altitude`, and in the menu's texts. */
  readonly id: string;
  readonly kind: PlaceKind;
  /** Its altitude, in metres: the knowledge base's number, which the altimeter reads there. */
  readonly altitude: number;
  /** Where its mark stands on the picture: on the rope. */
  readonly at: Point;
  /** How far along the rope from Base Camp it is: 0 to 1. */
  readonly share: number;
}

/**
 * The South Col route on the start's picture: the fixed rope's line from Base Camp to the summit,
 * through each camp and each landmark of the summit ridge. A place stands at the knowledge base's
 * altitude on the picture's scale (`Elevation`), and as far to the right of the summit as it does
 * seen along the picture's bearing; between the places the rope bends as the route does, through
 * the Icefall, up the Cwm and the Lhotse Face and across to the South Col, and from there it
 * follows the Southeast Ridge, Everest's skyline, to the top. The bends and the ridge's line are
 * the picture's own numbers; the altitudes are the mountain's.
 */
export class RouteMap {
  /** The route's places from Base Camp up, and how many metres to the right of the summit each
   * stands, seen along a bearing of 105°. */
  private static readonly PLACES: readonly (readonly [string, PlaceKind, number])[] = [
    ["base-camp", "camp", 21],
    ["camp-1", "camp", 1243],
    ["camp-2", "camp", 1451],
    ["camp-3", "camp", 2067],
    ["south-col", "camp", 1492],
    ["balcony", "landmark", 714],
    ["south-summit", "landmark", 269],
    ["hillary-step", "landmark", 150],
    ["summit", "summit", 0],
  ];
  /** The rope's bends on its way up to a place: through the Icefall to Camp 1, up the Cwm to
   * Camp 2, up the Lhotse Face to Camp 3, and over the Yellow Band and the Geneva Spur to the
   * South Col. */
  private static readonly BENDS: Readonly<Record<string, Polyline>> = {
    "camp-1": Polyline.of(
      ...[896, 746, 918, 734, 934, 736, 956, 719, 984, 710, 1002, 695, 1030, 685, 1050, 675],
    ),
    "camp-2": Polyline.of(1086, 640, 1092, 612),
    "camp-3": Polyline.of(1132, 560, 1164, 536, 1182, 505, 1195, 466),
    "south-col": Polyline.of(1218, 400, 1207, 376, 1182, 354, 1150, 333),
  };
  /** The Southeast Ridge's line on its way down from a place to the one below it: the notch
   * under the Hillary Step that makes the South Summit a summit, and the long ridge to the col. */
  private static readonly DOWN_THE_RIDGE: Readonly<Record<string, Polyline>> = {
    summit: Polyline.of(872, 165),
    "hillary-step": Polyline.of(896, 184.5),
    "south-summit": Polyline.of(915, 187, 928, 195, 940, 204, 952, 214, 962, 222),
    balcony: Polyline.of(
      ...[996, 247, 1010, 256, 1028, 267, 1045, 277, 1062, 286, 1080, 296, 1098, 306],
    ),
  };
  /** Where the rope takes to the ridge. */
  private static readonly ONTO_THE_RIDGE = "south-col";
  private static readonly RIDGE = { rough: 0.06, least: 14, seed: 12 };
  /** How far under the ridge's crest the rope lies, in pixels. */
  private static readonly UNDER_THE_CREST = 2.2;

  readonly places: readonly RoutePlace[];
  /** The Southeast Ridge from the summit down to the South Col: Everest's skyline on the right. */
  readonly ridge: Ridgeline;
  /** The rope's line, from Base Camp to the summit. */
  readonly way: Polyline;

  constructor(knowledge: KnowledgeBase, elevation: Elevation) {
    const stood = RouteMap.PLACES.map(([id, kind, right]) => {
      const altitude = knowledge.number(`route.${id}-altitude`);
      return { id, kind, altitude, peg: elevation.place(right, altitude) };
    });
    const onto = stood.findIndex(({ id }) => id === RouteMap.ONTO_THE_RIDGE);
    const down = stood.slice(onto).reverse();
    this.ridge = new Ridgeline(
      down.flatMap(({ id, peg }) => [peg, ...(RouteMap.DOWN_THE_RIDGE[id]?.points ?? [])]),
      RouteMap.RIDGE,
    );
    const below = stood
      .slice(0, onto)
      .flatMap(({ id, peg }) => [...(RouteMap.BENDS[id]?.points ?? []), peg]);
    const up = this.ridge.reversed().lowered(RouteMap.UNDER_THE_CREST);
    this.way = new Polyline([
      ...below,
      ...(RouteMap.BENDS[RouteMap.ONTO_THE_RIDGE]?.points ?? []),
      ...up.points,
    ]);
    const shares = this.way.shares();
    this.places = stood.map(({ id, kind, altitude, peg }, index) => {
      const at = index < onto ? peg : { x: peg.x, y: peg.y + RouteMap.UNDER_THE_CREST };
      const found = this.way.points.findIndex((point) => point.x === at.x && point.y === at.y);
      return { id, kind, altitude, at, share: shares[found] ?? 0 };
    });
  }

  /** The place called `id`. */
  place(id: string): RoutePlace {
    const found = this.places.find((place) => place.id === id);
    if (found === undefined) {
      throw new RangeError(`The route has no place ${id}`);
    }
    return found;
  }

  /** The rope's line from one place up to another, their marks included. */
  stretch(from: string, to: string): Polyline {
    const index = (id: string): number => {
      const { at } = this.place(id);
      return this.way.points.findIndex((point) => point.x === at.x && point.y === at.y);
    };
    return this.way.slice(index(from), index(to) + 1);
  }

  /** The rope as path data, smooth through its bends. */
  get path(): string {
    return this.way.smooth();
  }
}
