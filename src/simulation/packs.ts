import type { ClimberId, GameAction } from "./game-action";
import type { Json } from "./json";
import type { Moment, Rule } from "./rule";

/** What a climber chooses to carry or leave: the jumar, a second ice tool, litres of water, bars
 * of food and bottles of oxygen. What every climber wears and carries anyway, the ice axe among
 * it, is their body's own load. */
export const PACK_ITEMS = ["jumar", "ice-tool", "water", "food", "oxygen"] as const;
export type PackItem = (typeof PACK_ITEMS)[number];

/** How many of each: units of the jumar, the tool, the bars and the bottles, litres of water. */
export type PackCounts = Readonly<Record<PackItem, number>>;

/** The pack's numbers, from the knowledge base: what one of each weighs in kilograms, a litre for
 * the water; the most of each a climber carries; the litres a drink takes; and the kcal in a bar. */
export interface PackNumbers {
  readonly weights: PackCounts;
  readonly most: PackCounts;
  readonly sip: number;
  readonly bar: number;
}

/** A camp's stretch of the ground and what it holds: how many of each, and the items it never
 * runs out of, as Base Camp's stores don't, or a camp's water, melted from its snow. */
export interface CampStore {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly stock: PackCounts;
  readonly endless: readonly PackItem[];
}

/** A climber's pack as they set off, and the load they carry besides it, in kilograms. */
export interface PackOf {
  readonly id: ClimberId;
  readonly base: number;
  readonly items: PackCounts;
}

export interface PackStart {
  readonly climbers: readonly PackOf[];
  readonly camps: readonly CampStore[];
}

/** A climber's pack as the rest of the game sees it: what's in it, what it weighs, the camp they
 * stand in, if any, and what that camp holds: `null` for an item it never runs out of. */
export interface PackView {
  readonly items: PackCounts;
  readonly weight: number;
  readonly camp: string | null;
  readonly stock: Readonly<Record<PackItem, number | null>> | null;
}

/** Whose shoulders the packs are on: the body, which carries the load, drinks and eats. */
export interface Shoulders {
  carry(id: ClimberId, kilograms: number): void;
  drink(id: ClimberId, litres: number): void;
  eat(id: ClimberId, kcal: number): void;
}

/** Where the climbers are and what's on their harness: the slope physics, which uses the jumar
 * and the ice tools. */
export interface Harness {
  along(id: ClimberId): number;
  climber(id: ClimberId): { readonly falling: boolean; readonly dead: boolean };
  equip(id: ClimberId, gear: { readonly jumar: boolean; readonly tools: number }): void;
}

/** The bottles of oxygen a climber carries: the oxygen system counts them, and breathes them. */
export interface Bottles {
  climber(id: ClimberId): { readonly bottles: number };
  stock(id: ClimberId, bottles: number): void;
}

type PacksSave = {
  readonly climbers: readonly PackOf[];
  readonly camps: readonly CampStore[];
};

/**
 * The packs: what each climber chose to carry, and what the camps hold. A climber packs at Base
 * Camp before they set off, and again at every camp: standing in a camp's stretch, on their feet,
 * they take an item from its store or leave one there, one at a time. Anywhere, they drink their
 * water and eat their food. Each step the rule tells the body the load on its shoulders and the
 * slope physics what's on the harness, so a litre drunk is a kilogram less to carry, a jumar left
 * in the tent climbs no rope, and a second ice tool is a second pick in the ice. It runs before
 * the oxygen, the body and the physics, which read this step what it set. The bottles of oxygen
 * are the oxygen system's to count: the pack weighs what it shows.
 */
export class Packs implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "packs";

  readonly name = Packs.NAME;
  private readonly packs = new Map<ClimberId, { base: number; items: Record<PackItem, number> }>();
  private camps: { store: CampStore; stock: Record<PackItem, number> }[] = [];

  constructor(
    private readonly numbers: PackNumbers,
    private readonly shoulders: Shoulders,
    private readonly harness: Harness,
    private readonly bottles: Bottles,
  ) {}

  /** The state a scenario starts the packs in: each climber's within what one carries. */
  static start(start: PackStart, numbers: PackNumbers): Json {
    for (const { id, base, items } of start.climbers) {
      if (!(base >= 0)) {
        throw new RangeError(`${id} can't carry ${base} kg besides their pack`);
      }
      for (const item of PACK_ITEMS) {
        if (!(items[item] >= 0 && items[item] <= numbers.most[item])) {
          throw new RangeError(`${id} can't pack ${items[item]} of ${item}`);
        }
      }
    }
    const save: PacksSave = { climbers: start.climbers, camps: start.camps };
    return save as unknown as Json;
  }

  /** What `items` weigh, in kilograms. */
  static weight(items: PackCounts, numbers: PackNumbers): number {
    return PACK_ITEMS.reduce((sum, item) => sum + items[item] * numbers.weights[item], 0);
  }

  load(state: Json): void {
    const save = state as unknown as PacksSave;
    this.packs.clear();
    for (const { id, base, items } of save.climbers) {
      this.packs.set(id, { base, items: { ...items } });
    }
    this.camps = save.camps.map((store) => ({ store, stock: { ...store.stock } }));
  }

  save(): Json {
    const save: PacksSave = {
      climbers: [...this.packs].map(([id, { base, items }]) => ({ id, base, items: { ...items } })),
      camps: this.camps.map(({ store, stock }) => ({ ...store, stock: { ...stock } })),
    };
    return save as unknown as Json;
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      if (action.kind === "pack") {
        this.change(action);
      } else if (action.kind === "use") {
        this.use(action);
      }
    }
    for (const [id, pack] of this.packs) {
      const items = this.counted(id, pack.items);
      this.shoulders.carry(id, pack.base + Packs.weight(items, this.numbers));
      this.harness.equip(id, { jumar: items.jumar > 0, tools: 1 + items["ice-tool"] });
    }
  }

  /** A climber's pack: what's in it and what it weighs, and the camp they stand in. */
  pack(id: ClimberId): PackView {
    const items = this.counted(id, this.packOf(id).items);
    const camp = this.campOf(id);
    return {
      items,
      weight: Packs.weight(items, this.numbers),
      camp: camp?.store.id ?? null,
      stock:
        camp === null
          ? null
          : (Object.fromEntries(
              PACK_ITEMS.map((item) => [
                item,
                camp.store.endless.includes(item) ? null : camp.stock[item],
              ]),
            ) as Record<PackItem, number | null>),
    };
  }

  /** The most of an item one climber carries. */
  most(item: PackItem): number {
    return this.numbers.most[item];
  }

  /** The pack with its bottles as the oxygen system counts them now. */
  private counted(id: ClimberId, items: PackCounts): PackCounts {
    return { ...items, oxygen: this.bottles.climber(id).bottles };
  }

  /** In a camp, on their feet: one of an item out of its store into the pack, or back. */
  private change(action: Extract<GameAction, { kind: "pack" }>): void {
    const { climber, item, change } = action;
    const pack = this.packOf(climber);
    const camp = this.campOf(climber);
    if (camp === null) {
      return;
    }
    const endless = camp.store.endless.includes(item);
    const have = this.counted(climber, pack.items)[item];
    if (change === "take") {
      if (have + 1 > this.numbers.most[item] || (!endless && camp.stock[item] < 1)) {
        return;
      }
      camp.stock[item] -= endless ? 0 : 1;
      this.put(climber, pack.items, item, have + 1);
    } else {
      if (have <= 0) {
        return;
      }
      // What's left of an opened litre goes back with it.
      const left = Math.min(1, have);
      camp.stock[item] += endless ? 0 : left;
      this.put(climber, pack.items, item, have - left);
    }
  }

  /** A drink of their water, or a bar of their food, if they have it. */
  private use(action: Extract<GameAction, { kind: "use" }>): void {
    const { climber, item } = action;
    const pack = this.packOf(climber);
    const { falling, dead } = this.harness.climber(climber);
    if (dead || falling) {
      return;
    }
    if (item === "water") {
      const litres = Math.min(this.numbers.sip, pack.items.water);
      if (litres > 0) {
        pack.items.water -= litres;
        this.shoulders.drink(climber, litres);
      }
    } else if (pack.items.food >= 1) {
      pack.items.food -= 1;
      this.shoulders.eat(climber, this.numbers.bar);
    }
  }

  private put(id: ClimberId, items: Record<PackItem, number>, item: PackItem, count: number): void {
    if (item === "oxygen") {
      this.bottles.stock(id, count);
    } else {
      items[item] = count;
    }
  }

  /** The camp a climber stands in, on their feet, or none. */
  private campOf(id: ClimberId): { store: CampStore; stock: Record<PackItem, number> } | null {
    const { falling, dead } = this.harness.climber(id);
    if (falling || dead) {
      return null;
    }
    const along = this.harness.along(id);
    return this.camps.find(({ store }) => along >= store.from && along <= store.to) ?? null;
  }

  private packOf(id: ClimberId): { base: number; items: Record<PackItem, number> } {
    const pack = this.packs.get(id);
    if (pack === undefined) {
      throw new RangeError(`${id} has no pack on this expedition`);
    }
    return pack;
  }
}
