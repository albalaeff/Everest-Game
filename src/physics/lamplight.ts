import type { ClimberId, Legs, MountainClock, Whereabouts } from "../simulation";
import type { Kit } from "./climber";

/** When a headlamp without fresh batteries dies, and when the dark ends (#196), in the mountain's
 * seconds; and how sure-footed a climber is in the dark without one. */
export interface LampSettings {
  /** The mountain's seconds after setting off that a lamp the climber didn't check lasts. */
  readonly lasts: number;
  /** First light, in seconds since midnight: from then on, the ice shows without a lamp. */
  readonly firstLight: number;
  /** How sure-footed a climber is in the dark without a lamp, as a share of what they'd be by
   * its light. */
  readonly dark: number;
}

/** What the lamps light: the slope physics, which moves the climbers in their kit. */
export interface KittedLegs extends Legs {
  climber(id: ClimberId): Whereabouts & { readonly kit: Kit };
}

/** Whose headlamps are lit, as the rendering and the coach read it. */
export interface Lamps {
  /** Whether the climber's lamp is lit: checked before setting off, or not dead yet. */
  lit(id: ClimberId): boolean;
  /** Whether they're in the dark: their lamp dead before first light. */
  inTheDark(id: ClimberId): boolean;
}

/**
 * The light the climbers see their feet by (#196): the slope physics as the body moves it, with a
 * climber's sure-footedness cut while they're in the dark. A headlamp the climber checked before
 * setting off lasts the night; one they didn't dies `lasts` after setting off, and until first
 * light they can't see where they put their feet. A camp's night puts fresh batteries in. It keeps
 * no state: the lamp's death and first light come from the mountain's clock, which the saves keep,
 * and the kit from the physics.
 */
export class Lamplight implements Legs, Lamps {
  constructor(
    private readonly physics: KittedLegs,
    private readonly clock: MountainClock,
    private readonly settings: LampSettings,
  ) {
    if (!(settings.dark > 0 && settings.dark <= 1)) {
      throw new RangeError(`The dark leaves a share of the footing, not ${settings.dark}`);
    }
  }

  climber(id: ClimberId): Whereabouts {
    return this.physics.climber(id);
  }

  stride(id: ClimberId, share: number): void {
    this.physics.stride(id, share);
  }

  /** Their sure-footedness as the body makes it, and less in the dark. */
  sureness(id: ClimberId, share: number): void {
    this.physics.sureness(id, share * (this.inTheDark(id) ? this.settings.dark : 1));
  }

  /** Lit: checked, not dead yet, or after the day they set off, by when a camp has given them
   * fresh batteries. */
  lit(id: ClimberId): boolean {
    const { clock } = this;
    return (
      this.physics.climber(id).kit.lamp || clock.elapsed < this.settings.lasts || clock.day > 0
    );
  }

  inTheDark(id: ClimberId): boolean {
    return !this.lit(id) && this.clock.timeOfDay < this.settings.firstLight;
  }
}
