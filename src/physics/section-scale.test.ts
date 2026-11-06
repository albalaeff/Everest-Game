import { describe, expect, it } from "vitest";

import type { ExpeditionSave } from "../simulation";
import { Expedition } from "../simulation";
import { SectionScale } from "./section-scale";
import { SlopePhysics } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk } = Climb;

/** `TestMountain.SLOPE`, which rises 42 m drawn, as a section drawn at a twelfth: 504 m real. */
const TWELFTH = { start: 5000, end: 5504 };

describe("SectionScale", () => {
  const scale = new SectionScale(TestMountain.SLOPE.terrain, TWELFTH);

  it("reads the real altitude of the section's ends", () => {
    expect(scale.altitudeAt({ x: 0, y: 0 })).toBe(5000);
    expect(scale.altitudeAt({ x: 120, y: 42 })).toBe(5504);
  });

  it("reads the real rise by the share of the section's width crossed, on the line between the ends", () => {
    expect(scale.altitudeAt({ x: 60, y: 21 })).toBe(5252);
    expect(scale.altitudeAt({ x: 30, y: 10.5 })).toBe(5126);
  });

  it("reads the drawn ground above and below that line at life size: a 10 m fall reads 10 m", () => {
    // The ledge at x = 90 stands 10.5 m above the line from the foot to the end.
    expect(scale.altitudeAt({ x: 90, y: 42 })).toBeCloseTo(5000 + 378 + 10.5, 9);
    expect(scale.altitudeAt({ x: 90, y: 32 })).toBeCloseTo(5000 + 378 + 0.5, 9);
  });

  it("goes no further than the ends' altitudes past them, where the ground is flat", () => {
    expect(scale.altitudeAt({ x: -10, y: 0 })).toBe(5000);
    expect(scale.altitudeAt({ x: -10, y: -3 })).toBe(4997);
    expect(scale.altitudeAt({ x: 200, y: 42 })).toBe(5504);
  });

  it("says what the section is drawn at, from its real rise against its drawn one", () => {
    expect(scale.ratio).toBe(12);
    expect(
      new SectionScale(TestMountain.GENTLE.terrain, { start: 6000, end: 6026.8 }).ratio,
    ).toBeCloseTo(1, 9);
  });

  it("can't say it for a section that doesn't rise", () => {
    const flat = new SectionScale(TestMountain.FLAT.terrain, { start: 5000, end: 5000 });

    expect(() => flat.ratio).toThrow(RangeError);
    expect(flat.altitudeAt({ x: 50, y: -2 })).toBe(4998);
  });
});

describe("SlopePhysics: the altitude", () => {
  it("shows every climber's altitude where they are: 30 m down a crevasse reads 30 m lower", () => {
    // Boris stands on the flat ground past the crevasse, 100 m along the ground from its start.
    const layout = TestMountain.CREVASSE.layout([
      { id: "anna", along: 19 },
      { id: "boris", along: 100 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);
    const before = climb.physics.climber("anna").altitude;

    climb.play(200, [walk("anna", "right")]);

    expect(before).toBe(TestMountain.FOOT);
    expect(climb.physics.climber("anna")).toMatchObject({ y: -30, falling: false });
    expect(climb.physics.climber("anna").altitude).toBe(TestMountain.FOOT - 30);
    expect(climb.physics.climber("boris").altitude).toBe(TestMountain.FOOT);
  });

  it("reads the altimeter on a section drawn at a twelfth of life", () => {
    const layout = TestMountain.SLOPE.layout(
      [
        { id: "anna", along: 0 },
        { id: "boris", along: TestMountain.SLOPE.terrain.length },
      ],
      [],
      [],
      TWELFTH,
    );
    const climb = new Climb(TestMountain.CALM, layout);

    expect(climb.physics.climber("anna").altitude).toBe(5000);
    expect(climb.physics.climber("boris").altitude).toBe(5504);
  });

  it("keeps the section's altitudes in a save, through JSON", () => {
    const layout = TestMountain.SLOPE.layout([{ id: "anna", along: 60 }], [], [], TWELFTH);
    const climb = new Climb(TestMountain.CALM, layout);
    const altitude = climb.physics.climber("anna").altitude;

    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const physics = new SlopePhysics(TestMountain.CALM);
    Expedition.resume(save, [physics]);

    expect(altitude).toBeGreaterThan(5000);
    expect(physics.climber("anna").altitude).toBe(altitude);
    expect(physics.save()).toMatchObject({ altitude: TWELFTH });
  });
});
