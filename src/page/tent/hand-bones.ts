/** A point or a way in three dimensions: across to the right, down, and toward the viewer, in
 * the tent's pixels, or in a hand's millimetres. */
export class Vector3 {
  static readonly ZERO = new Vector3(0, 0, 0);
  /** Toward the viewer. */
  static readonly OUT = new Vector3(0, 0, 1);

  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}

  plus(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  minus(other: Vector3): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  times(by: number): Vector3 {
    return new Vector3(this.x * by, this.y * by, this.z * by);
  }

  dot(other: Vector3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  cross(other: Vector3): Vector3 {
    return new Vector3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  get size(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  /** One long, the same way; nothing stays nothing. */
  unit(): Vector3 {
    const size = this.size;
    return size < 1e-12 ? this : this.times(1 / size);
  }

  /** Turned about `axis`, a unit way, by `degrees`: from the way `axis` crosses into, round. */
  turned(axis: Vector3, degrees: number): Vector3 {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return this.times(cos)
      .plus(axis.cross(this).times(sin))
      .plus(axis.times(axis.dot(this) * (1 - cos)));
  }

  /** What's left of this way square to `axis`, a unit way. */
  across(axis: Vector3): Vector3 {
    return this.minus(axis.times(this.dot(axis)));
  }

  /** The way from this to `other`, `share` of it. */
  toward(other: Vector3, share: number): Vector3 {
    return this.plus(other.minus(this).times(share));
  }

  /** Its mirror image, left for right. */
  mirrored(): Vector3 {
    return new Vector3(-this.x, this.y, this.z);
  }

  /** The angle between two ways, in degrees. */
  angle(other: Vector3): number {
    const cos = this.unit().dot(other.unit());
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  }
}

/** How a hand is turned: the ways its thumb, its fingers and its back point, each one long. A
 * right hand's thumb is the way its fingers cross into its back; a left hand's is the other. */
export class HandTurn {
  /** A right hand with its back to the viewer and its fingers down, as one lies on a knee. */
  static readonly FLAT = new HandTurn(new Vector3(1, 0, 0), new Vector3(0, 1, 0), Vector3.OUT);

  constructor(
    readonly thumb: Vector3,
    readonly along: Vector3,
    readonly back: Vector3,
  ) {}

  /** A right hand whose fingers point `along` and whose back faces as near `back` as it can:
   * where `back` is nearly the fingers' way, as near the viewer as well, so the hand turns
   * smoothly through it rather than flip. */
  static of(along: Vector3, back: Vector3): HandTurn {
    const fingers = along.unit();
    const facing = HandTurn.square(back, fingers);
    return new HandTurn(fingers.cross(facing), fingers, facing);
  }

  /** The part of `wanted` square to `axis`, a unit way, one long; where `wanted` is nearly
   * along `axis`, swung smoothly toward the viewer, or up where the axis points at the
   * viewer. */
  static square(wanted: Vector3, axis: Vector3): Vector3 {
    const { NEAR } = HandTurn;
    const part = wanted.unit().across(axis);
    const size = part.size;
    if (size >= NEAR) {
      return part.unit();
    }
    const spare = Math.abs(axis.z) < 0.9 ? Vector3.OUT : new Vector3(0, -1, 0);
    const lean = (1 - size / NEAR) ** 2;
    return part
      .plus(
        spare
          .across(axis)
          .unit()
          .times(lean * NEAR),
      )
      .unit();
  }

  /** The way a way of the hand's own (x to the thumb, y along the fingers, z out of its back)
   * points. */
  of(local: Vector3): Vector3 {
    return this.thumb.times(local.x).plus(this.along.times(local.y)).plus(this.back.times(local.z));
  }

  /** A way as the hand's own. */
  local(way: Vector3): Vector3 {
    return new Vector3(way.dot(this.thumb), way.dot(this.along), way.dot(this.back));
  }

  /** Its mirror image: a left hand turned as this right one, seen in a mirror. */
  mirrored(): HandTurn {
    return new HandTurn(this.thumb.mirrored(), this.along.mirrored(), this.back.mirrored());
  }

  /** `share` of the way from this turn to `other`, turned the short way round about one axis,
   * as a hand turns. */
  toward(other: HandTurn, share: number): HandTurn {
    const t = Math.min(1, Math.max(0, share));
    if (t <= 0) {
      return this;
    }
    if (t >= 1) {
      return other;
    }
    const from = this.quaternion();
    let to = other.quaternion();
    let cos = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
    if (cos < 0) {
      to = [-to[0], -to[1], -to[2], -to[3]];
      cos = -cos;
    }
    const angle = Math.acos(Math.min(1, cos));
    const [a, b] =
      angle < 1e-6
        ? [1 - t, t]
        : [Math.sin((1 - t) * angle) / Math.sin(angle), Math.sin(t * angle) / Math.sin(angle)];
    const mixed: Quaternion = [
      a * from[0] + b * to[0],
      a * from[1] + b * to[1],
      a * from[2] + b * to[2],
      a * from[3] + b * to[3],
    ];
    return HandTurn.fromQuaternion(mixed);
  }

  /** How near a way that a hand's back should face may come to its fingers' before the back
   * swings toward the viewer: the size of what's left of it square to them. */
  private static readonly NEAR = 0.35;

  /** The turn as a unit quaternion: w, x, y, z. */
  private quaternion(): Quaternion {
    const { thumb: c0, along: c1, back: c2 } = this;
    const trace = c0.x + c1.y + c2.z;
    let q: Quaternion;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      q = [s / 4, (c1.z - c2.y) / s, (c2.x - c0.z) / s, (c0.y - c1.x) / s];
    } else if (c0.x > c1.y && c0.x > c2.z) {
      const s = Math.sqrt(1 + c0.x - c1.y - c2.z) * 2;
      q = [(c1.z - c2.y) / s, s / 4, (c1.x + c0.y) / s, (c2.x + c0.z) / s];
    } else if (c1.y > c2.z) {
      const s = Math.sqrt(1 + c1.y - c0.x - c2.z) * 2;
      q = [(c2.x - c0.z) / s, (c1.x + c0.y) / s, s / 4, (c2.y + c1.z) / s];
    } else {
      const s = Math.sqrt(1 + c2.z - c0.x - c1.y) * 2;
      q = [(c0.y - c1.x) / s, (c2.x + c0.z) / s, (c2.y + c1.z) / s, s / 4];
    }
    const size = Math.hypot(...q) || 1;
    return [q[0] / size, q[1] / size, q[2] / size, q[3] / size];
  }

  /** The turn a unit quaternion makes. */
  private static fromQuaternion(q: Quaternion): HandTurn {
    const size = Math.hypot(...q) || 1;
    const [w, x, y, z] = [q[0] / size, q[1] / size, q[2] / size, q[3] / size];
    return new HandTurn(
      new Vector3(1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)),
      new Vector3(2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)),
      new Vector3(2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)),
    );
  }
}

/** A turn in three dimensions as a unit quaternion: w, x, y, z. */
type Quaternion = readonly [number, number, number, number];

/** One of the hand's digits as it's bent: its joints from its root (a finger's knuckle, the
 * thumb's base) to its tip, how thick it is at each, in millimetres, and the way the back of each
 * bone faces, where the nail is on the last. */
export interface Digit {
  readonly joints: readonly Vector3[];
  readonly radii: readonly number[];
  readonly backs: readonly Vector3[];
}

/** What a hand holds, as its bones meet it: a round thing, by a point on its axis, the axis's way
 * and its radius; or a flat one, by a point on its middle plane, the way its face looks and how
 * thick it is. */
export type Thing =
  | {
      readonly kind: "round";
      readonly centre: Vector3;
      readonly axis: Vector3;
      readonly radius: number;
    }
  | {
      readonly kind: "flat";
      readonly centre: Vector3;
      readonly face: Vector3;
      readonly thick: number;
    };

/** A hand posed, in its own millimetres from the wrist: the four fingers, the first first, and
 * the thumb; where what it holds is held from (the point a pose puts where the hand grips), the
 * way of it a pose aims, and the side of it that must face the viewer, for what can't turn in the
 * hand; and what it closes on. */
export interface HandShape {
  readonly fingers: readonly Digit[];
  readonly thumb: Digit;
  readonly hold: Vector3;
  readonly aim: Vector3;
  readonly face: Vector3 | null;
  readonly thing: Thing | null;
}

/** How a hand closes: open (relaxed, or spread out flat); round something it wraps, a bottle or
 * a lump of snow, or tight round something thin, a spoon's handle, a lighter or the pot's handle,
 * the thumb on a lighter's wheel; round the guitar's neck, the fingertips on its strings; a pen's
 * pinch, a spoon, a pick or a pouch's top between the thumb and the first finger; a flat thing,
 * a pouch by its side or by its top, the fingers over its face and the thumb behind, or a bar,
 * the thumb on its face. */
export type Grip =
  | "open"
  | "wrap"
  | "cup"
  | "fist"
  | "pot"
  | "lighter"
  | "fret"
  | "pinch"
  | "seal"
  | "plate"
  | "top"
  | "bar";

/** A finger's knuckle, its bones' lengths (to the tip), how thick it is at each joint, and how
 * far it leans toward the thumb, at rest, in degrees. */
interface FingerBones {
  readonly knuckle: Vector3;
  readonly lengths: readonly [number, number, number];
  readonly radii: readonly [number, number, number, number];
  readonly splay: number;
}

/** A finger's lean toward the thumb and the bends of its three joints, in degrees. */
type Bends = readonly [number, number, number, number];

/** How a grip sets the thumb: the way its first bone runs from its base, the way its tip goes as
 * it bends, and its two joints' bends. */
interface ThumbSet {
  readonly root: Vector3;
  readonly curl: Vector3;
  readonly bends: readonly [number, number];
}

/** A grip closed on what it holds: each finger's bends, the thumb's, and where the thing is held
 * in it. */
interface Closed {
  readonly fingers: readonly Bends[];
  readonly thumb: ThumbSet;
  readonly held: Pick<HandShape, "hold" | "aim" | "face" | "thing">;
}

/** How a grip is made: each finger's bends, and the thumb's; for a grip that closes on a round
 * thing, what it closes on, the fingers bent as far as they go until they touch it. */
interface GripSet {
  readonly fingers: readonly Bends[];
  readonly thumb: ThumbSet;
  readonly closes: Thing | null;
  /** Whether the thumb closes over the fingers, round a thin thing, rather than round it. */
  readonly over: boolean;
}

/**
 * The bones of a man's right hand (#274), in millimetres, as ANSUR II measured the US Army's men
 * in 2012 (the median man's hand 193 mm from the wrist's crease to the middle finger's tip and
 * 88 mm across the knuckles) and NIOSH's hand survey has the fingers: a palm from the wrist to the
 * knuckles, four fingers of three bones each, the middle the longest, and a thumb of three from
 * its base low on the palm. It's posed for each grip: open, relaxed or spread flat; closed round
 * what it holds, each finger's joints bending as far as they go until the finger touches it, as a
 * hand closes on a bottle, and the thumb round it the other way, or over the fingers round a thin
 * handle; a pen's pinch, the thumb's tip on the first finger's; and a flat thing between the thumb
 * on its face and the fingers behind it. The hand's frame has the wrist at the origin, the thumb
 * toward +x, the fingers along +y and its back toward +z; the left hand is its mirror image. A
 * grip's shape is the same each time: it's made once.
 */
export class HandBones {
  /** The tent's pixels a millimetre. */
  static readonly SCALE = 0.3;
  /** The fingers, the first first: the knuckles' joints along the curve of the knuckles, the
   * middle finger's 104 mm from the wrist; each finger's bones, 98 mm in all for the middle,
   * about 20 mm wide at its root and 15 at its tip. */
  static readonly FINGERS: readonly FingerBones[] = [
    {
      knuckle: new Vector3(32, 100, 1),
      lengths: [42, 25, 22],
      radii: [10.4, 9.4, 8.4, 7.4],
      splay: 4,
    },
    {
      knuckle: new Vector3(11, 104, 1),
      lengths: [46, 29, 23],
      radii: [10.6, 9.6, 8.6, 7.6],
      splay: 0,
    },
    {
      knuckle: new Vector3(-9, 100, 1),
      lengths: [44, 28, 22],
      radii: [10.1, 9.2, 8.2, 7.2],
      splay: -4,
    },
    {
      knuckle: new Vector3(-28, 92, 1),
      lengths: [35, 20, 20],
      radii: [8.8, 8, 7.2, 6.4],
      splay: -9,
    },
  ];
  /** The thumb: its base low on the palm, toward its palm side; its three bones, and how thick
   * it is at each joint, the first bone in the ball of the thumb. */
  static readonly THUMB = {
    base: new Vector3(25, 24, -12),
    lengths: [46, 32, 27] as const,
    radii: [13.5, 11, 10, 8.5] as const,
  };
  /** The palm's rim, from the wrist round by the little finger to the knuckles and back by the
   * thumb, each point with how far its back is above the bones' plane and its palm below it: the
   * palm's ball of the thumb and its heel thicker. */
  static readonly PALM: readonly (readonly [number, number, number, number])[] = [
    [-25, 4, 12, -12],
    [-36, 30, 12, -15],
    [-42, 62, 11, -16],
    [-42, 86, 10, -13],
    [-30, 100, 11, -11],
    [-10, 108, 12, -11],
    [11, 112, 12, -11],
    [33, 108, 12, -11],
    [45, 94, 11, -12],
    [44, 62, 11, -16],
    [36, 30, 12, -20],
    [24, 4, 12, -12],
  ];
  /** Where the hand's middle is, which an open hand's pose puts where the hand is. */
  static readonly MIDDLE = new Vector3(2, 78, 0);
  /** The most each finger's joints bend, in degrees: its knuckle, and its two others. */
  private static readonly MOST: readonly [number, number, number] = [92, 108, 78];
  /** How far below where it's pinched a pouch held by its top is held, in millimetres: its top
   * 20 mm above, and `TentArt.POUCH`'s 46 px from its top to where a pose holds it. */
  static readonly TOP_HELD = 133;
  /** The radii, in millimetres, of what a hand closes on: the bottle (`TentArt.BOTTLE`'s 31 px),
   * a lump of snow, a spoon's handle, the pot's handle, a lighter, the guitar's neck. */
  static readonly RADII = {
    bottle: 46,
    snow: 40,
    spoon: 4.5,
    handle: 12,
    lighter: 11,
    neck: 15,
  } as const;
  /** How far across the palm a thing that's wrapped slants, its end by the thumb further along
   * the fingers, in degrees. */
  private static readonly SLANT = 14;

  /** How many shapes are kept made, at the most. */
  private static readonly KEPT = 600;
  /** The one hand whose shapes are made and kept. */
  private static readonly KEPT_BY = new HandBones();

  /** The shapes made, each grip, how far shut and how far spread; and each grip closed. */
  private readonly made = new Map<string, HandShape>();
  private readonly closings = new Map<Grip, Closed>();

  /** The hand closed `shut` of the way into `grip`, 0 open to 1 closed on what it holds; an open
   * hand `spread` of the way from relaxed to spread out flat: made once each, to a fortieth. */
  static shape(grip: Grip, shut = 1, spread = 0): HandShape {
    return HandBones.KEPT_BY.shaped(grip, shut, spread);
  }

  private shaped(grip: Grip, shut: number, spread: number): HandShape {
    const closed = Math.round(Math.min(1, Math.max(0, shut)) * 40) / 40;
    const flat = Math.round(Math.min(1, Math.max(0, spread)) * 40) / 40;
    const key = `${grip} ${closed} ${flat}`;
    const known = this.made.get(key);
    if (known !== undefined) {
      return known;
    }
    const made = this.make(grip, closed, flat);
    if (this.made.size >= HandBones.KEPT) {
      this.made.clear();
    }
    this.made.set(key, made);
    return made;
  }

  /** How a hand holding `shape`'s thing is turned to hold it the way `aim` points, a unit way in
   * the picture's plane, its forearm coming along `forearm`, a unit way from the elbow to the
   * wrist: a thing that can turn in the hand about its axis, a bottle or a spoon, has the hand
   * round it as near the forearm's way as it goes; a flat one, or the pot, has its face to the
   * viewer. */
  static turned(shape: HandShape, aim: Vector3, forearm: Vector3): HandTurn {
    const { face } = shape;
    const ahead = new Vector3(0, 1, 0);
    // The hand's own ways for what's held: its aim, and square to it the hand's way along the
    // fingers or the side that faces the viewer.
    const firstLocal = shape.aim.unit();
    const secondLocal = (face ?? ahead).across(firstLocal).unit();
    const first = aim.unit();
    const second = HandTurn.square(face === null ? forearm : Vector3.OUT, first);
    const thirdLocal = firstLocal.cross(secondLocal);
    const third = first.cross(second);
    const turn = (local: Vector3): Vector3 =>
      first
        .times(local.dot(firstLocal))
        .plus(second.times(local.dot(secondLocal)))
        .plus(third.times(local.dot(thirdLocal)));
    return new HandTurn(turn(new Vector3(1, 0, 0)), turn(ahead), turn(Vector3.OUT));
  }

  /** How a grip is made. */
  private static set(grip: Grip): GripSet {
    const { RADII, SLANT } = HandBones;
    const slant = HandBones.slanted(SLANT);
    // Against the palm; something thin, in the hollow of the closed fingers.
    const round = (radius: number, along: number, gap = 1): Thing => ({
      kind: "round",
      centre: new Vector3(0, along, -13 - Math.max(radius + gap, 12)),
      axis: slant,
      radius,
    });
    const closing: Bends = [-SLANT * 0.6, ...HandBones.MOST];
    // Down past the thing's side by the wrist, and round under it toward the fingers.
    const wrapThumb: ThumbSet = {
      root: new Vector3(0.3, -0.05, -0.95).unit(),
      curl: new Vector3(-0.1, 0.92, -0.38).unit(),
      bends: [70, 80],
    };
    switch (grip) {
      case "wrap":
        return {
          fingers: [closing, closing, closing, closing],
          thumb: wrapThumb,
          closes: round(RADII.bottle, 94),
          over: false,
        };
      case "cup":
        return {
          fingers: [closing, closing, closing, closing],
          thumb: wrapThumb,
          closes: round(RADII.snow, 94),
          over: false,
        };
      case "fist":
      case "pot":
        return {
          fingers: [closing, closing, closing, closing],
          thumb: {
            root: new Vector3(0.3, 0.55, -0.78).unit(),
            curl: new Vector3(-0.85, 0.2, -0.48).unit(),
            bends: [55, 70],
          },
          closes: round(grip === "pot" ? RADII.handle : RADII.spoon, 94, 0),
          over: true,
        };
      case "lighter":
        return {
          fingers: [closing, closing, closing, closing],
          thumb: {
            root: new Vector3(0.55, 0.45, -0.7).unit(),
            curl: new Vector3(-0.3, 0.6, -0.74).unit(),
            bends: [8, 14],
          },
          closes: round(RADII.lighter, 92, 0),
          over: false,
        };
      case "fret":
        return {
          fingers: [
            [6, 70, 75, 30],
            [1, 72, 80, 32],
            [-4, 74, 82, 34],
            [-9, 76, 84, 36],
          ],
          // Behind the neck, along it toward its head.
          thumb: {
            root: new Vector3(0.82, 0.52, -0.22).unit(),
            curl: new Vector3(-0.4, 0.1, -0.9).unit(),
            bends: [4, 10],
          },
          closes: null,
          over: false,
        };
      case "pinch":
      case "seal":
        return {
          fingers: [
            [3, 34, 46, 16],
            [-2, 46, 62, 30],
            [-6, 62, 80, 42],
            [-10, 70, 88, 46],
          ],
          thumb: {
            root: new Vector3(0.55, 0.5, -0.67).unit(),
            curl: new Vector3(-0.55, 0.45, -0.7).unit(),
            bends: [20, 25],
          },
          closes: null,
          over: false,
        };
      case "plate":
      case "top":
      case "bar":
        return {
          fingers: [
            [3, 28, 22, 10],
            [-1, 30, 24, 11],
            [-5, 33, 27, 12],
            [-9, 37, 30, 14],
          ],
          thumb: {
            root: new Vector3(0.38, 0.72, -0.58).unit(),
            curl: new Vector3(-0.3, 0.2, 0.93).unit(),
            bends: [6, 10],
          },
          closes: null,
          over: false,
        };
      default:
        return {
          fingers: [
            [6, 18, 22, 10],
            [1, 20, 25, 12],
            [-4, 22, 28, 14],
            [-9, 24, 30, 15],
          ],
          thumb: {
            root: new Vector3(0.55, 0.78, -0.3).unit(),
            curl: new Vector3(-0.35, 0.3, -0.88).unit(),
            bends: [10, 16],
          },
          closes: null,
          over: false,
        };
    }
  }

  /** The open hand spread out flat, the fingers apart, as on the mats or to a stove's warmth. */
  private static readonly SPREAD: GripSet = {
    fingers: [
      [12, 4, 6, 3],
      [2, 4, 6, 3],
      [-8, 5, 7, 4],
      [-17, 6, 8, 4],
    ],
    thumb: {
      root: new Vector3(0.82, 0.5, -0.25).unit(),
      curl: new Vector3(-0.35, 0.3, -0.88).unit(),
      bends: [4, 6],
    },
    closes: null,
    over: false,
  };

  private make(grip: Grip, shut: number, spread: number): HandShape {
    const open = HandBones.set("open");
    const relaxed: GripSet =
      spread > 0
        ? {
            ...open,
            fingers: open.fingers.map((bends, index) =>
              HandBones.mixBends(bends, HandBones.SPREAD.fingers[index] ?? bends, spread),
            ),
            thumb: HandBones.mixThumb(open.thumb, HandBones.SPREAD.thumb, spread),
          }
        : open;
    const closed = this.closedOf(grip);
    // An open hand is only ever relaxed or spread.
    const share = grip === "open" ? 0 : shut;
    const fingers = HandBones.FINGERS.map((finger, index) => {
      const from = relaxed.fingers[index] ?? [0, 0, 0, 0];
      return HandBones.finger(
        finger,
        HandBones.mixBends(from, closed.fingers[index] ?? from, share),
      );
    });
    const thumb = HandBones.thumb(HandBones.mixThumb(relaxed.thumb, closed.thumb, share));
    return { fingers, thumb, ...closed.held };
  }

  /** A grip closed on what it holds, made once: each finger's bends, as far as each joint goes
   * until the finger touches the thing; the thumb's; and where the thing is held. */
  private closedOf(grip: Grip): Closed {
    const known = this.closings.get(grip);
    if (known !== undefined) {
      return known;
    }
    const set = HandBones.set(grip);
    const none: Bends = [0, 0, 0, 0];
    const bends = HandBones.FINGERS.map((finger, index): Bends =>
      set.closes === null
        ? (set.fingers[index] ?? none)
        : HandBones.closeOn(finger, set.fingers[index] ?? none, set.closes),
    );
    const fingers = HandBones.FINGERS.map((finger, index) =>
      HandBones.finger(finger, bends[index] ?? none),
    );
    const thumb = HandBones.thumbFor(grip, set, fingers);
    const closed: Closed = {
      fingers: bends,
      thumb,
      held: HandBones.held(grip, fingers, HandBones.thumb(thumb), set),
    };
    this.closings.set(grip, closed);
    return closed;
  }

  /** How the thumb is set for a grip: closed round what's held, or over the fingers, until it
   * touches; its tip on the first finger's for a pinch; on a lighter's wheel. */
  private static thumbFor(grip: Grip, set: GripSet, fingers: readonly Digit[]): ThumbSet {
    const { closes } = set;
    if (grip === "pinch" || grip === "seal") {
      const first = fingers[0];
      const pad = first === undefined ? null : HandBones.pad(first, 0.55);
      return pad === null ? set.thumb : HandBones.thumbTo(set.thumb, pad);
    }
    if (grip === "lighter" && closes !== null && closes.kind === "round") {
      // On the lighter's top, by the thumb's side of the fist.
      const top = closes.centre
        .plus(closes.axis.times(30))
        .plus(new Vector3(0, -2, -closes.radius));
      return HandBones.thumbTo(set.thumb, top);
    }
    if (closes === null || closes.kind !== "round") {
      return set.thumb;
    }
    const around: Thing = set.over
      ? { ...closes, radius: closes.radius + 2 * (HandBones.FINGERS[1]?.radii[1] ?? 10) }
      : closes;
    return HandBones.thumbOn(set.thumb, around);
  }

  /** Where what a grip holds is held from, the way of it a pose aims, the side that faces the
   * viewer, and what it closes on. */
  private static held(
    grip: Grip,
    fingers: readonly Digit[],
    thumb: Digit,
    set: GripSet,
  ): Pick<HandShape, "hold" | "aim" | "face" | "thing"> {
    const { closes } = set;
    const along = new Vector3(0, 1, 0);
    if (closes !== null && closes.kind === "round") {
      // On the axis, across the middle of the hand.
      const centre = closes.centre.plus(closes.axis.times(-closes.centre.x / (closes.axis.x || 1)));
      const thing: Thing = { ...closes, centre };
      switch (grip) {
        case "fist":
          // The spoon's bowl out under the little finger.
          return { hold: centre, aim: closes.axis.times(-1), face: null, thing };
        case "pot": {
          // The pot hangs from the handle under the fist, its face to the viewer as the back of
          // the hand is.
          const up = along.across(closes.axis).unit().times(-1);
          return { hold: centre, aim: up, face: Vector3.OUT, thing };
        }
        case "cup":
          return { hold: centre, aim: along, face: null, thing };
        default:
          return { hold: centre, aim: closes.axis, face: null, thing };
      }
    }
    const first = fingers[0];
    const tip = thumb.joints.at(-1) ?? Vector3.ZERO;
    if (grip === "fret") {
      // Round the neck, the fingertips on its front: the neck's axis across the fingers' middle
      // bones, its face where the palm faces.
      const middle = fingers[1];
      const knuckle = middle?.joints[1] ?? Vector3.ZERO;
      const centre = knuckle.plus(new Vector3(0, -6, -HandBones.RADII.neck - 9));
      return {
        hold: centre,
        aim: HandBones.slanted(HandBones.SLANT),
        face: new Vector3(0, 0, -1),
        thing: {
          kind: "round",
          centre,
          axis: HandBones.slanted(HandBones.SLANT),
          radius: HandBones.RADII.neck,
        },
      };
    }
    if ((grip === "pinch" || grip === "seal") && first !== undefined) {
      const pad = HandBones.pad(first, 0.55);
      const pinched = pad.toward(tip, 0.5);
      // A pen's way: from the web between the thumb and the first finger, through the pinch.
      const web = new Vector3(36, 70, -10);
      const way = pinched.minus(web).unit();
      if (grip === "seal") {
        // A pouch's top between them, its face toward the thumb, the pouch below.
        const face = tip.minus(pad).unit();
        return {
          hold: pinched,
          aim: way.across(face).unit(),
          face,
          thing: { kind: "flat", centre: pinched, face, thick: 2 },
        };
      }
      return { hold: pinched, aim: way, face: null, thing: null };
    }
    if (grip === "plate" || grip === "top" || grip === "bar") {
      // Flat between the thumb's pad and the fingers' behind it. A pouch is held by its side,
      // the thumb behind it and the fingers over its face, their nails to the viewer, 57 mm in
      // from its middle and 27 mm above where the pose holds it; or by its top, so, hanging
      // under the fingers; a bar by its lower end, the thumb on its face.
      const middle = fingers[1];
      const behind = middle === undefined ? tip : HandBones.pad(middle, 0.5);
      const toThumb = tip.minus(behind).unit();
      const face = grip === "bar" ? toThumb : toThumb.times(-1);
      const plane = behind.toward(tip, 0.5);
      const fingersWay = (middle?.joints[2] ?? along).minus(middle?.joints[1] ?? Vector3.ZERO);
      if (grip === "top") {
        // The pouch's top 20 mm above the pinch, where the pose holds it 153 mm below its top.
        const down = fingersWay.across(face).unit();
        const hold = plane.plus(down.times(HandBones.TOP_HELD));
        const thing: Thing = { kind: "flat", centre: plane, face, thick: 4 };
        return { hold, aim: down.times(-1), face, thing };
      }
      const up = new Vector3(1, 0, 0).across(face).unit();
      const into = fingersWay.across(face).across(up).unit();
      if (grip === "bar") {
        // The bar stands out past the fingers' ends, along them, its middle 22 mm beyond.
        const hold = plane.plus(into.times(22));
        return { hold, aim: into, face, thing: { kind: "flat", centre: plane, face, thick: 4 } };
      }
      const hold = plane.plus(into.times(57)).minus(up.times(27));
      return { hold, aim: up, face, thing: { kind: "flat", centre: plane, face, thick: 4 } };
    }
    return { hold: HandBones.MIDDLE, aim: along, face: null, thing: null };
  }

  /** A finger bent so: its knuckle, then each joint along its bones, each bend toward the palm. */
  private static finger(bones: FingerBones, bends: Bends): Digit {
    const [splay, ...joints] = bends;
    const lean = ((bones.splay + splay) * Math.PI) / 180;
    const ahead = new Vector3(Math.sin(lean), Math.cos(lean), 0);
    const palm = new Vector3(0, 0, -1);
    const points: Vector3[] = [bones.knuckle];
    const backs: Vector3[] = [];
    let bent = 0;
    joints.forEach((bend, index) => {
      bent += (bend * Math.PI) / 180;
      const way = ahead.times(Math.cos(bent)).plus(palm.times(Math.sin(bent)));
      const from = points[index] ?? bones.knuckle;
      points.push(from.plus(way.times(bones.lengths[index] ?? 0)));
      // The back of a bone bent toward the palm faces up the finger's way as far as it's bent.
      backs.push(Vector3.OUT.times(Math.cos(bent)).plus(ahead.times(Math.sin(bent))));
    });
    return { joints: points, radii: bones.radii, backs };
  }

  /** The thumb set so: its base, then each joint, its first bone along `root` and each joint
   * after bending toward `curl`. */
  private static thumb(set: ThumbSet): Digit {
    const { base, lengths, radii } = HandBones.THUMB;
    const axis = set.root.cross(set.curl).unit();
    const points: Vector3[] = [base];
    const backs: Vector3[] = [];
    let way = set.root;
    lengths.forEach((length, index) => {
      if (index > 0) {
        way = way.turned(axis, set.bends[index - 1] ?? 0);
      }
      const from = points[index] ?? base;
      points.push(from.plus(way.times(length)));
      // Its nail's side is away from the way it bends.
      backs.push(way.cross(axis));
    });
    return { joints: points, radii, backs };
  }

  /** A finger's bends closed on `thing`: each joint in turn, from the knuckle, bent as far as it
   * goes until the finger touches the thing, and no further than `most`. */
  private static closeOn(bones: FingerBones, most: Bends, thing: Thing): Bends {
    const bends: [number, number, number, number] = [most[0], 0, 0, 0];
    for (const joint of [1, 2, 3] as const) {
      const limit = most[joint];
      let at = limit;
      for (let bend = 0; bend <= limit; bend += 1) {
        bends[joint] = bend;
        if (HandBones.touches(HandBones.finger(bones, bends), joint - 1, thing)) {
          at = bend;
          break;
        }
      }
      bends[joint] = at;
    }
    return bends;
  }

  /** The thumb set closed round `thing`: its two joints bent in turn until it touches. */
  private static thumbOn(set: ThumbSet, thing: Thing): ThumbSet {
    const bends: [number, number] = [0, 0];
    for (const joint of [0, 1] as const) {
      const limit = set.bends[joint] + 40;
      let at = limit;
      for (let bend = 0; bend <= limit; bend += 1) {
        bends[joint] = bend;
        if (HandBones.touches(HandBones.thumb({ ...set, bends }), joint + 1, thing)) {
          at = bend;
          break;
        }
      }
      bends[joint] = at;
    }
    return { ...set, bends };
  }

  /** The thumb set with its tip on `target`: its first bone as the grip has it, its two joints
   * bent to reach it as near as they do. */
  private static thumbTo(set: ThumbSet, target: Vector3): ThumbSet {
    let best = set;
    let nearest = Infinity;
    for (let first = -10; first <= 80; first += 2) {
      for (let second = -10; second <= 80; second += 2) {
        const tried = { ...set, bends: [first, second] as const };
        const tip = HandBones.thumb(tried).joints.at(-1) ?? Vector3.ZERO;
        const off = tip.minus(target).size;
        if (off < nearest) {
          nearest = off;
          best = tried;
        }
      }
    }
    // Turn the first bone a little toward the target, for what the joints left.
    const tip = HandBones.thumb(best).joints.at(-1) ?? Vector3.ZERO;
    const base = HandBones.THUMB.base;
    const correction = target.minus(base).unit().minus(tip.minus(base).unit());
    return correction.size < 1e-3
      ? best
      : { ...best, root: best.root.plus(correction).unit(), curl: best.curl };
  }

  /** Whether the end of bone `index` of a digit, the joint or the tip it bends, touches
   * `thing`. */
  private static touches(digit: Digit, index: number, thing: Thing): boolean {
    const end = digit.joints[index + 1];
    if (end === undefined) {
      return false;
    }
    const radius = digit.radii[index + 1] ?? 8;
    if (thing.kind === "round") {
      return end.minus(thing.centre).across(thing.axis).size <= thing.radius + radius;
    }
    return Math.abs(end.minus(thing.centre).dot(thing.face)) <= thing.thick / 2 + radius;
  }

  /** Where a digit's pad is: on the palm side of its last bone, `share` of the way to its tip. */
  private static pad(digit: Digit, share: number): Vector3 {
    const count = digit.joints.length;
    const from = digit.joints[count - 2] ?? Vector3.ZERO;
    const tip = digit.joints[count - 1] ?? Vector3.ZERO;
    const radius = digit.radii[count - 1] ?? 7;
    const way = tip.minus(from).unit();
    // The palm side of the bone: square to it, toward the palm.
    const palm = new Vector3(0, 0, -1).across(way).unit();
    return from.toward(tip, share).plus(palm.times(radius));
  }

  /** The way across the palm a wrapped thing's axis runs, its thumb end `slant` degrees further
   * along the fingers. */
  private static slanted(slant: number): Vector3 {
    const angle = (slant * Math.PI) / 180;
    return new Vector3(Math.cos(angle), Math.sin(angle), 0);
  }

  private static mixBends(from: Bends, to: Bends, share: number): Bends {
    const mix = (a: number, b: number): number => a + (b - a) * share;
    return [mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2]), mix(from[3], to[3])];
  }

  private static mixThumb(from: ThumbSet, to: ThumbSet, share: number): ThumbSet {
    return {
      root: from.root.toward(to.root, share).unit(),
      curl: from.curl.toward(to.curl, share).unit(),
      bends: [
        from.bends[0] + (to.bends[0] - from.bends[0]) * share,
        from.bends[1] + (to.bends[1] - from.bends[1]) * share,
      ],
    };
  }
}
