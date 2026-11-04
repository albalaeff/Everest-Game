import { Body } from "../body/body";
import type { BodyNumbers } from "../body/body-numbers";
import { Expedition } from "../expedition";
import type { ExpeditionSave } from "../expedition";
import type { ClimberId, GameAction } from "../game-action";
import { MountainClock } from "../mountain-clock";
import type { Scenario } from "../scenario";
import { SimulationClock } from "../simulation-clock";
import { TestRidge } from "./test-ridge";
import type { RidgeStart } from "./test-ridge";

/** A hike on the test ridge: the clock, the body and the ridge, in that order, played through
 * `Expedition`, on the ridge's made-up body numbers or on the game's. Only tests import it. */
export class Hike {
  readonly clock = new MountainClock(TestRidge.COMPRESSION);
  readonly ridge = new TestRidge();
  readonly body: Body;
  readonly expedition: Expedition;

  /** A hike from a scenario's start, or on from a save. */
  constructor(start: Scenario | ExpeditionSave, numbers: BodyNumbers = TestRidge.NUMBERS) {
    this.body = new Body(numbers, this.clock, this.ridge, this.ridge);
    const rules = [this.clock, this.body, this.ridge];
    this.expedition =
      "scenario" in start ? Expedition.resume(start, rules) : Expedition.start(start, rules);
  }

  /** A hike with these climbers on a ridge that rises `climbing` metres a second of play. */
  static on(
    climbers: readonly RidgeStart[],
    climbing = 0,
    numbers: BodyNumbers = TestRidge.NUMBERS,
  ): Hike {
    return new Hike(TestRidge.scenario(1, climbers, climbing), numbers);
  }

  /** Plays `hours` of the mountain's time, a second of play each, with `actions` in the first
   * step. */
  hours(hours: number, actions: readonly GameAction[] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < hours * SimulationClock.STEPS_PER_SECOND; step += 1) {
      this.expedition.advance();
    }
  }

  stride(id: ClimberId): number {
    return this.ridge.climber(id).stride;
  }
}
