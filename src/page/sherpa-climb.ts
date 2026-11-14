import type { Sherpa, SherpaView } from "../agents";
import type { CoachTip } from "../interface/coach";
import { Readings } from "../interface/readings";
import type { SherpaWorld } from "../interface/sherpa-voice";
import type { ClimberView, SlopePhysics } from "../physics";
import type { ClimberId, HazardZone, MountainClock } from "../simulation";

/** A part of the route, by its id and its stretch of the ground. */
interface Part {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** The climb as Pemba's voice reads it (#212): his agent's view, his climber and the player's
 * from the physics, the part of the route and the serac zones the player is in, the hour by the
 * mountain's clock against first light, and the coach's tip on the screen. It only reads. */
export class SherpaClimb implements SherpaWorld {
  private readonly readings = new Readings();

  constructor(
    private readonly sherpaRule: Sherpa,
    private readonly physics: SlopePhysics,
    private readonly clockRule: MountainClock,
    private readonly parts: readonly Part[],
    private readonly zones: readonly HazardZone[],
    private readonly climberId: ClimberId,
    /** First light, in seconds after midnight: `time.first-light`. */
    private readonly firstLightAt: number,
    /** The coach's tip on the screen now. */
    private readonly coachTip: () => CoachTip | null,
  ) {}

  sherpa(): SherpaView {
    return this.sherpaRule.view;
  }

  pemba(): ClimberView {
    return this.physics.climber(this.sherpaRule.view.climber);
  }

  player(): ClimberView {
    return this.physics.climber(this.climberId);
  }

  along(): number {
    return this.physics.along(this.climberId);
  }

  pembaAlong(): number {
    return this.physics.along(this.sherpaRule.view.climber);
  }

  part(): string | null {
    const along = this.along();
    return this.parts.find(({ from, to }) => along >= from && along < to)?.id ?? null;
  }

  underSeracs(): boolean {
    const along = this.along();
    return this.zones.some(
      ({ kind, from, to }) => kind === "serac" && along >= from && along <= to,
    );
  }

  firstLight(): boolean {
    return this.clockRule.timeOfDay >= this.firstLightAt;
  }

  clock(): string {
    return this.readings.clock(this.clockRule.timeOfDay);
  }

  tip(): CoachTip | null {
    return this.coachTip();
  }
}
