import type { CoachWorld } from "../interface/coach";
import type { ClimberView, Lamps, Point, SlopePhysics } from "../physics";
import type { ClimberId, HazardZone, ObjectiveHazards } from "../simulation";

/** The climb as the coach reads it (#192): the player's climber and the route's ropes, ladders,
 * blue ice and hazard zones, and the player's lamp (#196), from the physics, the hazards and the
 * lamps, which it only reads. */
export class CoachedClimb implements CoachWorld {
  constructor(
    private readonly physics: SlopePhysics,
    private readonly hazards: ObjectiveHazards,
    private readonly lamps: Lamps,
    private readonly climberId: ClimberId,
  ) {}

  player(): ClimberView {
    return this.physics.climber(this.climberId);
  }

  inTheDark(): boolean {
    return this.lamps.inTheDark(this.climberId);
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
