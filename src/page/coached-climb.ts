import type { CoachWorld } from "../interface/coach";
import type { ClimberView, LadderCondition, Lamps, Point, SlopePhysics } from "../physics";
import type {
  ClimberId,
  HazardKind,
  HazardZone,
  JoltKind,
  Jolts,
  ObjectiveHazards,
} from "../simulation";

/** The climb as the coach reads it (#192): the player's climber and the route's ropes, ladders,
 * blue ice and hazard zones, the player's lamp (#196), and the jolts on their way to them (#197),
 * from the physics, the hazards, the lamps and the jolts, which it only reads. */
export class CoachedClimb implements CoachWorld {
  /** How near behind the player, along the ground, someone coming past them on their rope is
   * said to be passing them: a few steps. */
  private static readonly PASSING = 3;

  constructor(
    private readonly physics: SlopePhysics,
    private readonly hazards: ObjectiveHazards,
    private readonly lamps: Lamps,
    private readonly climberId: ClimberId,
    private readonly jolts: Pick<Jolts, "comingTo"> | null = null,
  ) {}

  player(): ClimberView {
    return this.physics.climber(this.climberId);
  }

  inTheDark(): boolean {
    return this.lamps.inTheDark(this.climberId);
  }

  warning(): HazardKind | null {
    return this.hazards.warningAt(this.physics.along(this.climberId));
  }

  jolt(): JoltKind | null {
    return this.jolts?.comingTo(this.climberId) ?? null;
  }

  passing(): boolean {
    return this.physics.passerOf(this.climberId, CoachedClimb.PASSING) !== null;
  }

  ladderCondition(id: string): LadderCondition {
    return this.physics.ladderCondition(id);
  }

  partnerHangs(): boolean {
    return this.physics.climbers.some(
      (id) => id !== this.climberId && this.physics.climber(id).hanging,
    );
  }

  along(): number {
    return this.physics.along(this.climberId);
  }

  iceWall(): "foot" | "lip" | "rope" | null {
    return this.physics.iceWall(this.climberId);
  }

  inADeadEnd(): boolean {
    const view = this.physics.climber(this.climberId);
    return (
      !view.falling &&
      view.ladder === null &&
      this.physics.deadEnd(this.physics.along(this.climberId))
    );
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
