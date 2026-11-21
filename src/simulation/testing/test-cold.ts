import type { ColdSense } from "../body/body";
import type { ColdNumbers, Exposure } from "../body/cold";
import { WindChill } from "../wind-chill";

/**
 * The cold for the core's tests (#272): hypothermia's stages; a climber holding their heat down to
 * −20 °C of wind chill at rest and −45 °C on the move, cooling 0.02 °C an hour a degree colder;
 * shivering warm at 3.5 °C an hour, a tent at 1.5; covered skin three and forty times slower than
 * bare; Canada's index and bands. Made up, near the knowledge base's, to show the body. It isn't
 * game code: only tests import it.
 */
export class TestCold {
  readonly numbers: ColdNumbers = {
    normal: 37,
    stages: { mild: 35, moderate: 32, severe: 28, death: 24 },
    holds: { resting: -20, moving: -45 },
    cooling: 0.02,
    rewarming: { shivering: 3.5, sheltered: 1.5 },
    tent: 8,
    covers: { face: 3, fingers: 40 },
    frost: { numb: 0.5, nip: 1, bite: 2 },
    thaw: 0.5,
    clumsy: { footing: 0.6, stride: 0.8 },
  };
  readonly chill = new WindChill({
    constant: 13.12,
    air: 0.6215,
    wind: 11.37,
    airInWind: 0.3965,
    power: 0.16,
    warmest: 10,
    calmest: 4.8,
    factor: 1.5,
    risks: {
      moderate: { from: -10, freezes: null },
      high: { from: -28, freezes: { min: 10, max: 30 } },
      "very-high": { from: -40, freezes: { min: 5, max: 10 } },
      severe: { from: -48, freezes: { min: 2, max: 5 } },
      extreme: { from: -55, freezes: { min: 2, max: 2 } },
    },
  });
  /** A storm at Camp 1: −20 °C air in a 60 km/h wind, a wind chill of about −39 °C, Canada's high
   * risk: bare skin freezes in 10 to 30 minutes. */
  readonly storm: Exposure = { air: -20, wind: 60, sheltered: false };

  /** The body's sense of the cold in a weather that's always `exposure`'s air and wind. */
  in(exposure: Exposure = this.storm): ColdSense {
    return {
      numbers: this.numbers,
      chill: this.chill,
      outdoors: { airNow: () => exposure.air, windNow: () => exposure.wind },
    };
  }

  /** How fast a climber at rest in `exposure` cools, in °C an hour. */
  cooling(exposure: Exposure = this.storm): number {
    const { holds, cooling } = this.numbers;
    return cooling * (holds.resting - this.chill.of(exposure.air, exposure.wind).chill);
  }
}
