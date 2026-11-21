import { HazardChance } from "../simulation";
import type { HazardWeather } from "../simulation";

/**
 * The weather a new climb on this device holds, if any (#272): the one in the device's storage
 * under `everest.weather`, as the page's stories set `clear` so they never meet a storm by chance.
 * Without one, a climb's weather turns through the days from its seed.
 */
export class HeldWeather {
  static readonly KEY = "everest.weather";

  constructor(private readonly storage: Storage | null) {}

  /** The weather to hold, or `drawn`, the seed's. */
  get weather(): HazardWeather | "drawn" {
    const kept = this.kept();
    return kept !== null && HazardChance.knows(kept) ? (kept as HazardWeather) : "drawn";
  }

  /** What the device keeps under the key, or nothing where its storage is refused. */
  private kept(): string | null {
    try {
      return this.storage?.getItem(HeldWeather.KEY) ?? null;
    } catch {
      return null;
    }
  }
}
