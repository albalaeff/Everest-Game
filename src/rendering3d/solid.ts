import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Where a piece goes in its solid: its place, its size each way, and how it's turned. */
export interface Placing {
  readonly at?: readonly [number, number, number];
  readonly size?: readonly [number, number, number];
  readonly turn?: readonly [number, number, number];
}

/**
 * A solid thing made of simple pieces, balls, tubes, boxes and turned shapes, each with its own
 * colour, joined into one mesh: a climber's thigh, a boot with its crampon, a ladder. Everything
 * in the 3D picture that isn't ground is built this way, in code, as the game's pictures are;
 * one mesh a thing keeps a figure to a handful of draws.
 */
export class Solid {
  private readonly pieces: BufferGeometry[] = [];

  /** A ball. */
  ball(colour: number, placing: Placing, detail = 12): this {
    return this.add(
      new SphereGeometry(1, detail, Math.max(Math.round(detail * 0.7), 4)),
      colour,
      placing,
    );
  }

  /** A box. */
  box(colour: number, placing: Placing): this {
    return this.add(new BoxGeometry(1, 1, 1), colour, placing);
  }

  /** A tube standing on its end, a unit tall and a unit across, narrower at the top by `taper`. */
  tube(colour: number, placing: Placing, taper = 1, sides = 10): this {
    return this.add(new CylinderGeometry(0.5 * taper, 0.5, 1, sides), colour, placing);
  }

  /** A ring lying flat, a unit across, its cord `cord` thick. */
  ring(colour: number, placing: Placing, cord = 0.1): this {
    const ring = new TorusGeometry(0.5, cord / 2, 6, 18);
    ring.rotateX(Math.PI / 2);
    return this.add(ring, colour, placing);
  }

  /** A limb of a down suit, hanging from the origin: `length` long, `top` thick at the joint
   * and `bottom` at its end, quilted into `baffles` of down, pinched at each seam. */
  limb(
    colour: number,
    length: number,
    top: number,
    bottom: number,
    baffles: number,
    placing: Placing = {},
  ): this {
    const profile: Vector2[] = [new Vector2(0, 0)];
    const steps = baffles * 6;
    for (let step = 0; step <= steps; step += 1) {
      const share = step / steps;
      const seam = 1 - 0.09 * Math.pow(Math.abs(Math.cos(Math.PI * baffles * share)), 10);
      const swell = 1 + 0.06 * Math.sin(Math.PI * share);
      profile.push(new Vector2((top + (bottom - top) * share) * seam * swell, -length * share));
    }
    profile.push(new Vector2(0, -length));
    // Turned about the vertical with its outline given top down: its faces look outwards.
    const limb = new LatheGeometry(profile.reverse(), 12);
    return this.add(limb, colour, placing);
  }

  /** The pieces as one mesh's geometry, each point with its piece's colour. */
  build(): BufferGeometry {
    const merged = mergeGeometries(this.pieces);
    for (const piece of this.pieces) {
      piece.dispose();
    }
    return merged;
  }

  private add(geometry: BufferGeometry, colour: number, { at, size, turn }: Placing): this {
    const place = new Matrix4().compose(
      new Vector3(...(at ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(turn ?? [0, 0, 0]))),
      new Vector3(...(size ?? [1, 1, 1])),
    );
    geometry.deleteAttribute("uv");
    geometry.applyMatrix4(place);
    const { count } = geometry.getAttribute("position");
    const { r, g, b } = new Color(colour);
    const colours = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colours.set([r, g, b], 3 * index);
    }
    geometry.setAttribute("aColor", new BufferAttribute(colours, 3));
    this.pieces.push(geometry);
    return this;
  }
}
