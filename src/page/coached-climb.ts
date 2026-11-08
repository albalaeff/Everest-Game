import type { CoachWorld } from "../interface/coach";
import type { ClimberView, Point, SlopePhysics } from "../physics";
import type { ClimberId, HazardZone, ObjectiveHazards } from "../simulation";

/** The climb as the coach reads it (#192): the player's climber and the route's ropes, ladders,
 * blue ice and hazard zones, from the physics and the hazards, which it only reads. */
export class CoachedClimb implements CoachWorld {
  constructor(
    private readonly physics: SlopePhysics,
    private readonly hazards: ObjectiveHazards,
    private readonly climberId: ClimberId,
  ) {}

  player(): ClimberView {
    return this.physics.climber(this.climberId);
  }

  along(): number {
    return this.physics.along(this.climberId);
  }

  ropeWithin(): string | null {
    return this.physics.ropeWithin(this.climberId);
  }

  get ropes(): readonly string[] {
    return this.physics.ropes;
  }

  rope(id: string): readonly Point[] {
    return this.physics.rope(id);
  }

  get ladders(): readonly string[] {
    return this.physics.ladders;
  }

  ladder(id: string): readonly Point[] {
    return this.physics.ladder(id);
  }

  get ice(): readonly { readonly from: number; readonly to: number }[] {
    return this.physics.ice;
  }

  get zones(): readonly HazardZone[] {
    return this.hazards.zones;
  }
}
