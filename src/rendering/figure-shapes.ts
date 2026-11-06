import { ClimberPose } from "./climber-pose";
import type { Joint } from "./climber-pose";

/** A shape's outline: its corners in order round it, in metres. */
export type Outline = readonly Joint[];

/**
 * The shapes of a climber's figure (#168), after #125's scene, each in the frame of the part it's
 * on, in metres with y up and x the way the climber faces: a limb's along its bone from the joint
 * it hangs from, round at both ends and tapering; the boot on its sole, the ankle
 * `ClimberPose.ANKLE` above the origin and the toe ahead; the torso and the pack from the pelvis
 * up the spine, the chest ahead; the hood and the mask round the middle of the head. The curves
 * are cut into corners once, so a part and its rim are drawn from the same outline, and a band of
 * one, a suit's yoke or a boot's rand, is the outline cut along two lines.
 */
export class FigureShapes {
  /** How finely the curves are cut: corners a curve, and radians a corner round an end. */
  private static readonly CURVE_CORNERS = 6;
  private static readonly ARC_STEP = Math.PI / 8;

  /** The legs, the arms and the neck, each as long as its bone and as thick at each end as the
   * suit's down is there. */
  static readonly THIGH = FigureShapes.capsule(ClimberPose.THIGH, 0.108, 0.084);
  static readonly SHIN = FigureShapes.capsule(ClimberPose.SHIN, 0.082, 0.068);
  static readonly UPPER_ARM = FigureShapes.capsule(ClimberPose.UPPER_ARM, 0.074, 0.063);
  static readonly FOREARM = FigureShapes.capsule(ClimberPose.FOREARM, 0.061, 0.05);
  static readonly NECK = FigureShapes.capsule(ClimberPose.NECK, 0.1, 0.09);
  /** The mitt on the forearm's end, and the cuff over the wrist. */
  static readonly MITT = FigureShapes.ellipse({ x: ClimberPose.FOREARM + 0.012, y: -0.006 }, 0.072, 0.056);
  static readonly CUFF = FigureShapes.box(ClimberPose.FOREARM - 0.07, -0.058, ClimberPose.FOREARM - 0.02, 0.058);
  /** An eight-thousander's boot with its gaiter, the sole from the heel to the toe on y = 0. */
  static readonly BOOT = FigureShapes.path({ x: -0.105, y: 0 }, [
    [0.2, 0],
    [0.248, 0.004, 0.243, 0.046],
    [0.236, 0.088, 0.172, 0.102],
    [0.085, 0.132],
    [0.072, 0.256],
    [-0.086, 0.256],
    [-0.098, 0.12],
    [-0.122, 0.052, -0.105, 0],
  ]);
  /** The crampon under it: its frame along the sole, its points, and the front points ahead. */
  static readonly CRAMPON: readonly Outline[] = [
    FigureShapes.box(-0.09, -0.009, 0.2, 0),
    ...[-0.082, -0.046, 0.004, 0.054, 0.104, 0.15].map((x) => [
      { x: x - 0.011, y: -0.005 },
      { x, y: -0.033 },
      { x: x + 0.011, y: -0.005 },
    ]),
    [
      { x: 0.186, y: 0.004 },
      { x: 0.266, y: -0.024 },
      { x: 0.2, y: -0.012 },
    ],
  ];
  /** The down suit's body, the pelvis at the origin and the shoulders where the spine ends. */
  static readonly TORSO = FigureShapes.path({ x: -0.13, y: -0.05 }, [
    [-0.15, 0.12, -0.14, 0.36, -0.125, 0.47],
    [-0.1, 0.54, 0.02, 0.56, 0.08, 0.52],
    [0.17, 0.47, 0.205, 0.36, 0.19, 0.24],
    [0.182, 0.12, 0.16, 0.02, 0.1, -0.05],
    [0.05, -0.1, -0.08, -0.1, -0.13, -0.05],
  ]);
  /** The pack on the back, and its lid. */
  static readonly PACK = FigureShapes.path({ x: -0.12, y: 0.08 }, [
    [-0.2, 0.06, -0.31, 0.07, -0.335, 0.13],
    [-0.37, 0.25, -0.385, 0.4, -0.36, 0.5],
    [-0.34, 0.575, -0.2, 0.585, -0.13, 0.55],
  ]);
  static readonly LID = FigureShapes.path({ x: -0.13, y: 0.51 }, [
    [-0.2, 0.505, -0.33, 0.49, -0.365, 0.53],
    [-0.37, 0.585, -0.25, 0.615, -0.13, 0.585],
  ]);
  /** The suit's hood round the head, its brim over the goggles, and the oxygen mask. */
  static readonly HOOD = FigureShapes.path({ x: 0.075, y: 0.115 }, [
    [0.02, 0.15, -0.1, 0.15, -0.135, 0.06],
    [-0.16, -0.02, -0.12, -0.12, -0.04, -0.14],
    [0.03, -0.15, 0.08, -0.14, 0.1, -0.11],
    [0.13, 0.05],
    [0.15, 0.085, 0.16, 0.09],
    [0.13, 0.115, 0.075, 0.115],
  ]);
  static readonly MASK = FigureShapes.path({ x: 0.064, y: -0.02 }, [
    [0.152, -0.016, 0.172, -0.058],
    [0.178, -0.104, 0.115, -0.122],
    [0.058, -0.13, 0.046, -0.075],
  ]);
  /** Up a part, and ahead along it: the lines a band is cut along. */
  static readonly UP: Joint = { x: 0, y: 1 };
  static readonly AHEAD: Joint = { x: 1, y: 0 };

  /** The band of an outline between two lines across `normal`, `from` and `to` along it from the
   * origin: a suit's yoke, a baffle's seam, a boot's rand. Either may be infinite. */
  static band(outline: Outline, normal: Joint, from: number, to: number): Outline {
    const beyond = FigureShapes.cut(outline, normal, from);
    return FigureShapes.cut(beyond, { x: -normal.x, y: -normal.y }, -to);
  }

  /** The part of an outline on the side of a line that `normal` points to, `offset` along it from
   * the origin. */
  private static cut(outline: Outline, normal: Joint, offset: number): Outline {
    const kept: Joint[] = [];
    const side = (point: Joint): number => point.x * normal.x + point.y * normal.y - offset;
    for (const [index, point] of outline.entries()) {
      const next = outline[(index + 1) % outline.length] ?? point;
      const here = side(point);
      const there = side(next);
      const inside = here >= 0;
      if (inside) {
        kept.push(point);
      }
      if (inside !== there >= 0) {
        const share = here / (here - there);
        kept.push({ x: point.x + (next.x - point.x) * share, y: point.y + (next.y - point.y) * share });
      }
    }
    return kept;
  }

  /** A limb `length` long along +x, as thick as `from` round its root and `to` round its end, the
   * sides straight between. */
  private static capsule(length: number, from: number, to: number): Outline {
    const tilt = Math.asin(Math.min(Math.max((from - to) / length, -1), 1));
    return [
      ...FigureShapes.arc({ x: length, y: 0 }, to, -Math.PI / 2 + tilt, Math.PI / 2 - tilt),
      ...FigureShapes.arc({ x: 0, y: 0 }, from, Math.PI / 2 - tilt, (3 * Math.PI) / 2 + tilt),
    ];
  }

  private static arc(centre: Joint, radius: number, from: number, to: number): Outline {
    const corners = Math.max(2, Math.ceil(Math.abs(to - from) / FigureShapes.ARC_STEP));
    return Array.from({ length: corners + 1 }, (_, corner) => {
      const angle = from + ((to - from) * corner) / corners;
      return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
    });
  }

  private static ellipse(centre: Joint, across: number, up: number): Outline {
    const corners = Math.ceil((2 * Math.PI) / FigureShapes.ARC_STEP);
    return Array.from({ length: corners }, (_, corner) => {
      const angle = (2 * Math.PI * corner) / corners;
      return { x: centre.x + across * Math.cos(angle), y: centre.y + up * Math.sin(angle) };
    });
  }

  private static box(left: number, bottom: number, right: number, top: number): Outline {
    return [
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: top },
    ];
  }

  /** An outline from `start` along lines and curves, each its numbers: a corner, `[x, y]`, or a
   * curve through one control point or two to its end, `[cx, cy, x, y]` or
   * `[c1x, c1y, c2x, c2y, x, y]`. One that ends where it began isn't given that corner twice. */
  private static path(start: Joint, segments: readonly (readonly number[])[]): Outline {
    const outline: Joint[] = [start];
    for (const segment of segments) {
      const controls: Joint[] = [outline.at(-1) ?? start];
      for (let index = 0; index + 1 < segment.length; index += 2) {
        controls.push({ x: segment[index] ?? 0, y: segment[index + 1] ?? 0 });
      }
      const corners = controls.length > 2 ? FigureShapes.CURVE_CORNERS : 1;
      for (let corner = 1; corner <= corners; corner += 1) {
        outline.push(FigureShapes.bezier(controls, corner / corners));
      }
    }
    const last = outline.at(-1);
    if (outline.length > 1 && last !== undefined && Math.hypot(last.x - start.x, last.y - start.y) < 1e-9) {
      outline.pop();
    }
    return outline;
  }

  /** The point `share` of the way along a curve through its control points. */
  private static bezier(controls: readonly Joint[], share: number): Joint {
    let points = controls;
    while (points.length > 1) {
      const previous = points;
      points = previous.slice(1).map((point, index) => {
        const before = previous[index] ?? point;
        return { x: before.x + (point.x - before.x) * share, y: before.y + (point.y - before.y) * share };
      });
    }
    return points[0] ?? { x: 0, y: 0 };
  }
}
