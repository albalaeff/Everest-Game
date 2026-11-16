import type { Section } from "../content/section";

/** The kinds of place the god mode goes to (#245), in the order its list shows them. */
export const GOD_PLACE_KINDS = ["camp", "part", "ladder", "face", "hazard", "training"] as const;

export type GodPlaceKind = (typeof GOD_PLACE_KINDS)[number];

/** A place on the route the god mode goes to: `kind:name`, and where a climber stands there,
 * in metres along the ground. */
export interface GodPlace {
  readonly id: string;
  readonly kind: GodPlaceKind;
  /** Its id in the route's file: a camp's, a part's, a ladder's, a hazard's stretch's; a step of
   * ice's part; the ladder a training break is staged on. */
  readonly name: string;
  readonly along: number;
}

/** A step of ice with no ladder, by its ends along the ground (`SlopePhysics.bareFaces`). */
export interface BareFace {
  readonly foot: number;
  readonly top: number;
}

/**
 * The places of the route the god mode goes to (#245), from its file and the training the climb's
 * seed staged on it: each camp, in its middle; each part of the route, where it begins; each
 * ladder and each step of ice with no ladder, a step short of it, so the next step is the
 * player's; each hazard's stretch, where it begins; and the training events (#209), a step short
 * of where the collapse cracks or the ladder that breaks. A step of ice goes by the part it's in.
 */
export class GodPlaces {
  /** How far short of a ladder, a step of ice or a collapse's crack a place is, in metres. */
  private static readonly SHORT = 1;

  readonly all: readonly GodPlace[];

  constructor(route: Section, faces: readonly BareFace[], seed: number) {
    const { SHORT } = GodPlaces;
    const place = (kind: GodPlaceKind, name: string, along: number): GodPlace => ({
      id: `${kind}:${name}`,
      kind,
      name,
      along: Math.max(0, along),
    });
    const { collapse, ladder } = route.staged(seed);
    const breaking = route.layout.ladders.find(({ id }) => id === ladder?.id);
    this.all = [
      ...route.camps.map(({ id, from, to }) => place("camp", id, (from + to) / 2)),
      ...route.parts.map(({ id, from }) => place("part", id, from)),
      ...route.layout.ladders.map(({ id, from }) => place("ladder", id, from - SHORT)),
      ...this.faceNames(route, faces).map(({ name, foot }) => place("face", name, foot - SHORT)),
      ...route.hazards.zones.map(({ id, from }) => place("hazard", id, from)),
      ...(collapse === null
        ? []
        : [place("training", collapse.id, collapse.from - collapse.lead - SHORT)]),
      ...(breaking === undefined ? [] : [place("training", breaking.id, breaking.from - SHORT)]),
    ];
  }

  /** Where a climber stands at the place `id`, in metres along the ground. */
  along(id: string): number {
    const found = this.all.find((place) => place.id === id);
    if (found === undefined) {
      throw new RangeError(`The god mode knows no place ${id}`);
    }
    return found.along;
  }

  /** Each step of ice named after the part of the route its foot is in, a second in one part
   * after it with `-2`. */
  private faceNames(
    route: Section,
    faces: readonly BareFace[],
  ): readonly { readonly name: string; readonly foot: number }[] {
    const counted = new Map<string, number>();
    return faces.map(({ foot }) => {
      const part = route.parts.find(({ from, to }) => foot >= from && foot < to)?.id ?? route.id;
      const count = (counted.get(part) ?? 0) + 1;
      counted.set(part, count);
      return { name: count === 1 ? part : `${part}-${count}`, foot };
    });
  }
}
