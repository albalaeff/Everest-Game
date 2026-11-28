import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
} from "three";
import type { Material } from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
  private static readonly SHAPES = 12;
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
  /** The edges of a tower sharper than this, in radians, are drawn as edges: where it broke. */
  private static readonly CREASE = 0.62;
  /** A tower this tall has blocks fallen from it lying round its foot, in metres; and how big
   * the biggest of them is beside it. */
  private static readonly SHEDS = { from: 3.5, share: 0.3 };

  readonly group = new Group();
  readonly triangles: number;
  readonly count: number;
  /** The towers themselves: where each stands and how big it is. */
  readonly seracs: readonly Serac[];

  /** `detailed` draws the towers near the trail in full; without it they're all drawn as the
   * far ones are, a quarter of the triangles, for the lowest level of the graphics setting. */
  constructor(shape: GlacierShape, material: Material, seed: number, detailed: boolean) {
    const seracs = SeracField.stand(shape, seed);
    const fine = SeracField.shapes(seed, detailed ? SeracField.FINE : SeracField.COARSE);
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
      // A geometry of its own over the shape's shared points: three.js keeps a mesh's vertex
      // set-up by its geometry, and meshes that shared one would set it up again every draw.
      const own = new BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        own.setAttribute(name, attribute);
      }
      own.setIndex(geometry.index);
      const mesh = new InstancedMesh(own, material, group.length);
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
    this.seracs = seracs;
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
        if (height < SeracField.SHEDS.from || reach > NEAR) {
          continue;
        }
        // The blocks that have come off it, lying where they fell, tipped any way.
        for (let block = 0; block < 2; block += 1) {
          const layer = 20 + block * 5;
          const round = noise.corner(column, row, layer) * Math.PI * 2;
          const off = half + 0.4 + noise.corner(column, row, layer + 1) * height * 0.5;
          const blockX = x + Math.cos(round) * off;
          const blockUp = upValley + Math.sin(round) * off;
          const size = Math.min(
            height * SeracField.SHEDS.share * (0.35 + 0.65 * noise.corner(column, row, layer + 2)),
            2.6,
          );
          if (
            Math.abs(blockX - shape.asideOf(blockUp)) < size + CLEAR ||
            shape.crevassed(blockX, -blockUp, size)
          ) {
            continue;
          }
          seracs.push({
            x: blockX,
            y: shape.floor(blockX, -blockUp).y - 0.3 * size,
            z: -blockUp,
            width: size * (1 + 0.8 * noise.corner(column, row, layer + 3)),
            height: size,
            depth: size * (0.8 + 0.6 * noise.corner(column, row, layer + 4)),
            turn: round * 3,
            lean: (noise.corner(column, row, layer + 3) - 0.5) * 1.1,
            shape: Math.floor(noise.corner(column, row, layer + 4) * SeracField.SHAPES),
            near: false,
          });
        }
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
   * cleaves, under a slanted top. One in three stands as a block, flat-topped; one as a spire;
   * one as a fin, thin one way. Each is melted in at its foot on the side the sun works on,
   * some are split down from the top, and all are a little lumpy. Where two fractures meet the
   * edge is drawn sharp, as broken ice is. */
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
    const kind = Math.floor(noise.corner(40, 0) * 3);
    const planes: { normal: Vector3; far: number }[] = [];
    for (let cut = 0; cut < 11; cut += 1) {
      const round = noise.corner(cut, 0) * Math.PI * 2;
      const tip =
        noise.corner(cut, 1) < 0.7
          ? (noise.corner(cut, 2) - 0.5) * 0.4
          : (noise.corner(cut, 2) - 0.15) * 1.2;
      const normal = new Vector3(
        Math.cos(round) * Math.cos(tip),
        Math.sin(tip),
        Math.sin(round) * Math.cos(tip),
      );
      const whole = Math.abs(normal.x) / 2 + Math.abs(normal.z) / 2 + Math.max(normal.y, 0);
      const least = Math.max(normal.y, 0) * 0.5;
      planes.push({ normal, far: least + (whole - least) * (0.5 + 0.46 * noise.corner(cut, 3)) });
    }
    // A broken top: two slants that meet in a ridge, or one alone; a block's is nearly level.
    const slant = kind === 0 ? 0.35 : 1.3;
    for (const side of [0, 1]) {
      const top = new Vector3(
        (noise.corner(20 + side, 0) - 0.5) * slant,
        1,
        (noise.corner(20 + side, 1) - 0.5) * slant,
      ).normalize();
      planes.push({ normal: top, far: (0.72 + 0.26 * noise.corner(20 + side, 2)) * top.y });
    }
    const taper =
      kind === 1 ? 0.5 + 0.3 * noise.corner(30, 0) : 0.3 * Math.pow(noise.corner(30, 0), 2);
    const thin = kind === 2 ? 0.4 + 0.2 * noise.corner(30, 3) : 1;
    const shearX = (noise.corner(30, 1) - 0.5) * 0.36;
    const shearZ = (noise.corner(30, 2) - 0.5) * 0.36;
    // The melt at the foot: which side, and how far in.
    const meltRound = noise.corner(31, 0) * Math.PI * 2;
    const melt = 0.1 + 0.16 * noise.corner(31, 1);
    // The split down from the top: where across it, how wide and how deep; half have none.
    const split = {
      at: (noise.corner(32, 0) - 0.5) * 0.5,
      wide: 0.07 + 0.08 * noise.corner(32, 1),
      deep: noise.corner(32, 2) < 0.5 ? 0 : 0.2 + 0.3 * noise.corner(32, 3),
      turn: noise.corner(32, 4) * Math.PI,
    };
    const point = new Vector3();
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      for (const { normal, far } of planes) {
        const over = normal.dot(point) - far;
        if (over > 0) {
          point.addScaledVector(normal, -over);
        }
      }
      const height = point.y;
      const acrossSplit = point.x * Math.cos(split.turn) + point.z * Math.sin(split.turn);
      const inSplit = Math.exp(-(((acrossSplit - split.at) / split.wide) ** 2));
      point.y -= split.deep * inSplit * FieldNoise.smooth(0.35, 0.8, height);
      const pinch = 1 - taper * height;
      point.x *= pinch;
      point.z *= pinch * thin;
      const out = Math.hypot(point.x, point.z) || 1;
      const facing = (point.x * Math.cos(meltRound) + point.z * Math.sin(meltRound)) / out;
      const notch =
        melt * Math.max(facing, 0) * Math.exp(-(((height - 0.16) / 0.11) ** 2)) +
        0.05 * Math.exp(-(((height - 0.1) / 0.1) ** 2));
      const big =
        noise.fractal(point.x * 1.4 + point.y * 0.9, point.z * 1.4 - point.y * 0.6, 2, 30) - 0.5;
      const small =
        noise.fractal(point.x * 4.5 + point.y * 2, point.z * 4.5 + point.y * 3, 2, 32) - 0.5;
      const push = (big * 0.22 + small * 0.06) * Math.min(height * 5, 1) - notch;
      point.x += (point.x / out) * push + shearX * height;
      point.z += (point.z / out) * push + shearZ * height;
      point.y += (noise.fractal(point.x * 3, point.z * 3, 2, 31) - 0.5) * 0.1 * height;
      position.setXYZ(index, point.x, point.y, point.z);
    }
    const creased = mergeVertices(toCreasedNormals(geometry, SeracField.CREASE), 1e-4);
    const points = creased.getAttribute("position");
    creased.setAttribute("aDepth", new BufferAttribute(new Float32Array(points.count), 1));
    creased.setAttribute("aKind", new BufferAttribute(new Float32Array(points.count), 1));
    // A tower's foot stands among its neighbours and in its own shade: less of the sky there.
    const open = new Float32Array(points.count);
    for (let index = 0; index < points.count; index += 1) {
      open[index] = 0.5 + 0.5 * FieldNoise.smooth(0, 0.45, points.getY(index));
    }
    creased.setAttribute("aOpen", new BufferAttribute(open, 1));
    return creased;
  }
}
