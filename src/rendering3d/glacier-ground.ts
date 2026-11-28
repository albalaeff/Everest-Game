import { BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3 } from "three";
import type { Material } from "three";

import { GlacierShape } from "./glacier-shape";
import type { GroundPoint } from "./glacier-shape";

/** A sheet of ground: points in rows and columns, as the meshes are cut from. */
interface Sheet {
  readonly rows: number;
  readonly columns: number;
  readonly positions: Float32Array;
  readonly depths: Float32Array;
  readonly kinds: Float32Array;
}

/**
 * The glacier's ground as meshes, built once when the level loads. A corridor along the trail,
 * a row for every point of the route's line and finer the nearer the trail, so the walls and
 * the crevasses the climber meets are there to the centimetre; and a field to each side of it,
 * coarser with distance, out to the valley's walls. Each is cut into pieces up the valley, so
 * the graphics card is handed only those in view.
 */
export class GlacierGround {
  /** The corridor's columns: how far apart the first two are, and how much wider each next
   * gap is, out to the shape's reach. */
  private static readonly COLUMN = { first: 0.3, wider: 1.085 };
  /** The field's: how far apart its rows are up the valley, its first columns, and how much
   * wider each next gap is; and how far it starts inside the corridor's edge, and under it. */
  private static readonly FIELD = { rows: 1, first: 1, wider: 1.05, overlap: 2, under: 0.25 };
  /** How many rows a piece of the corridor has, and of the field. */
  private static readonly PIECE = { corridor: 64, field: 48 };

  readonly group = new Group();
  /** How many triangles the ground has in all. */
  readonly triangles: number;

  constructor(shape: GlacierShape, material: Material) {
    const corridor = GlacierGround.corridor(shape);
    const left = GlacierGround.field(shape, -1);
    const right = GlacierGround.field(shape, 1);
    let triangles = 0;
    for (const [sheet, piece] of [
      [corridor, GlacierGround.PIECE.corridor],
      [left, GlacierGround.PIECE.field],
      [right, GlacierGround.PIECE.field],
    ] as const) {
      for (const mesh of GlacierGround.meshes(sheet, piece, material)) {
        this.group.add(mesh);
        triangles += (mesh.geometry.index?.count ?? 0) / 3;
      }
    }
    this.triangles = triangles;
  }

  /** How far to the side each of the corridor's columns is, left to right. */
  static sides(): readonly number[] {
    const { first, wider } = GlacierGround.COLUMN;
    const right: number[] = [];
    let gap = first;
    for (let side = first; side < GlacierShape.REACH; side += gap) {
      right.push(side);
      gap *= wider;
    }
    right.push(GlacierShape.REACH);
    return [...right.map((side) => -side).reverse(), 0, ...right];
  }

  /** The corridor: the route's rows, carried out to each side. No point of a column lies
   * further down the valley than the one before it, so no wall folds back through itself. */
  private static corridor(shape: GlacierShape): Sheet {
    const sides = GlacierGround.sides();
    const sheet = GlacierGround.sheet(shape.rows.length, sides.length);
    const furthest = new Float64Array(sides.length).fill(Number.POSITIVE_INFINITY);
    for (const [r, row] of shape.rows.entries()) {
      for (const [c, side] of sides.entries()) {
        const point = shape.across(row, side);
        const z = Math.min(point.z, furthest[c] ?? point.z);
        furthest[c] = z;
        GlacierGround.put(sheet, r, c, { ...point, z }, shape.kind(row, side));
      }
    }
    return sheet;
  }

  /** The field on one side: a grid over the glacier's own ground, its columns further apart
   * the further from the trail, from just inside the corridor's edge, and just under it there. */
  private static field(shape: GlacierShape, way: 1 | -1): Sheet {
    const { rows: step, first, wider, overlap, under } = GlacierGround.FIELD;
    const sides: number[] = [];
    let gap = first;
    for (let side = GlacierShape.REACH - overlap; side < GlacierShape.HALF_WIDTH; side += gap) {
      sides.push(side);
      gap *= wider;
    }
    const [firstRow] = shape.rows;
    const lastRow = shape.rows.at(-1);
    const from = firstRow?.x ?? 0;
    const to = lastRow?.x ?? 0;
    const count = Math.floor((to - from) / step) + 1;
    const sheet = GlacierGround.sheet(count, sides.length);
    for (let r = 0; r < count; r += 1) {
      const upValley = from + r * step;
      for (const [c, side] of sides.entries()) {
        // The same winding as the corridor's, so the two lie on one another where they meet.
        const x = shape.asideOf(upValley) + way * side;
        const point = shape.floor(x, -upValley);
        const sunk = c === 0 ? under : 0;
        const column = way > 0 ? c : sides.length - 1 - c;
        GlacierGround.put(
          sheet,
          r,
          column,
          { ...point, y: point.y - sunk },
          shape.rubble(upValley, x),
        );
      }
    }
    return sheet;
  }

  private static sheet(rows: number, columns: number): Sheet {
    return {
      rows,
      columns,
      positions: new Float32Array(rows * columns * 3),
      depths: new Float32Array(rows * columns),
      kinds: new Float32Array(rows * columns),
    };
  }

  private static put(
    sheet: Sheet,
    row: number,
    column: number,
    point: GroundPoint,
    kind: number,
  ): void {
    const index = row * sheet.columns + column;
    sheet.positions[3 * index] = point.x;
    sheet.positions[3 * index + 1] = point.y;
    sheet.positions[3 * index + 2] = point.z;
    sheet.depths[index] = point.depth;
    sheet.kinds[index] = kind;
  }

  /** A sheet's meshes: its points shared by them all, lit as one surface, and each piece's own
   * triangles, a band of rows across it. */
  private static meshes(sheet: Sheet, piece: number, material: Material): readonly Mesh[] {
    const { rows, columns, positions } = sheet;
    const position = new BufferAttribute(positions, 3);
    const normal = new BufferAttribute(GlacierGround.normals(sheet), 3);
    const depth = new BufferAttribute(sheet.depths, 1);
    const kind = new BufferAttribute(sheet.kinds, 1);
    const meshes: Mesh[] = [];
    const corner = new Vector3();
    for (let from = 0; from < rows - 1; from += piece) {
      const to = Math.min(from + piece, rows - 1);
      const indices = new Uint32Array((to - from) * (columns - 1) * 6);
      let next = 0;
      for (let r = from; r < to; r += 1) {
        for (let c = 0; c < columns - 1; c += 1) {
          const a = r * columns + c;
          const b = a + columns;
          indices.set([a, a + 1, b, b, a + 1, b + 1], next);
          next += 6;
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", position);
      geometry.setAttribute("normal", normal);
      geometry.setAttribute("aDepth", depth);
      geometry.setAttribute("aKind", kind);
      geometry.setIndex(new BufferAttribute(indices, 1));
      const sphere = new Sphere();
      const points: Vector3[] = [];
      for (let r = from; r <= to; r += 4) {
        for (let c = 0; c < columns; c += 4) {
          points.push(corner.fromArray(positions, 3 * (r * columns + c)).clone());
        }
      }
      sphere.setFromPoints(points);
      sphere.radius += 6;
      geometry.boundingSphere = sphere;
      const mesh = new Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      meshes.push(mesh);
    }
    return meshes;
  }

  /** Each point's normal: the mean of its triangles', weighted by their size. */
  private static normals(sheet: Sheet): Float32Array {
    const { rows, columns, positions } = sheet;
    const normals = new Float32Array(positions.length);
    const add = (a: number, b: number, c: number): void => {
      const ax = positions[3 * a] ?? 0;
      const ay = positions[3 * a + 1] ?? 0;
      const az = positions[3 * a + 2] ?? 0;
      const ux = (positions[3 * b] ?? 0) - ax;
      const uy = (positions[3 * b + 1] ?? 0) - ay;
      const uz = (positions[3 * b + 2] ?? 0) - az;
      const vx = (positions[3 * c] ?? 0) - ax;
      const vy = (positions[3 * c + 1] ?? 0) - ay;
      const vz = (positions[3 * c + 2] ?? 0) - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const index of [a, b, c]) {
        normals[3 * index] = (normals[3 * index] ?? 0) + nx;
        normals[3 * index + 1] = (normals[3 * index + 1] ?? 0) + ny;
        normals[3 * index + 2] = (normals[3 * index + 2] ?? 0) + nz;
      }
    };
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < columns - 1; c += 1) {
        const a = r * columns + c;
        const b = a + columns;
        add(a, a + 1, b);
        add(b, a + 1, b + 1);
      }
    }
    for (let index = 0; index < normals.length; index += 3) {
      const x = normals[index] ?? 0;
      const y = normals[index + 1] ?? 0;
      const z = normals[index + 2] ?? 0;
      const length = Math.hypot(x, y, z) || 1;
      normals[index] = x / length;
      normals[index + 1] = y / length;
      normals[index + 2] = z / length;
    }
    return normals;
  }
}
