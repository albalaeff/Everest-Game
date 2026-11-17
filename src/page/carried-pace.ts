import type { ClimberId } from "../simulation";

/** The player's climber as the pace reads them: who carries them, and whether they're hauled up
 * a rescue line. The slope physics is this. */
export interface CarriedClimbers {
  climber(climber: ClimberId): { readonly carriedBy: ClimberId | null; readonly hauled: boolean };
}

/**
 * The climb's pace while the player is rescued, alone (#241): hauled up a rescue line or carried
 * down the route on a rescuer's back, there's nothing for them to do but wait, so the climb runs
 * faster than real time until they're set down, and then as it ran. It tells the game the speed
 * only when it changes. In a room the server paces the climb for everyone, and nothing speeds up.
 */
export class CarriedPace {
  /** How many times faster than real time the climb runs while the player is hauled up, and
   * while they're carried: the page's numbers, as the god mode's speeds are. */
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
    const { carriedBy, hauled } = this.climbers.climber(this.player);
    const times = carriedBy !== null ? CarriedPace.CARRIED : hauled ? CarriedPace.HAULED : 1;
    if (times !== this.times) {
      this.times = times;
      this.faster(times);
    }
  }
}
