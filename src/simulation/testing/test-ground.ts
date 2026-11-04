import type { ClimberId } from "../game-action";
import type { HazardGround } from "../objective-hazards";

/**
 * The ground as the hazards' tests have it: climbers standing where a test puts them, clipped to
 * a rope if it says so, and the knocks and deaths the hazards give them, standing in for the
 * slope physics, which the core's tests can't import. Only tests import it.
 */
export class TestGround implements HazardGround {
  /** Each knock, in order: who, and on which step. */
  readonly knocks: { readonly climber: ClimberId; readonly step: number }[] = [];
  /** Each death, in order: who, and on which step. */
  readonly kills: { readonly climber: ClimberId; readonly step: number }[] = [];
  private readonly places: Map<ClimberId, number>;
  private readonly onRope = new Set<ClimberId>();

  constructor(places: Readonly<Record<ClimberId, number>>) {
    this.places = new Map(Object.entries(places));
  }

  get climbers(): readonly ClimberId[] {
    return [...this.places.keys()];
  }

  along(climber: ClimberId): number {
    const along = this.places.get(climber);
    if (along === undefined) {
      throw new RangeError(`${climber} isn't on the test ground`);
    }
    return along;
  }

  clipped(climber: ClimberId): boolean {
    return this.onRope.has(climber);
  }

  knock(climber: ClimberId, step: number): void {
    this.knocks.push({ climber, step });
  }

  kill(climber: ClimberId, step: number): void {
    this.kills.push({ climber, step });
  }

  /** Moves a climber to `along`. */
  put(climber: ClimberId, along: number): void {
    this.places.set(climber, along);
  }

  /** Clips a climber to a rope. */
  clip(climber: ClimberId): void {
    this.onRope.add(climber);
  }
}
