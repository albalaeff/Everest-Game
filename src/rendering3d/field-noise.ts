/** A cell of broken ice a point falls in: how far its centre is, how far the next nearest, the
 * cell's own number from 0 to 1, and the way to its centre, in cells. */
export interface IceCell {
  readonly nearest: number;
  readonly next: number;
  readonly id: number;
  readonly towardX: number;
  readonly towardZ: number;
}

/**
 * The noise the 3D ground is shaped by: smooth lumps, ridges and cells of broken blocks over a
 * plane, each a pure function of the point and the level's seed, so the same level is built the
 * same on every device, a vertex at a time, with no table to fill first. Values run 0 to 1.
 */
export class FieldNoise {
  constructor(private readonly seed: number) {}

  /** A number from 0 to 1 for a corner of the grid, the same every time. */
  corner(x: number, z: number, layer = 0): number {
    let hash =
      (Math.imul(x, 374761393) +
        Math.imul(z, 668265263) +
        Math.imul(this.seed + layer, 1442695041)) |
      0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  }

  /** Smooth lumps a unit across. */
  at(x: number, z: number, layer = 0): number {
    const left = Math.floor(x);
    const near = Math.floor(z);
    const across = FieldNoise.eased(x - left);
    const along = FieldNoise.eased(z - near);
    const a = this.corner(left, near, layer);
    const b = this.corner(left + 1, near, layer);
    const c = this.corner(left, near + 1, layer);
    const d = this.corner(left + 1, near + 1, layer);
    return a + (b - a) * across + (c - a) * along + (a - b - c + d) * across * along;
  }

  /** Lumps in `octaves` layers, each twice as fine and half as strong as the one before. */
  fractal(x: number, z: number, octaves: number, layer = 0): number {
    let sum = 0;
    let weight = 0;
    let strength = 1;
    let scale = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += this.at(x * scale, z * scale, layer + octave * 17) * strength;
      weight += strength;
      strength *= 0.5;
      scale *= 2.03;
    }
    return sum / weight;
  }

  /** Ridges: the lumps folded about their middle, sharp along the crests. */
  ridged(x: number, z: number, octaves: number, layer = 0): number {
    let sum = 0;
    let weight = 0;
    let strength = 1;
    let scale = 1;
    let carried = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      const fold = 1 - Math.abs(2 * this.at(x * scale, z * scale, layer + octave * 31) - 1);
      const crest = fold * fold;
      sum += crest * strength * carried;
      weight += strength;
      carried = Math.min(1, crest * 1.6 + 0.2);
      strength *= 0.5;
      scale *= 2.07;
    }
    return sum / weight;
  }

  /** The broken block a point is in, among blocks `size` metres across. */
  cell(x: number, z: number, size: number, layer = 0): IceCell {
    const cellX = x / size;
    const cellZ = z / size;
    const column = Math.floor(cellX);
    const row = Math.floor(cellZ);
    let nearest = 9;
    let next = 9;
    let id = 0;
    let towardX = 0;
    let towardZ = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const offX = column + dx + 0.12 + 0.76 * this.corner(column + dx, row + dz, layer) - cellX;
        const offZ = row + dz + 0.12 + 0.76 * this.corner(column + dx, row + dz, layer + 7) - cellZ;
        const distance = Math.hypot(offX, offZ);
        if (distance < nearest) {
          next = nearest;
          nearest = distance;
          id = this.corner(column + dx, row + dz, layer + 13);
          towardX = offX;
          towardZ = offZ;
        } else if (distance < next) {
          next = distance;
        }
      }
    }
    return { nearest, next, id, towardX, towardZ };
  }

  /** 0 below `from`, 1 above `to`, eased between; `from` may be the greater, for a fall. */
  static smooth(from: number, to: number, value: number): number {
    const share = Math.min(Math.max((value - from) / (to - from), 0), 1);
    return share * share * (3 - 2 * share);
  }

  private static eased(share: number): number {
    return share * share * (3 - 2 * share);
  }
}
