import {
  BoxGeometry,
  BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
} from "three";
import type { BufferGeometry, Material } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { FieldNoise } from "./field-noise";
import { GlacierShape } from "./glacier-shape";

/** A tower of ice standing on the glacier: where its foot is, how big it is each way, how it's
 * turned and how it leans, which of the shapes it is, and whether it's near enough to the trail
 * to be drawn in full. */
export interface Serac {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly turn: number;
  readonly lean: number;
  readonly shape: number;
  readonly near: boolean;
}

/**
 * The seracs: the towers and blocks of ice the glacier breaks into as it falls, standing all
 * over it. Small jumbled blocks in the Popcorn, towers as tall as a house in the maze and the
 * Upper Icefall, none on the moraine or the Cwm's snow. Where each stands is the level's, by
 * its seed, and never on the trail nor over a crevasse the trail crosses. A few shapes, each cut
 * from a block by fractures as ice cleaves, are drawn many times over, turned and stretched, so
 * hundreds of towers cost the graphics card a handful of meshes (#311).
 */
export class SeracField {
  /** How many shapes there are, and how finely each is cut near the trail and far from it. */
  private static readonly SHAPES = 8;
  private static readonly FINE = [6, 9, 6] as const;
  private static readonly COARSE = [3, 4, 3] as const;
  /** The grid the towers are scattered on, in metres, one at most to a square. */
  private static readonly GRID = 7;
  /** How far from the trail a tower is still drawn in full, and how long a stretch of the
   * valley shares a mesh, in metres. */
  private static readonly NEAR = 70;
  private static readonly BAND = 90;
  /** How far the trail's edge stays clear of a tower's side, in metres. */
  private static readonly CLEAR = 2.4;

  readonly group = new Group();
  readonly triangles: number;
  readonly count: number;

  constructor(shape: GlacierShape, material: Material, seed: number) {
    const seracs = SeracField.stand(shape, seed);
    const fine = SeracField.shapes(seed, SeracField.FINE);
    const coarse = SeracField.shapes(seed, SeracField.COARSE);
    const groups = new Map<string, Serac[]>();
    for (const serac of seracs) {
      const band = Math.floor(-serac.z / SeracField.BAND);
      const key = `${serac.shape} ${serac.near ? 1 : 0} ${band}`;
      groups.set(key, [...(groups.get(key) ?? []), serac]);
    }
    const matrix = new Matrix4();
    const turn = new Quaternion();
    let triangles = 0;
    for (const group of groups.values()) {
      const [first] = group;
      const geometry = (first?.near === true ? fine : coarse)[first?.shape ?? 0];
      if (geometry === undefined) {
        continue;
      }
      const mesh = new InstancedMesh(geometry, material, group.length);
      for (const [index, serac] of group.entries()) {
        turn.setFromEuler(new Euler(serac.lean * 0.6, serac.turn, serac.lean, "YXZ"));
        matrix.compose(
          new Vector3(serac.x, serac.y, serac.z),
          turn,
          new Vector3(serac.width, serac.height, serac.depth),
        );
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      triangles += ((geometry.index?.count ?? 0) / 3) * group.length;
    }
    this.triangles = triangles;
    this.count = seracs.length;
  }

  /** Where the towers stand: one square of the grid at a time, by the level's seed. */
  static stand(shape: GlacierShape, seed: number): readonly Serac[] {
    const noise = new FieldNoise(seed + 77);
    const { GRID, NEAR, CLEAR } = SeracField;
    const [firstRow] = shape.rows;
    const from = (firstRow?.x ?? 0) + 20;
    const to = (shape.rows.at(-1)?.x ?? 0) - 20;
    const seracs: Serac[] = [];
    const wide = GlacierShape.HALF_WIDTH - 40;
    for (let row = Math.floor(from / GRID); row * GRID < to; row += 1) {
      for (let column = Math.floor(-wide / GRID); column * GRID < wide; column += 1) {
        const upValley = (row + 0.15 + 0.7 * noise.corner(column, row, 1)) * GRID;
        const x = (column + 0.15 + 0.7 * noise.corner(column, row, 2)) * GRID;
        const tallest = shape.towers(upValley);
        const patch = noise.fractal(x / 60, upValley / 60, 2, 3);
        const chance = Math.min(tallest / 9, 1) * (0.1 + 1.2 * patch);
        if (tallest < 0.5 || noise.corner(column, row, 4) > chance) {
          continue;
        }
        const share = noise.corner(column, row, 5);
        const height = tallest * (0.22 + 0.78 * Math.pow(share, 2.2));
        const width = Math.min(
          Math.max(height * (0.45 + 0.5 * noise.corner(column, row, 6)), 1.6),
          GRID * 1.7,
        );
        const depth = width * (0.7 + 0.6 * noise.corner(column, row, 7));
        const reach = Math.abs(x - shape.asideOf(upValley));
        const half = Math.max(width, depth) * 0.6;
        if (reach < half + CLEAR || shape.crevassed(x, -upValley, half)) {
          continue;
        }
        const foot = Math.min(
          shape.floor(x, -upValley).y,
          shape.floor(x + half, -upValley).y,
          shape.floor(x - half, -upValley).y,
          shape.floor(x, -upValley + half).y,
          shape.floor(x, -upValley - half).y,
        );
        seracs.push({
          x,
          y: foot - 0.12 * height,
          z: -upValley,
          width,
          height: height * 1.12,
          depth,
          turn: noise.corner(column, row, 8) * Math.PI * 2,
          lean: (noise.corner(column, row, 9) - 0.5) * 0.24,
          shape: Math.floor(noise.corner(column, row, 10) * SeracField.SHAPES),
          near: reach < NEAR,
        });
      }
    }
    return seracs;
  }

  /** The shapes: each a block a unit wide, deep and tall, its foot at the origin, cut by
   * fractures and worn. */
  private static shapes(
    seed: number,
    cuts: readonly [number, number, number],
  ): readonly BufferGeometry[] {
    return Array.from({ length: SeracField.SHAPES }, (_, index) =>
      SeracField.shape(new FieldNoise(seed + 100 + index), cuts),
    );
  }

  /** A block of ice: a box cut down by fracture planes, most of them near upright as ice
   * cleaves, under a slanted top; undercut a little at its foot, and lumpy. */
  private static shape(
    noise: FieldNoise,
    [across, up, deep]: readonly [number, number, number],
  ): BufferGeometry {
    const box = new BoxGeometry(1, 1, 1, across, up, deep);
    box.translate(0, 0.5, 0);
    box.deleteAttribute("uv");
    box.deleteAttribute("normal");
    const geometry = mergeVertices(box, 1e-4);
    const position = geometry.getAttribute("position");
    const planes: { normal: Vector3; far: number }[] = [];
    for (let cut = 0; cut < 11; cut += 1) {
      const round = noise.corner(cut, 0) * Math.PI * 2;
      const tip =
        noise.corner(cut, 1) < 0.72
          ? (noise.corner(cut, 2) - 0.5) * 0.3
          : (noise.corner(cut, 2) - 0.2) * 1.1;
      const normal = new Vector3(
        Math.cos(round) * Math.cos(tip),
        Math.sin(tip),
        Math.sin(round) * Math.cos(tip),
      );
      const whole = Math.abs(normal.x) / 2 + Math.abs(normal.z) / 2 + Math.max(normal.y, 0);
      const least = Math.max(normal.y, 0) * 0.55;
      planes.push({ normal, far: least + (whole - least) * (0.6 + 0.34 * noise.corner(cut, 3)) });
    }
    const top = new Vector3(
      (noise.corner(20, 0) - 0.5) * 0.8,
      1,
      (noise.corner(20, 1) - 0.5) * 0.8,
    ).normalize();
    planes.push({ normal: top, far: (0.78 + 0.16 * noise.corner(20, 2)) * top.y });
    const point = new Vector3();
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      const height = point.y;
      const pinch = 1 - 0.13 * Math.sin(Math.min(height * 1.7, 1) * Math.PI);
      point.x *= pinch;
      point.z *= pinch;
      for (const { normal, far } of planes) {
        const over = normal.dot(point) - far;
        if (over > 0) {
          point.addScaledVector(normal, -over);
        }
      }
      const out = Math.hypot(point.x, point.z) || 1;
      const lumps =
        noise.fractal(point.x * 2.3 + point.y * 1.1, point.z * 2.3 - point.y * 0.7, 2, 30) - 0.5;
      const push = lumps * 0.16 * Math.min(height * 5, 1);
      point.x += (point.x / out) * push;
      point.z += (point.z / out) * push;
      point.y += (noise.fractal(point.x * 3, point.z * 3, 2, 31) - 0.5) * 0.1 * height;
      position.setXYZ(index, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("aDepth", new BufferAttribute(new Float32Array(position.count), 1));
    geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(position.count), 1));
    return geometry;
  }
}
