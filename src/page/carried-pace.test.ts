import { describe, expect, it } from "vitest";

import { CarriedPace } from "./carried-pace";

/** The player as a test has them: carried, hauled, or neither. */
class Climbers {
  carriedBy: string | null = null;
  hauled = false;

  climber(): { carriedBy: string | null; hauled: boolean } {
    return { carriedBy: this.carriedBy, hauled: this.hauled };
  }
}

describe("The climb's pace while the player is rescued (#241)", () => {
  it("runs faster while they're hauled up, faster still while they're carried, and as it ran once they're set down", () => {
    const climbers = new Climbers();
    const told: number[] = [];
    const pace = new CarriedPace(climbers, "player", (times) => told.push(times));
    pace.update();
    climbers.hauled = true;
    pace.update();
    pace.update();
    climbers.hauled = false;
    climbers.carriedBy = "pemba";
    pace.update();
    pace.update();
    climbers.carriedBy = null;
    pace.update();

    expect(told).toEqual([CarriedPace.HAULED, CarriedPace.CARRIED, 1]);
    expect(CarriedPace.CARRIED).toBeGreaterThan(CarriedPace.HAULED);
  });

  it("tells the game nothing while nothing changes", () => {
    const told: number[] = [];
    const pace = new CarriedPace(new Climbers(), "player", (times) => told.push(times));
    pace.update();
    pace.update();

    expect(told).toEqual([]);
  });
});
