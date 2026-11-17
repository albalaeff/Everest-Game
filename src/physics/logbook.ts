import type { ClimberId, Json, MountainClock, ObjectiveHazards, Rule } from "../simulation";
import type { SlopePhysics } from "./slope-physics";
import type { Point } from "./terrain";

/** One climber's page of the logbook, in the mountain's seconds, and the hours they arrived or
 * died at, as seconds since midnight, or none yet. */
export type LogPage = {
  readonly id: ClimberId;
  /** On the route with no cowstail on a rope; and of that, where a slip was a fall: on blue ice,
   * on a ladder across a crevasse, or by one. */
  readonly unclipped: number;
  readonly exposed: number;
  /** Under the seracs; and of that, standing still. */
  readonly underSeracs: number;
  readonly stopped: number;
  readonly arrived: number | null;
  readonly died: number | null;
  /** The hour they were set down in the camp the section set off from, carried down with a bone
   * broken (#241): none yet, and missing from the saves of builds before it. */
  readonly evacuated?: number | null;
};

/** The logbook's whole state, as saves keep it. */
type LogbookSave = { readonly pages: readonly LogPage[] };

/** Where on the section the logbook counts: from where the route needs a rope to the camp it
 * ends at. */
export interface LoggedStretch {
  readonly from: number;
  readonly to: number;
}

/**
 * The climb's logbook (#194), as a rule run after the physics in each step: for each climber,
 * how long they were unclipped on the route, and how long where a slip was a fall; how long they
 * spent under the seracs, and how long they stood still there; and the hours they arrived at the
 * camp and died at, or were set down in the camp they set off from, carried down hurt (#241). The debrief reads it; the falls the rope caught are the physics' own. It only
 * reads the physics and the hazards, and keeps its own numbers, which a save keeps.
 */
export class Logbook implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "logbook";
  /** How far from a crevasse's ladder an unclipped climber is where a slip is a fall. */
  static readonly BY_A_CREVASSE = 3;

  readonly name = Logbook.NAME;
  private pages = new Map<ClimberId, LogPage>();

  constructor(
    private readonly physics: SlopePhysics,
    private readonly hazards: ObjectiveHazards,
    private readonly clock: MountainClock,
    private readonly stretch: LoggedStretch,
    /** How far along the ground the camp the section sets off from reaches, where a climber who
     * can't walk is carried down to (#241): none where the section has no such camp. */
    private readonly base: number | null = null,
  ) {}

  /** A scenario's start state: an empty page for each climber. */
  static start(climbers: readonly ClimberId[]): Json {
    const pages: LogPage[] = climbers.map((id) => ({
      id,
      unclipped: 0,
      exposed: 0,
      underSeracs: 0,
      stopped: 0,
      arrived: null,
      died: null,
    }));
    const save: LogbookSave = { pages };
    return save;
  }

  /** A climber's page. */
  page(id: ClimberId): LogPage {
    const page = this.pages.get(id);
    if (page === undefined) {
      throw new RangeError(`${id} has no page in the logbook`);
    }
    return page;
  }

  load(state: Json): void {
    const { pages } = state as unknown as LogbookSave;
    this.pages = new Map(pages.map((page) => [page.id, page] as const));
  }

  save(): Json {
    const save: LogbookSave = { pages: [...this.pages.values()] };
    return save;
  }

  advance(): void {
    const seconds = this.clock.secondsAStep;
    const hour = this.clock.timeOfDay;
    for (const [id, page] of this.pages) {
      this.pages.set(id, this.write(page, seconds, hour));
    }
  }

  /** A climber's page after a step of `seconds`, at `hour`. */
  private write(page: LogPage, seconds: number, hour: number): LogPage {
    const { physics } = this;
    if (page.died !== null || page.arrived !== null || (page.evacuated ?? null) !== null) {
      return page;
    }
    const view = physics.climber(page.id);
    if (view.dead) {
      return { ...page, died: hour };
    }
    const along = physics.along(page.id);
    if (this.base !== null && view.down && along <= this.base) {
      // Set down in the camp they set off from: the evacuation is over.
      return { ...page, evacuated: hour };
    }
    if (along >= this.stretch.to) {
      return { ...page, arrived: hour };
    }
    if (along < this.stretch.from) {
      return page;
    }
    const clipped = view.first !== null || view.second !== null;
    const exposed = !clipped && this.exposed(along, view);
    const underSeracs = this.hazards.zones.some(
      (zone) => zone.kind === "serac" && along >= zone.from && along <= zone.to,
    );
    return {
      ...page,
      unclipped: page.unclipped + (clipped ? 0 : seconds),
      exposed: page.exposed + (exposed ? seconds : 0),
      underSeracs: page.underSeracs + (underSeracs ? seconds : 0),
      stopped: page.stopped + (underSeracs && !view.moving && !view.falling ? seconds : 0),
    };
  }

  /** Whether a climber at `along` is where a slip is a fall: on blue ice, or on a ladder across a
   * crevasse or by one. */
  private exposed(along: number, view: Point & { readonly ladder: string | null }): boolean {
    const { physics } = this;
    if (physics.ice.some(({ from, to }) => along >= from && along <= to)) {
      return true;
    }
    return physics.ladders.some((id) => {
      const [start, end] = physics.ladder(id);
      if (start === undefined || end === undefined) {
        return false;
      }
      const across = Math.abs(end.y - start.y) < Math.abs(end.x - start.x);
      const near = (point: Point): boolean => {
        const x = point.x - view.x;
        const y = point.y - view.y;
        return Math.sqrt(x * x + y * y) <= Logbook.BY_A_CREVASSE;
      };
      return across && (view.ladder === id || near(start) || near(end));
    });
  }
}
