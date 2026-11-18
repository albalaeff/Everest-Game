import icefall from "../../content/route/icefall.json";
import { Sherpa } from "../agents";
import { SlopePhysics, Terrain } from "../physics";
import type {
  ClimberLayout,
  Kit,
  LadderLayout,
  RopeLayout,
  SlopeLayout,
  SlopeSettings,
  SnowLayout,
} from "../physics";
import {
  Body,
  Jolts,
  MountainClock,
  ObjectiveHazards,
  OxygenSystem,
  PACK_ITEMS,
  Packs,
  SeededRandom,
} from "../simulation";
import type {
  BodyStart,
  CampStore,
  ClimberId,
  ClockStart,
  HazardEvent,
  HazardStart,
  JoltStart,
  PackCounts,
  PackItem,
  PackNumbers,
  PackOf,
  Scenario,
  TentStart,
} from "../simulation";
import { Tents } from "../simulation";
import type { ClimberStart } from "./climber-facts";
import type { KnowledgeBase, KnowledgeRange } from "./knowledge-base";
import { PackFacts } from "./pack-facts";
import { SlopeFacts } from "./slope-facts";

/** A point as the data file keeps it: two numbers. */
type DataPair = readonly number[];

/** A tent as the data file pitches it (#258): where its door is, along the ground, and the way
 * its body lies from the door, 1 up the route and -1 down it. */
export interface TentData {
  readonly door: number;
  readonly lies: number;
}

/** A camp's stretch of the ground, as the data file keeps it: what its store and its kitchen
 * never run out of, everything at Base Camp; its tents, each by its door (#258); what its tents
 * hold of the stove's gas, in kilograms, and of meals, where they can run out; and whether
 * there's a guitar. */
export interface CampData {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly endless?: readonly string[];
  readonly tents?: readonly TentData[];
  readonly larder?: { readonly gas?: number; readonly meals?: number };
  readonly guitar?: boolean;
}

/** A part of the section, by the name the sources give it, and its stretch of the ground: the
 * parts follow each other from the section's foot to its top, with nothing between them. */
export interface PartData {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** A stretch of a section's ground, by how far along it its ends are. */
interface PartStretchData {
  readonly from: number;
  readonly to: number;
}

/** The snow on a section's ground, as its file gives it: level over the camps, and trodden flat
 * `trodden` metres round each, where the climbs set off and arrive. */
type SnowData = Omit<SnowLayout, "level"> & { readonly trodden: number };

/** A section of the route as its file in content/route/ has it: its ground and what's fixed on
 * it, its camps at each end, its hazards, and who sets off on it. Its numbers come from the
 * knowledge base by its ids: the camps' altitudes, the hours it takes, its length and the hour
 * it's set off on. */
export interface SectionData {
  readonly id: string;
  /** The camp it starts at, and the one it ends at: `route.<camp>-altitude` in the knowledge
   * base, and `time.<from>-to-<to>` its hours. */
  readonly from: string;
  readonly to: string;
  /** The day the expedition sets off on it. */
  readonly date: string;
  /** The climber of the layout whom the Sherpa's agent steers (#212), if the section has one:
   * never a player's seat. */
  readonly sherpa?: string;
  readonly layout: {
    readonly terrain: readonly DataPair[];
    /** The snow on the ground, if it has any. */
    readonly snow?: SnowData;
    /** The stretches of the ground that are bare blue ice, where the snow lies level on the line
     * and footing goes (#190). */
    readonly ice?: readonly PartStretchData[];
    /** The stretches of its faces of ice whose ice is brittle: a pick bites poorly there. */
    readonly brittle?: readonly PartStretchData[];
    readonly ropes: readonly RopeLayout[];
    readonly ladders: readonly LadderLayout[];
    readonly climbers: readonly ClimberLayout[];
  };
  /** Its parts, from its foot to its top, which the picture draws each in its own way. */
  readonly parts: readonly PartData[];
  readonly camps: readonly CampData[];
  readonly hazards: {
    readonly weather: string;
    readonly zones: readonly {
      readonly id: string;
      readonly kind: string;
      readonly from: number;
      readonly to: number;
    }[];
  };
  /** The stretches a jolt comes on (#197): the open slope a gust blows over, a lashed ladder's
   * from end to end, which twists. */
  readonly jolts?: {
    readonly zones: readonly {
      readonly id: string;
      readonly kind: string;
      readonly from: number;
      readonly to: number;
    }[];
  };
  /** Each climber's body as they set off: its `load` is what they wear and carry besides what
   * their pack holds. */
  readonly bodies: readonly BodyStart[];
  /** What each climber's pack holds as they set off, unless the player packs their own. */
  readonly packs?: readonly ({ readonly id: string } & Readonly<Record<string, number | string>>)[];
}

/** A camp on the section: its stretch of the ground, and its altitude from the knowledge base. */
export interface Camp extends CampData {
  readonly altitude: number;
}

/**
 * A section of the route, as the page plays it: the Khumbu Icefall, Base Camp to Camp 1, unless
 * another file is given (#26). Its ground, ropes and ladders are the file's; its ends' altitudes,
 * the hour it sets off at, its hours and its length are the knowledge base's, by the file's ids,
 * and so are the physics' numbers (`SlopeFacts`). It names its parts' and its camps' stretches for
 * the picture, and the camp it ends at for the arrival.
 */
export class Section {
  /** The training events' chance, apart from the expedition's: a seed's events are its own. */
  private static readonly TRAINING = 0x7a17;
  /** The staged serac collapse's id, among the hazards' zones and strikes. */
  static readonly COLLAPSE = "serac-collapse";
  /** The player's climber in the layout. */
  static readonly PLAYER: ClimberId = "player";

  readonly id: string;
  /** The climber the Sherpa's agent steers (#212), or none. */
  readonly sherpa: ClimberId | null;
  readonly settings: SlopeSettings;
  readonly layout: SlopeLayout;
  /** Its parts, from its foot to its top, end to end over its whole ground. */
  readonly parts: readonly PartData[];
  /** Its camps, in the layout's order: the first at its foot, the last at its top. */
  readonly camps: readonly Camp[];
  /** Each climber's body as they set off, in the layout's order: its load is what they carry
   * besides their pack. */
  readonly bodies: readonly BodyStart[];
  /** Each climber's pack as the file has it, in the layout's order; the packs' numbers; and the
   * camps' stores. */
  readonly packs: readonly PackOf[];
  readonly packNumbers: PackNumbers;
  readonly stores: readonly CampStore[];
  /** Its camps' tents as a scenario pitches them (#258): each one's door, the gas, in grams, and
   * the meals, and who sleeps when the players do, the Sherpa. */
  readonly tents: TentStart;
  /** Its weather and the stretches of it under a hazard, which `ObjectiveHazards.start` checks;
   * and the stretches a jolt comes on, in the same weather, which `Jolts.start` checks (#197). */
  readonly hazards: HazardStart;
  readonly jolts: JoltStart;
  readonly clock: ClockStart;
  /** The hours the sources give it the first time. */
  readonly hours: KnowledgeRange;
  /** Its real length, in metres. */
  readonly length: number;
  /** What the training events (#209) are staged on: how far short of its stretch a serac collapse
   * cracks, how long that stretch is, and the ladders long enough to break. */
  private readonly training: {
    readonly lead: number;
    readonly length: number;
    readonly crossings: readonly { readonly id: string; readonly length: number }[];
  };

  constructor(knowledge: KnowledgeBase, data: SectionData = icefall) {
    const { layout, hazards, bodies } = data;
    this.id = data.id;
    this.sherpa = data.sherpa ?? null;
    if (this.sherpa !== null && !layout.climbers.some(({ id }) => id === this.sherpa)) {
      throw new RangeError(`The Sherpa ${this.sherpa} isn't one of the climbers of ${data.id}`);
    }
    this.settings = new SlopeFacts(knowledge).settings;
    const terrain = Section.pairs(layout.terrain, data.id);
    const ground = new Terrain(terrain);
    const ice = Section.iceOf(layout.ice ?? [], ground.length, data.id);
    this.layout = {
      terrain,
      ...(layout.snow === undefined
        ? {}
        : { snow: Section.snow(layout.snow, data.camps, ice, ground.length) }),
      ...(ice.length === 0 ? {} : { ice }),
      ...(layout.brittle === undefined ? {} : { brittle: layout.brittle }),
      altitude: {
        start: knowledge.number(`route.${data.from}-altitude`),
        end: knowledge.number(`route.${data.to}-altitude`),
      },
      ropes: layout.ropes,
      ladders: layout.ladders,
      climbers: layout.climbers,
    };
    this.parts = Section.partsOf(data, ground.length);
    this.camps = data.camps.map((camp) => {
      if (!(camp.from >= 0 && camp.from < camp.to && camp.to <= ground.length)) {
        throw new RangeError(`The camp ${camp.id} isn't on the ground of ${data.id}`);
      }
      return { ...camp, altitude: knowledge.number(`route.${camp.id}-altitude`) };
    });
    if (!this.camps.some((camp) => camp.id === data.to)) {
      throw new RangeError(`${data.id} ends at ${data.to}, which isn't one of its camps`);
    }
    this.hazards = hazards as HazardStart;
    this.jolts = {
      weather: this.hazards.weather,
      zones: (data.jolts?.zones ?? []) as JoltStart["zones"],
    };
    this.bodies = layout.climbers.map(({ id }) => {
      const body = bodies.find((start) => start.id === id);
      if (body === undefined) {
        throw new RangeError(`${id} has no body on ${data.id}`);
      }
      return body;
    });
    this.packNumbers = new PackFacts(knowledge).numbers;
    this.packs = this.bodies.map(({ id, load }) => {
      const packed = data.packs?.find((pack) => pack.id === id);
      const items = Object.fromEntries(
        PACK_ITEMS.map((item) => [item, Number(packed?.[item] ?? 0)]),
      ) as Record<PackItem, number>;
      return { id, base: load, items };
    });
    const nothing = Object.fromEntries(PACK_ITEMS.map((item) => [item, 0])) as PackCounts;
    // A camp's store is in reach of its tents and the trodden snow round them, where the climbs
    // set off and arrive.
    const round = layout.snow?.trodden ?? 0;
    this.stores = data.camps.map(({ id, from, to, endless = [] }) => ({
      id,
      from: Math.max(0, from - round),
      to: Math.min(ground.length, to + round),
      stock: nothing,
      endless: PACK_ITEMS.filter((item) => endless.includes(item)),
    }));
    // A tent's door is in reach of its camp's store, as the trodden snow round the camp is.
    const kilogram = 1000;
    this.tents = {
      camps: data.camps.map(({ id, from, to, endless = [], tents = [], larder = {}, guitar }) => {
        for (const { door, lies } of tents) {
          const near =
            door >= Math.max(0, from - round) && door <= Math.min(ground.length, to + round);
          if (!near || (lies !== 1 && lies !== -1)) {
            throw new RangeError(`A tent of ${id} isn't pitched by the camp on ${data.id}`);
          }
        }
        return {
          id,
          doors: tents.map(({ door }) => door),
          gas: endless.includes("gas") ? null : (larder.gas ?? 0) * kilogram,
          meals: endless.includes("meals") ? null : (larder.meals ?? 0),
          guitar: guitar === true,
        };
      }),
      npcs: this.sherpa === null ? [] : [this.sherpa],
    };
    this.clock = {
      date: data.date,
      time: MountainClock.text(knowledge.number(`time.${data.from}-departure`) * 3600),
    };
    this.hours = knowledge.range(`time.${data.from}-to-${data.to}`);
    this.length = knowledge.number(`route.${data.id}-length`);
    const shortest = knowledge.number("hazards.training-ladder-length");
    this.training = {
      lead: knowledge.number("hazards.training-serac-lead"),
      length: knowledge.number("hazards.training-serac-length"),
      crossings: layout.ladders
        .map(({ id, from, to }) => {
          const start = ground.point(from);
          const end = ground.point(to);
          const x = end.x - start.x;
          const y = end.y - start.y;
          return { id, length: Math.sqrt(x * x + y * y), across: Math.abs(y) < Math.abs(x) };
        })
        .filter(({ across, length }) => across && length >= shortest)
        .map(({ id, length }) => ({ id, length })),
    };
  }

  /** Where the logbook counts (#194): from the moraine's end, where the route first needs a
   * rope, to the camp the section ends at. */
  get logged(): { readonly from: number; readonly to: number } {
    const [first] = this.parts;
    return { from: first?.id === "moraine" ? first.to : 0, to: this.destination.from };
  }

  /** The camp the section sets off from, for its Sherpa, who carries a client who can't walk
   * down to it (#241): the first of its camps, if it's not the one it ends at. */
  private get sherpaBase(): { readonly base?: { readonly from: number; readonly to: number } } {
    const [first] = this.camps;
    return first === undefined || first === this.destination
      ? {}
      : { base: { from: first.from, to: first.to } };
  }

  /** The stretch of the camp the section sets off from, along the ground: where a climber who
   * can't walk is carried down to, and the climb ends, evacuated (#241). None if the section has
   * the one camp. */
  get base(): { readonly from: number; readonly to: number } | null {
    return this.sherpaBase.base ?? null;
  }

  /** The camp the section ends at: reaching its stretch is the arrival. */
  get destination(): Camp {
    const camp = this.camps.at(-1);
    if (camp === undefined) {
      throw new RangeError(`${this.id} has no camps`);
    }
    return camp;
  }

  /** A scenario on the section: the seed, the climbers in the layout's order, the clock at its
   * start, the player as their answers make them (#145), or as the file has them, and with what
   * they checked of their kit (#196): a skipped water check leaves them `unchecked` litres short.
   * Unless `training` is off, it stages the training events from the seed (#209), for the
   * players alone (#212). The player carries the `pack` they chose at Base Camp, or the file's:
   * its weight on their body with what they carry besides, its jumar and its tools on their
   * harness, its bottles their oxygen. The Sherpa, if the section has one, is its NPC, guiding
   * the players; `alone`, the player is the only one, with no seat for a teammate (#212). */
  scenario(
    seed: number,
    player?: ClimberStart,
    gear?: { readonly kit: Kit; readonly unchecked: number },
    training = true,
    pack?: PackCounts,
    alone = false,
  ): Scenario {
    const made = this.climbing(alone, player === undefined ? this : this.withPlayer(player));
    const checked = gear === undefined ? made : Section.withKit(made, gear);
    const packs = this.packs.map((packed) =>
      packed.id === Section.PLAYER && pack !== undefined ? { ...packed, items: pack } : packed,
    );
    const packOf = (id: ClimberId): PackOf => {
      const packed = packs.find((one) => one.id === id);
      if (packed === undefined) {
        throw new RangeError(`${id} has no pack on ${this.id}`);
      }
      return packed;
    };
    const bodies = checked.bodies.map((body) => {
      const { base, items } = packOf(body.id);
      return { ...body, load: base + Packs.weight(items, this.packNumbers) };
    });
    const layout = {
      ...checked.layout,
      climbers: checked.layout.climbers.map((climber) => {
        const { items } = packOf(climber.id);
        const gear = {
          jumar: items.jumar > 0,
          tools: 1 + items["ice-tool"],
          firstAid: items["first-aid"] > 0,
          rescueKit: items["rescue-kit"] > 0,
        };
        return { ...climber, gear };
      }),
    };
    const climbers = layout.climbers.map((climber) => climber.id);
    const { sherpa } = this;
    const trainees = climbers.filter((id) => id !== sherpa);
    const staged = training ? this.staged(seed) : { collapse: null, ladder: null };
    const hazards: HazardStart =
      staged.collapse === null
        ? this.hazards
        : { ...this.hazards, events: [{ ...staged.collapse, trainees }] };
    const breaking = staged.ladder;
    const ladders =
      breaking === null
        ? layout.ladders
        : layout.ladders.map((ladder) =>
            ladder.id === breaking.id ? { ...ladder, breaks: breaking.breaks, trainees } : ladder,
          );
    const guided =
      sherpa === null
        ? {}
        : {
            [Sherpa.NAME]: Sherpa.start({
              ...this.sherpaBase,
              climber: sherpa,
              clients: trainees,
              arrival: { from: this.destination.from, to: this.destination.to },
            }),
          };
    return {
      seed,
      climbers,
      ...(sherpa === null ? {} : { npcs: [sherpa] }),
      start: {
        ...guided,
        [MountainClock.NAME]: MountainClock.start(this.clock),
        [OxygenSystem.NAME]: OxygenSystem.start(climbers, (id) => packOf(id).items.oxygen),
        [Body.NAME]: Body.start(bodies),
        [Packs.NAME]: Packs.start(
          { climbers: packs.filter(({ id }) => climbers.includes(id)), camps: this.stores },
          this.packNumbers,
        ),
        [Tents.NAME]: Tents.start(this.tents),
        [ObjectiveHazards.NAME]: ObjectiveHazards.start(hazards),
        [Jolts.NAME]: Jolts.start(this.jolts),
        [SlopePhysics.NAME]: SlopePhysics.start({ ...layout, ladders }),
      },
    };
  }

  /** The training events a seed stages (#209), once a climb each, from a chance of their own so
   * the expedition's draws aren't touched: a serac collapse on a stretch of one of the serac
   * zones, and a break in the middle third of one of the ladders long enough to break. */
  staged(seed: number): {
    readonly collapse: HazardEvent | null;
    readonly ladder: { readonly id: string; readonly breaks: number } | null;
  } {
    const random = SeededRandom.fromSeed(seed ^ Section.TRAINING);
    const seracs = this.hazards.zones.filter(({ kind }) => kind === "serac");
    const zone = seracs[random.between(0, seracs.length - 1)];
    const { lead, length, crossings } = this.training;
    let collapse: HazardEvent | null = null;
    if (zone !== undefined) {
      const room = Math.max(0, zone.to - zone.from - length);
      const from = zone.from + random.fraction() * room;
      const to = Math.min(zone.to, from + length);
      collapse = { id: Section.COLLAPSE, kind: "serac", from, to, lead };
    }
    const crossing = crossings[random.between(0, crossings.length - 1)];
    const ladder =
      crossing === undefined
        ? null
        : { id: crossing.id, breaks: (crossing.length * (1 + random.fraction())) / 3 };
    return { collapse, ladder };
  }

  /** A serac collapse staged over `along` on the spot, called `id` (#245), as the seed stages one
   * on a serac zone (`staged`): the training's stretch round it, as far as the ground lets it,
   * cracking the training's lead short of it. */
  collapseOver(along: number, id: string): HazardEvent {
    const { lead, length } = this.training;
    const end = new Terrain(this.layout.terrain).length;
    const from = Math.max(0, Math.min(along - length / 2, end - length));
    return { id, kind: "serac", from, to: Math.min(end, from + length), lead };
  }

  /** A ladder staged to break on the spot (#245): the first crossing long enough to break that a
   * climber `along` the ground hasn't crossed yet, the one under them too, breaking in its middle,
   * where the seed breaks one in its middle third (`staged`); none past the last of them. */
  breakAhead(along: number): { readonly id: string; readonly breaks: number } | null {
    const crossing = this.training.crossings.find(({ id }) =>
      this.layout.ladders.some((ladder) => ladder.id === id && ladder.to > along),
    );
    return crossing === undefined ? null : this.breakOf(crossing.id);
  }

  /** The ladder `id` staged to break on the spot (#245), in the middle of its length. */
  breakOf(id: string): { readonly id: string; readonly breaks: number } {
    const ladder = this.layout.ladders.find((laid) => laid.id === id);
    if (ladder === undefined) {
      throw new RangeError(`${this.id} has no ladder ${id}`);
    }
    const ground = new Terrain(this.layout.terrain);
    const start = ground.point(ladder.from);
    const end = ground.point(ladder.to);
    const x = end.x - start.x;
    const y = end.y - start.y;
    return { id, breaks: Math.sqrt(x * x + y * y) / 2 };
  }

  /** The bodies and the layout of the climbers who climb: everyone the file has, or, `alone`, the
   * player and the Sherpa, with no seat for a teammate (#212). */
  private climbing(
    alone: boolean,
    { bodies, layout }: { readonly bodies: readonly BodyStart[]; readonly layout: SlopeLayout },
  ): { readonly bodies: readonly BodyStart[]; readonly layout: SlopeLayout } {
    if (!alone) {
      return { bodies, layout };
    }
    const kept = (id: ClimberId): boolean => id === Section.PLAYER || id === this.sherpa;
    return {
      bodies: bodies.filter(({ id }) => kept(id)),
      layout: { ...layout, climbers: layout.climbers.filter(({ id }) => kept(id)) },
    };
  }

  /** The bodies and the layout, with the player as their answers make them. */
  private withPlayer(player: ClimberStart): {
    readonly bodies: readonly BodyStart[];
    readonly layout: SlopeLayout;
  } {
    const { mass, fitness, technique } = player;
    const mine = (id: ClimberId): boolean => id === Section.PLAYER;
    const climbers = this.layout.climbers.map((climber) =>
      mine(climber.id) ? { ...climber, technique } : climber,
    );
    return {
      bodies: this.bodies.map((body) => (mine(body.id) ? { ...body, mass, fitness } : body)),
      layout: { ...this.layout, climbers },
    };
  }

  /** The bodies and the layout with the player's kit: on their climber, and their water short by
   * `unchecked` litres if they didn't fill their bottles. */
  private static withKit(
    { bodies, layout }: { readonly bodies: readonly BodyStart[]; readonly layout: SlopeLayout },
    { kit, unchecked }: { readonly kit: Kit; readonly unchecked: number },
  ): { readonly bodies: readonly BodyStart[]; readonly layout: SlopeLayout } {
    const mine = (id: ClimberId): boolean => id === Section.PLAYER;
    return {
      bodies: bodies.map((body) =>
        mine(body.id) && !kit.water ? { ...body, water: body.water + unchecked } : body,
      ),
      layout: {
        ...layout,
        climbers: layout.climbers.map((climber) =>
          mine(climber.id) ? { ...climber, kit } : climber,
        ),
      },
    };
  }

  /** The file's parts, each from where the one before it ends, the first from the foot and the
   * last to the top. */
  private static partsOf({ id, parts }: SectionData, length: number): readonly PartData[] {
    if (parts.length === 0) {
      throw new RangeError(`${id} has no parts`);
    }
    for (const [index, part] of parts.entries()) {
      const from = parts[index - 1]?.to ?? 0;
      const to = index === parts.length - 1 ? length : part.to;
      if (!(part.from === from && part.to === to && from < to)) {
        throw new RangeError(`The part ${part.id} of ${id} isn't from ${from} to ${to} m along`);
      }
    }
    return parts;
  }

  /** The file's snow, level over the camps and `trodden` metres round each, as far as the
   * ground goes, and gone from its bare ice, where it lies level on the line. */
  private static snow(
    { trodden, ...snow }: SnowData,
    camps: readonly CampData[],
    ice: readonly PartStretchData[],
    length: number,
  ): SnowLayout {
    const level = camps.map(({ from, to }) => ({
      from: Math.max(from - trodden, 0),
      to: Math.min(to + trodden, length),
    }));
    return { ...snow, level: [...level, ...ice] };
  }

  /** The file's stretches of bare ice, each on the ground. */
  private static iceOf(
    ice: readonly PartStretchData[],
    length: number,
    id: string,
  ): readonly PartStretchData[] {
    for (const { from, to } of ice) {
      if (!(from >= 0 && from < to && to <= length)) {
        throw new RangeError(`The ice from ${from} to ${to} m isn't on the ground of ${id}`);
      }
    }
    return ice.map(({ from, to }) => ({ from, to }));
  }

  private static pairs(points: readonly DataPair[], id: string): (readonly [number, number])[] {
    return points.map((point, index) => {
      const [x, y] = point;
      if (point.length !== 2 || x === undefined || y === undefined) {
        throw new RangeError(`Point ${index} of ${id} isn't a pair of numbers`);
      }
      return [x, y];
    });
  }
}
