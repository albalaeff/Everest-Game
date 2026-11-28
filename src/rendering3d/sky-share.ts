/** Something that stands on the ground and keeps the sky off it: where its foot is, how wide it
 * is at the foot and how tall, in metres. */
export interface Standing {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * How much of the sky each point of the ground sees, 0 to 1: all of it on open snow, half at a
 * wall's foot, little on a crevasse's floor. It is what gives the picture its depth (#313): the
 * sky's light on a point is scaled by it, so a crevasse darkens down its walls and a tower's
 * foot sits in its own shade. Worked out once, when the level loads, from the ground's own
 * points and what stands on them, and kept at the points: nothing is worked out per frame.
 */
export class SkyShare {
  /** The ways the horizon is looked for from a point, in rows and columns of its sheet. */
  private static readonly WAYS: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  /** How many points off the horizon is looked for, each way. */
  private static readonly STEPS = [1, 2, 3, 5, 8, 12, 18, 26] as const;
  /** A square of the map of what stands on the ground, in metres, and how far a tower's shade
   * reaches out from its foot, as a share of its height and at most. */
  private static readonly CELL = 1;
  private static readonly REACH = { share: 0.7, most: 7 };
  /** How much of the sky a tower takes from the ground at its very foot. */
  private static readonly AT_FOOT = 0.6;

  private readonly shade: Float32Array;
  private readonly columns: number;
  private readonly rows: number;
  private readonly left: number;
  private readonly near: number;

  /** `standing` is what stands on the ground: the towers of ice. */
  constructor(standing: readonly Standing[]) {
    const { CELL, REACH, AT_FOOT } = SkyShare;
    let left = 0;
    let right = 0;
    let near = 0;
    let far = 0;
    for (const { x, z } of standing) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      near = Math.min(near, z);
      far = Math.max(far, z);
    }
    const margin = 24;
    this.left = left - margin;
    this.near = near - margin;
    this.columns = Math.ceil((right - left + 2 * margin) / CELL) + 1;
    this.rows = Math.ceil((far - near + 2 * margin) / CELL) + 1;
    this.shade = new Float32Array(this.columns * this.rows);
    for (const tower of standing) {
      const foot = Math.max(tower.width, tower.depth) * 0.45;
      const reach = Math.min(tower.height * REACH.share, REACH.most);
      const out = foot + reach;
      const fromColumn = Math.floor((tower.x - out - this.left) / CELL);
      const fromRow = Math.floor((tower.z - out - this.near) / CELL);
      const cells = Math.ceil((2 * out) / CELL) + 1;
      for (let row = fromRow; row <= fromRow + cells; row += 1) {
        for (let column = fromColumn; column <= fromColumn + cells; column += 1) {
          if (row < 0 || column < 0 || row >= this.rows || column >= this.columns) {
            continue;
          }
          const off = Math.hypot(
            this.left + column * CELL - tower.x,
            this.near + row * CELL - tower.z,
          );
          const share = 1 - Math.min(Math.max((off - foot) / reach, 0), 1);
          const taken = AT_FOOT * share * share;
          const index = row * this.columns + column;
          // Two towers by one another take more than either, never all.
          this.shade[index] = 1 - (1 - (this.shade[index] ?? 0)) * (1 - taken);
        }
      }
    }
  }

  /** The share of the sky left at a place by what stands round it, 0 to 1. */
  under(x: number, z: number): number {
    const { CELL } = SkyShare;
    const column = (x - this.left) / CELL;
    const row = (z - this.near) / CELL;
    const c = Math.floor(column);
    const r = Math.floor(row);
    if (c < 0 || r < 0 || c >= this.columns - 1 || r >= this.rows - 1) {
      return 1;
    }
    const acrossShare = column - c;
    const upShare = row - r;
    const at = (rr: number, cc: number): number => this.shade[rr * this.columns + cc] ?? 0;
    const taken =
      (at(r, c) * (1 - acrossShare) + at(r, c + 1) * acrossShare) * (1 - upShare) +
      (at(r + 1, c) * (1 - acrossShare) + at(r + 1, c + 1) * acrossShare) * upShare;
    return 1 - taken;
  }

  /** The share of the sky each point of a sheet of ground sees: `positions` are its points, x,
   * y and z in turn, in `rows` rows of `columns`. From each point the horizon is found eight
   * ways across the sheet; what it hides of the sky, a wall more than a slope, is taken off. */
  over(positions: Float32Array, rows: number, columns: number): Float32Array {
    const { WAYS, STEPS } = SkyShare;
    const shares = new Float32Array(rows * columns);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const index = r * columns + c;
        const x = positions[3 * index] ?? 0;
        const y = positions[3 * index + 1] ?? 0;
        const z = positions[3 * index + 2] ?? 0;
        let hidden = 0;
        for (const [up, across] of WAYS) {
          // The sine of the horizon's height this way, squared: the share of a flat ground's
          // light from the sky that a horizon so high keeps off.
          let highest = 0;
          for (const step of STEPS) {
            const rr = r + up * step;
            const cc = c + across * step;
            if (rr < 0 || cc < 0 || rr >= rows || cc >= columns) {
              break;
            }
            const other = rr * columns + cc;
            const rise = (positions[3 * other + 1] ?? 0) - y;
            if (rise <= 0) {
              continue;
            }
            const away = Math.hypot(
              (positions[3 * other] ?? 0) - x,
              (positions[3 * other + 2] ?? 0) - z,
            );
            highest = Math.max(highest, (rise * rise) / (rise * rise + away * away));
          }
          hidden += highest;
        }
        shares[index] = (1 - hidden / WAYS.length) * this.under(x, z);
      }
    }
    return shares;
  }
}
