import { describe, expect, it } from "vitest";

import { CarriedPace } from "./carried-pace";

/** The player as a test has them: down, hauled, carried, or none of them. */
class Climbers {
  carriedBy: string | null = null;
  hauled = false;
  down = false;

  climber(): { carriedBy: string | null; hauled: boolean; down: boolean } {
    return { carriedBy: this.carriedBy, hauled: this.hauled, down: this.down };
  }
}

describe("The climb's pace while the player is rescued (#241, #278)", () => {
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

  it("runs faster while they lie hurt waiting for help, as when they're hauled (#278)", () => {
    const climbers = new Climbers();
    const told: number[] = [];
    const pace = new CarriedPace(climbers, "player", (times) => told.push(times));
    climbers.down = true;
    pace.update();
    climbers.hauled = true;
    pace.update();
    climbers.hauled = false;
    pace.update();
    climbers.down = false;
    pace.update();

    expect(CarriedPace.DOWN).toBeGreaterThan(1);
    expect(CarriedPace.DOWN).toBe(CarriedPace.HAULED);
    // The haul goes on at the pace they waited at, so nothing changes when it starts or ends.
    expect(told).toEqual([CarriedPace.DOWN, 1]);
  });

  it("tells the game nothing while nothing changes", () => {
    const told: number[] = [];
    const pace = new CarriedPace(new Climbers(), "player", (times) => told.push(times));
    pace.update();
    pace.update();

    expect(told).toEqual([]);
  });
});
