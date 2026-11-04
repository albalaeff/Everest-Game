import { Graphics } from "pixi.js";

import type { Terrain } from "../physics";
import { SimulationClock } from "../simulation";
import type { HazardKind, HazardZone, ObjectiveHazards, Warning } from "../simulation";
import { HazardSigns } from "./hazard-signs";

/** A warning as the picture has it: how long it runs, and how long it's been showing, in
 * seconds of play. */
interface Showing {
  readonly zone: HazardZone;
  readonly length: number;
  shown: number;
}

/**
 * The hazards on the slope, as `HazardSigns` shapes them: what stands over each zone, drawn once
 * behind the climbers, and what comes down while one goes, drawn in front of them each frame and
 * left on the ground a moment after it lands. It reads the hazards and holds only the picture's
 * own clock of each warning.
 */
export class HazardDrawing {
  private static readonly ICE = 0xcfe6f5;
  private static readonly ICE_EDGE = 0x8fb7d4;
  private static readonly LOADED = 0xffffff;
  private static readonly DEBRIS: Readonly<Record<HazardKind, number>> = {
    serac: 0xbcdcf0,
    avalanche: 0xffffff,
    crevasse: 0xffffff,
    cornice: 0xffffff,
  };
  private static readonly EDGE_METRES = 0.08;
  /** How long what came down lies on the ground before the picture clears it, in seconds. */
  private static readonly SETTLE_SECONDS = 2;

  /** Behind the climbers. */
  readonly standing = new Graphics();
  /** In front of them. */
  readonly falling = new Graphics();
  private readonly signs: HazardSigns;
  private readonly showing = new Map<string, Showing>();

  constructor(
    private readonly hazards: ObjectiveHazards,
    terrain: Terrain,
  ) {
    this.signs = new HazardSigns(terrain);
    for (const zone of hazards.zones) {
      for (const outline of this.signs.zone(zone)) {
        const flat = outline.flatMap(({ x, y }) => [x, y]);
        const ice = zone.kind === "serac";
        this.standing.poly(flat).fill(ice ? HazardDrawing.ICE : HazardDrawing.LOADED);
        if (ice) {
          this.standing.stroke({ width: HazardDrawing.EDGE_METRES, color: HazardDrawing.ICE_EDGE });
        }
      }
    }
  }

  /** Whether a zone is going now: the picture shakes. */
  get going(): boolean {
    return this.hazards.warnings.length > 0;
  }

  /** A frame, `seconds` after the last: each warning a little further on. */
  draw(seconds: number): void {
    this.follow(this.hazards.warnings, seconds);
    this.falling.clear();
    for (const { zone, length, shown } of this.showing.values()) {
      const colour = HazardDrawing.DEBRIS[zone.kind];
      for (const piece of this.signs.debris(zone, shown / length)) {
        if (zone.kind === "serac") {
          const half = piece.size / 2;
          this.falling.rect(piece.x - half, piece.y, piece.size, piece.size).fill(colour);
        } else {
          this.falling.circle(piece.x, piece.y + piece.size / 2, piece.size / 2).fill(colour);
        }
      }
    }
  }

  /** Starts the picture's clock of each new warning, moves each on, and drops those that have
   * lain on the ground long enough. */
  private follow(warnings: readonly Warning[], seconds: number): void {
    for (const warning of warnings) {
      const key = `${warning.zone}@${warning.began}`;
      const zone = this.hazards.zones.find(({ id }) => id === warning.zone);
      if (!this.showing.has(key) && zone !== undefined) {
        const length = (warning.comes - warning.began) * SimulationClock.STEP_SECONDS;
        this.showing.set(key, { zone, length, shown: 0 });
      }
    }
    for (const [key, showing] of this.showing) {
      showing.shown += seconds;
      if (showing.shown > showing.length + HazardDrawing.SETTLE_SECONDS) {
        this.showing.delete(key);
      }
    }
  }
}
