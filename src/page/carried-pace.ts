import type { ClimberId } from "../simulation";

/** The player's climber as the pace reads them: who carries them, whether they're hauled up a
 * rescue line, and whether they're down with a bone broken. The slope physics is this. */
export interface CarriedClimbers {
  climber(climber: ClimberId): {
    readonly carriedBy: ClimberId | null;
    readonly hauled: boolean;
    readonly down: boolean;
  };
}

/**
 * The climb's pace while the player is rescued, alone (#241): down with a bone broken while help
 * comes to them, its rope is anchored and the bone splinted (#278), hauled up a rescue line, or
 * carried down the route on a rescuer's back, there's nothing for them to do but wait, so the
 * climb runs faster than real time until they're set down, and then as it ran. It tells the game
 * the speed only when it changes. In a room the server paces the climb for everyone, and nothing
 * speeds up.
 */
export class CarriedPace {
  /** How many times faster than real time the climb runs while the player lies hurt, while
   * they're hauled up, and while they're carried: the page's numbers, as the god mode's speeds
   * are. */
  static readonly DOWN = 3;
  static readonly HAULED = 3;
  static readonly CARRIED = 6;

  private times = 1;

  constructor(
    private readonly climbers: CarriedClimbers,
    private readonly player: ClimberId,
    /** Runs the climb so many times faster than real time from now on. */
    private readonly faster: (times: number) => void,
  ) {}

  /** Each frame: the speed for how the player is now, told to the game if it changed. */
  update(): void {
    const { carriedBy, hauled, down } = this.climbers.climber(this.player);
    const times =
      carriedBy !== null
        ? CarriedPace.CARRIED
        : hauled
          ? CarriedPace.HAULED
          : down
            ? CarriedPace.DOWN
            : 1;
    if (times !== this.times) {
      this.times = times;
      this.faster(times);
    }
  }
}
