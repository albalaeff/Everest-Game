import type { ClimberId } from "../game-action";
import type { JoltGround } from "../jolts";
import type { HazardGround } from "../objective-hazards";

/**
 * The ground as the hazards' and the jolts' tests have it: climbers standing where a test puts
 * them, clipped to a rope or on a ladder if it says so, as unsteady as it says, and the knocks,
 * deaths and upsets the hazards and the jolts give them, standing in for the slope physics, which
 * the core's tests can't import. Only tests import it.
 */
export class TestGround implements HazardGround, JoltGround {
  /** Each knock, in order: who, and on which step. */
  readonly knocks: { readonly climber: ClimberId; readonly step: number }[] = [];
  /** Each death, in order: who, and on which step. */
  readonly kills: { readonly climber: ClimberId; readonly step: number }[] = [];
  /** Each upset by a jolt, in order: who, and on which step (#197). */
  readonly upsets: { readonly climber: ClimberId; readonly step: number }[] = [];
  private readonly places: Map<ClimberId, number>;
  private readonly onRope = new Set<ClimberId>();
  private readonly onLadders = new Set<ClimberId>();
  private readonly unsteady = new Map<ClimberId, number>();

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

  onALadder(climber: ClimberId): boolean {
    return this.onLadders.has(climber);
  }

  /** How unsteady a climber is: 1, on the move where a slip can happen, unless a test says. */
  unsteadiness(climber: ClimberId): number {
    return this.unsteady.get(climber) ?? 1;
  }

  upset(climber: ClimberId, step: number): void {
    this.upsets.push({ climber, step });
  }

  /** Puts a climber on a ladder. */
  onto(climber: ClimberId): void {
    this.onLadders.add(climber);
  }

  /** Sets how unsteady a climber is from now on. */
  steady(climber: ClimberId, unsteadiness: number): void {
    this.unsteady.set(climber, unsteadiness);
  }
}
