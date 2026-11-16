import { describe, expect, it } from "vitest";

import { FacingTurn } from "./facing-turn";
import type { Turned } from "./facing-turn";

const FRAME = 1 / 60;

/** Each frame of `seconds` of a figure facing `facing`, toward the viewer or not. */
function frames(
  turn: FacingTurn,
  seconds: number,
  facing: 1 | -1,
  towardViewer: boolean,
  frame = FRAME,
): Turned[] {
  const drawn: Turned[] = [];
  for (let time = 0; time < seconds - 1e-9; time += frame) {
    drawn.push(turn.advance(frame, facing, towardViewer));
  }
  return drawn;
}

describe("FacingTurn", () => {
  it("draws a figure side-on at its whole width, the way it faces, and none of it from the front", () => {
    const turn = new FacingTurn();

    expect(turn.advance(FRAME, 1, false)).toEqual({ side: 1, front: 0 });
    expect(turn.facing).toBe(1);
  });

  it("turns to the viewer in a quarter of a second: the side narrowing, then the front opening, one picture at a time", () => {
    const turn = new FacingTurn();
    const turning = frames(turn, FacingTurn.TO_VIEWER_SECONDS + 2 * FRAME, 1, true);

    expect(turning.at(-1)).toEqual({ side: 0, front: 1 });
    for (const { side, front } of turning) {
      expect(side === 0 || front === 0).toBe(true);
      expect(side).toBeGreaterThanOrEqual(0);
      expect(side).toBeLessThanOrEqual(1);
      expect(front).toBeGreaterThanOrEqual(0);
      expect(front).toBeLessThanOrEqual(1);
    }
    // The side narrows frame by frame until the front takes its place, and the front then opens.
    const sides = turning.filter(({ front }) => front === 0).map(({ side }) => side);
    const fronts = turning.filter(({ front }) => front > 0).map(({ front }) => front);
    expect(sides.length).toBeGreaterThan(3);
    expect(fronts.length).toBeGreaterThan(3);
    expect([...sides].sort((a, b) => b - a)).toEqual(sides);
    expect([...fronts].sort((a, b) => a - b)).toEqual(fronts);
    // Where one picture gives way to the other they're as wide: no jump in the figure's width.
    expect(Math.abs((sides.at(-1) ?? 0) - (fronts[0] ?? 0))).toBeLessThan(0.15);
    expect(sides.at(-1)).toBeGreaterThan(0.6);
  });

  it("stays facing the viewer as long as its climber does", () => {
    const turn = new FacingTurn();
    frames(turn, 1, 1, true);

    expect(frames(turn, 1, 1, true).every(({ side, front }) => side === 0 && front === 1)).toBe(
      true,
    );
  });

  it("comes out of the turn side-on the other way, with no flip through its edge", () => {
    const turn = new FacingTurn();
    frames(turn, 1, 1, true);
    const leaving = frames(turn, FacingTurn.TO_VIEWER_SECONDS + 2 * FRAME, -1, false);

    expect(leaving.at(-1)).toEqual({ side: -1, front: 0 });
    expect(turn.facing).toBe(-1);
    // Once the side-on picture shows again it faces left, and only widens.
    const sides = leaving.filter(({ front }) => front === 0).map(({ side }) => side);
    expect(sides.every((side) => side < 0)).toBe(true);
    expect([...sides].sort((a, b) => b - a)).toEqual(sides);
  });

  it("comes out of the turn the way it went in when its climber walks on", () => {
    const turn = new FacingTurn();
    frames(turn, 1, 1, true);
    const leaving = frames(turn, 0.5, 1, false);

    expect(leaving.at(-1)).toEqual({ side: 1, front: 0 });
    expect(leaving.every(({ side }) => side >= 0)).toBe(true);
  });

  it("turns back to the way it faced if its climber walks on before it has turned halfway", () => {
    const turn = new FacingTurn();
    frames(turn, FacingTurn.TO_VIEWER_SECONDS / 4, 1, true);
    const back = frames(turn, 0.5, 1, false);

    expect(back.every(({ front }) => front === 0)).toBe(true);
    expect(back.at(-1)).toEqual({ side: 1, front: 0 });
  });

  it("turns round edge-on, never to the viewer, a figure that turns with no stop: narrow, then open the other way", () => {
    const turn = new FacingTurn();
    const round = frames(turn, FacingTurn.ROUND_SECONDS + 2 * FRAME, -1, false);

    expect(round.every(({ front }) => front === 0)).toBe(true);
    expect(round.some(({ side }) => Math.abs(side) < 0.4)).toBe(true);
    expect(round.at(-1)).toEqual({ side: -1, front: 0 });
  });

  it("ends a turn at the same place on a phone's frames as on a PC's", () => {
    const pc = new FacingTurn();
    const phone = new FacingTurn();

    expect(frames(phone, 0.1, 1, true, 1 / 30).at(-1)?.side).toBeCloseTo(
      frames(pc, 0.1, 1, true, 1 / 60).at(-1)?.side ?? 0,
      6,
    );
  });
});
