import { BufferAttribute, BufferGeometry, Color, Group, Mesh, Vector3 } from "three";
import type { Material } from "three";

import type { Point, SlopePhysics } from "../physics";
import { Palette } from "../rendering/palette";
import { Solid } from "./solid";
import type { Trail } from "./trail";

/** A rope as it's drawn: a thin tube along a chain of points, the physics' or a cowstail's. */
export class RopeTube {
  private static readonly SIDES = 5;
  private static readonly RADIUS = 0.0075;

  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly centre = new Vector3();

  constructor(
    private readonly count: number,
    colour: number,
    material: Material,
  ) {
    const { SIDES } = RopeTube;
    this.positions = new Float32Array(count * SIDES * 3);
    this.normals = new Float32Array(count * SIDES * 3);
    const colours = new Float32Array(count * SIDES * 3);
    const { r, g, b } = new Color(colour);
    for (let index = 0; index < count * SIDES; index += 1) {
      // A twist of darker strands, as a kernmantle rope's sheath has.
      const shade = (index + Math.floor(index / SIDES)) % SIDES === 0 ? 0.55 : 1;
      colours.set([r * shade, g * shade, b * shade], 3 * index);
    }
    const indices: number[] = [];
    for (let ring = 0; ring < count - 1; ring += 1) {
      for (let side = 0; side < SIDES; side += 1) {
        const a = ring * SIDES + side;
        const b2 = ring * SIDES + ((side + 1) % SIDES);
        indices.push(a, b2, a + SIDES, b2, b2 + SIDES, a + SIDES);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(this.normals, 3));
    geometry.setAttribute("aColor", new BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** The tube along `points` of the world, `count` of them. Where its middle is. */
  along(points: readonly Vector3[]): Vector3 {
    const { SIDES, RADIUS } = RopeTube;
    const { positions, normals, count } = this;
    const ahead = new Vector3();
    const across = new Vector3();
    const over = new Vector3();
    this.centre.set(0, 0, 0);
    for (let ring = 0; ring < count; ring += 1) {
      const at = points[Math.min(ring, points.length - 1)] ?? this.centre;
      const before = points[Math.max(ring - 1, 0)] ?? at;
      const after = points[Math.min(ring + 1, points.length - 1)] ?? at;
      ahead.copy(after).sub(before);
      if (ahead.lengthSq() < 1e-10) {
        ahead.set(0, 0, -1);
      }
      ahead.normalize();
      across.set(-ahead.z, 0, ahead.x);
      if (across.lengthSq() < 1e-6) {
        across.set(1, 0, 0);
      }
      across.normalize();
      over.crossVectors(across, ahead);
      for (let side = 0; side < SIDES; side += 1) {
        const round = (side / SIDES) * 2 * Math.PI;
        const nx = across.x * Math.cos(round) + over.x * Math.sin(round);
        const ny = across.y * Math.cos(round) + over.y * Math.sin(round);
        const nz = across.z * Math.cos(round) + over.z * Math.sin(round);
        const index = 3 * (ring * SIDES + side);
        positions.set([at.x + nx * RADIUS, at.y + ny * RADIUS, at.z + nz * RADIUS], index);
        normals.set([nx, ny, nz], index);
      }
      this.centre.add(at);
    }
    const { geometry } = this.mesh;
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("normal").needsUpdate = true;
    return this.centre.divideScalar(Math.max(count, 1));
  }
}

/**
 * What the route is made of, where the physics has it: the fixed ropes, each a tube along the
 * physics' own chain of points and drawn again while a climber is near enough to move it, with
 * a snow stake at each anchor; and the aluminium ladders, across the crevasses and up the walls,
 * lashed end to end where one isn't long enough. The ropes run beside the trail, a hand's reach
 * to the right, as a fixed line does.
 */
export class RouteKit {
  /** How far to the right of the trail's centre the fixed line runs, in metres. */
  static readonly ROPE_SIDE = 0.55;
  /** How far apart a ladder's rungs are, how wide it is, and how long each section is. */
  private static readonly RUNGS = 0.28;
  private static readonly WIDTH = 0.36;
  private static readonly SECTION = 2.4;
  /** How near the player a rope must be to be drawn again each frame, in metres. */
  private static readonly LIVE = 30;

  readonly group = new Group();
  /** The ladders alone: they stand still, and throw the ground's shadows. */
  readonly ladders = new Group();
  private readonly ropes = new Map<string, { tube: RopeTube; middle: Vector3 }>();
  private readonly scratch: Vector3[] = [];

  constructor(
    private readonly physics: SlopePhysics,
    private readonly trail: Trail,
    cloth: Material,
    metal: Material,
  ) {
    const stake = RouteKit.stake();
    for (const id of physics.ropes) {
      const shape = physics.rope(id);
      const tube = new RopeTube(shape.length, Palette.ROPE, cloth);
      const middle = tube.along(this.world(shape)).clone();
      this.ropes.set(id, { tube, middle });
      this.group.add(tube.mesh);
      for (const end of [shape[0], shape.at(-1)]) {
        if (end !== undefined) {
          const at = this.trail.place(end, RouteKit.ROPE_SIDE);
          const mesh = new Mesh(stake, metal);
          mesh.position.set(at.x, at.y, at.z);
          mesh.rotation.set(0.35, 0, 0.1);
          this.ladders.add(mesh);
        }
      }
    }
    for (const id of physics.ladders) {
      const [from, to] = physics.ladder(id);
      if (from !== undefined && to !== undefined) {
        this.ladders.add(this.ladder(from, to, metal));
      }
    }
    this.group.add(this.ladders);
  }

  /** A frame: the ropes near `player` follow the physics' chains. */
  update(player: Vector3): void {
    for (const [id, rope] of this.ropes) {
      if (rope.middle.distanceTo(player) < RouteKit.LIVE) {
        rope.middle.copy(rope.tube.along(this.world(this.physics.rope(id))));
      }
    }
  }

  /** Where a point of a rope, in the physics' plane, is in the world. */
  onRope(point: Point, into: Vector3): Vector3 {
    const at = this.trail.place(point, RouteKit.ROPE_SIDE);
    return into.set(at.x, at.y + 0.02, at.z);
  }

  private world(points: readonly Point[]): readonly Vector3[] {
    const { scratch } = this;
    while (scratch.length < points.length) {
      scratch.push(new Vector3());
    }
    return points.map((point, index) => this.onRope(point, scratch[index] ?? new Vector3()));
  }

  /** A ladder from one point of the physics' plane to another: two rails and a rung every
   * 28 cm, in sections lashed end to end with cord, its ends tied back to stakes. */
  private ladder(from: Point, to: Point, metal: Material): Mesh {
    const { RUNGS, WIDTH, SECTION } = RouteKit;
    const a = this.trail.place(from);
    const b = this.trail.place(to);
    const start = new Vector3(a.x, a.y, a.z);
    const along = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = along.length();
    along.normalize();
    const right = new Vector3(1, 0, 0);
    const out = new Vector3().crossVectors(right, along).normalize();
    right.crossVectors(out, along).normalize();
    const solid = new Solid();
    const alloy = Palette.LADDER;
    for (const side of [-1, 1]) {
      solid.box(alloy, {
        at: [(side * WIDTH) / 2, 0.035, length / 2],
        size: [0.028, 0.07, length + 0.5],
      });
    }
    for (let rung = RUNGS / 2; rung < length; rung += RUNGS) {
      solid.tube(
        alloy,
        { at: [0, 0.035, rung], size: [0.028, WIDTH, 0.028], turn: [0, 0, Math.PI / 2] },
        1,
        6,
      );
    }
    for (let joint = SECTION; joint < length - 0.6; joint += SECTION) {
      for (const side of [-1, 1]) {
        solid.box(Palette.LASHING, {
          at: [(side * WIDTH) / 2, 0.035, joint],
          size: [0.05, 0.09, 0.22],
        });
      }
    }
    const mesh = new Mesh(solid.build(), metal);
    mesh.matrix.makeBasis(right, out, along).setPosition(start.addScaledVector(out, 0.02));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** A snow stake: an aluminium angle driven in at a slant, a red sling round its head. */
  private static stake(): BufferGeometry {
    return new Solid()
      .box(Palette.PICKET, { at: [0, 0.12, 0], size: [0.04, 0.6, 0.04] })
      .box(Palette.SCREW_HANGER, { at: [0, 0.36, 0], size: [0.046, 0.05, 0.046] })
      .build();
  }
}
