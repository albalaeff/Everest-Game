import { ClimberPose } from "./climber-pose";
import type { Joint } from "./climber-pose";
import { IceTools } from "./ice-tools";

/** A shape's outline: its corners in order round it, in metres. */
export type Outline = readonly Joint[];

/** An ice tool's shapes, in its own frame (`IceTools`): its shaft, the rubber of its grip, its
 * foot, a spike or a pommel, its steel head with the pick and the adze or hammer, a trigger rest
 * if it has one; where the hole through its head is, and the top edge of its pick, which catches
 * the light. */
export interface ToolOutlines {
  readonly shaft: Outline;
  readonly grip: Outline;
  readonly foot: Outline;
  readonly head: Outline;
  readonly rest: Outline | null;
  readonly hole: Joint;
  readonly edge: Outline;
}

/**
 * The shapes of a climber's figure (#168), after #125's scene, each in the frame of the part it's
 * on, in metres with y up and x the way the climber faces: a limb's along its bone from the joint
 * it hangs from, round at both ends and tapering; the boot on its sole, the ankle
 * `ClimberPose.ANKLE` above the origin and the toe ahead; the torso and the pack from the pelvis
 * up the spine, the chest ahead; the hood and the mask round the middle of the head. The curves
 * are cut into corners once, when the shapes are made, so a part and its rim are drawn from the
 * same outline, and a band of one, a suit's yoke or a boot's rand, is the outline cut along two
 * lines. The ice tools are each in their own frame, the grip at the origin, the shaft along +x and
 * the pick towards -y (`IceTools`): a mountaineer's ice axe, its shaft straight, a classic pick
 * with teeth under its end and an adze, and a technical tool, its shaft bent clear of the ice, a
 * banana pick, a hammer, a trigger rest over the grip and a pommel. The rigs share one set
 * (`FigureRig.SHAPES`).
 */
export class FigureShapes {
  /** Up a part, and ahead along it: the lines a band is cut along. */
  static readonly UP: Joint = { x: 0, y: 1 };
  static readonly AHEAD: Joint = { x: 1, y: 0 };
  /** How finely the curves are cut: corners a curve, and radians a corner round an end. */
  private static readonly CURVE_CORNERS = 6;
  private static readonly ARC_STEP = Math.PI / 8;

  /** The legs, the arms and the neck, each as long as its bone and as thick at each end as the
   * suit's down is there. */
  readonly thigh = FigureShapes.capsule(ClimberPose.THIGH, 0.108, 0.084);
  readonly shin = FigureShapes.capsule(ClimberPose.SHIN, 0.082, 0.068);
  readonly upperArm = FigureShapes.capsule(ClimberPose.UPPER_ARM, 0.074, 0.063);
  readonly forearm = FigureShapes.capsule(ClimberPose.FOREARM, 0.061, 0.05);
  readonly neck = FigureShapes.capsule(ClimberPose.NECK, 0.1, 0.09);
  /** The mitt on the forearm's end, and the cuff over the wrist. */
  readonly mitt = FigureShapes.ellipse({ x: ClimberPose.FOREARM + 0.012, y: -0.006 }, 0.072, 0.056);
  readonly cuff = FigureShapes.box(
    ClimberPose.FOREARM - 0.07,
    -0.058,
    ClimberPose.FOREARM - 0.02,
    0.058,
  );
  /** An eight-thousander's boot: its shell, the sole from the heel to the toe on y = 0, and round
   * the ankle at its top, where the gaiter turns in it as the ankle bends (#175). */
  readonly boot = FigureShapes.shell();
  /** The boot's gaiter, on the shin and turning with it: from its collar down round the ankle, its
   * end inside the shell however far the boot lets the ankle bend. */
  readonly gaiter: Outline = [
    ...FigureShapes.arc({ x: ClimberPose.SHIN - 0.015, y: 0 }, 0.09, Math.PI / 2, -Math.PI / 2),
    { x: ClimberPose.SHIN - 0.176, y: -0.08 },
    { x: ClimberPose.SHIN - 0.176, y: 0.08 },
  ];
  /** The crampon under it: its frame along the sole, its points, and the front points ahead. */
  readonly crampon: readonly Outline[] = [
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
  readonly torso = FigureShapes.path({ x: -0.13, y: -0.05 }, [
    [-0.15, 0.12, -0.14, 0.36, -0.125, 0.47],
    [-0.1, 0.54, 0.02, 0.56, 0.08, 0.52],
    [0.17, 0.47, 0.205, 0.36, 0.19, 0.24],
    [0.182, 0.12, 0.16, 0.02, 0.1, -0.05],
    [0.05, -0.1, -0.08, -0.1, -0.13, -0.05],
  ]);
  /** The pack on the back, and its lid. */
  readonly pack = FigureShapes.path({ x: -0.12, y: 0.08 }, [
    [-0.2, 0.06, -0.31, 0.07, -0.335, 0.13],
    [-0.37, 0.25, -0.385, 0.4, -0.36, 0.5],
    [-0.34, 0.575, -0.2, 0.585, -0.13, 0.55],
  ]);
  readonly lid = FigureShapes.path({ x: -0.13, y: 0.51 }, [
    [-0.2, 0.505, -0.33, 0.49, -0.365, 0.53],
    [-0.37, 0.585, -0.25, 0.615, -0.13, 0.585],
  ]);
  /** The suit's hood round the head, its brim over the goggles, and the oxygen mask. */
  readonly hood = FigureShapes.path({ x: 0.075, y: 0.115 }, [
    [0.02, 0.15, -0.1, 0.15, -0.135, 0.06],
    [-0.16, -0.02, -0.12, -0.12, -0.04, -0.14],
    [0.03, -0.15, 0.08, -0.14, 0.1, -0.11],
    [0.13, 0.05],
    [0.15, 0.085, 0.16, 0.09],
    [0.13, 0.115, 0.075, 0.115],
  ]);
  readonly mask = FigureShapes.path({ x: 0.064, y: -0.02 }, [
    [0.152, -0.016, 0.172, -0.058],
    [0.178, -0.104, 0.115, -0.122],
    [0.058, -0.13, 0.046, -0.075],
  ]);
  /** The ice axe: 0.62 m from its spike to its head, as a mountaineer's is for a climber of 1.77
   * m; its shaft straight and a little thicker at the foot, its grip's rubber over the hand, its
   * head 0.28 m across, the pick curving down to its point with teeth under it, the adze behind. */
  readonly axe = FigureShapes.tool(
    FigureShapes.strip(
      [
        { x: -0.045, y: 0 },
        { x: 0.508, y: 0 },
      ],
      0.0155,
      0.013,
    ),
    FigureShapes.rounded(-0.047, 0.12, 0.0175),
    [
      { x: -0.045, y: -0.0145 },
      { x: -0.045, y: 0.0145 },
      { x: -0.056, y: 0.0125 },
      { x: -0.082, y: 0.002 },
      { x: -0.082, y: -0.002 },
      { x: -0.056, y: -0.0125 },
    ],
    FigureShapes.head(IceTools.TIPS.axe, {
      top: 0.553,
      bottom: 0.494,
      pick: [0.552, -0.075, 0.538, -0.14],
      under: { x: 0.503, y: -0.118 },
      throat: [0.516, -0.085, 0.513, -0.045, 0.494, -0.03],
      back: [
        { x: 0.505, y: 0.062 },
        { x: 0.503, y: 0.103 },
        { x: 0.525, y: 0.106 },
        { x: 0.547, y: 0.062 },
      ],
    }),
    null,
    { x: 0.526, y: -0.003 },
  );
  /** The second tool, a technical one: 0.5 m, its shaft bent out from the ice above the grip so
   * the knuckles clear it, a banana pick drooping to its point, a hammer behind, a trigger rest
   * for the forefinger over the grip, and a pommel under the hand. */
  readonly iceTool = FigureShapes.tool(
    FigureShapes.strip(
      [
        { x: -0.052, y: 0 },
        { x: 0.11, y: 0 },
        { x: 0.17, y: 0.012 },
        { x: 0.23, y: 0.026 },
        { x: 0.29, y: 0.033 },
        { x: 0.35, y: 0.029 },
        { x: 0.405, y: 0.014 },
        { x: 0.44, y: 0.004 },
      ],
      0.0145,
      0.012,
    ),
    FigureShapes.rounded(-0.052, 0.105, 0.017),
    [
      { x: -0.05, y: -0.0165 },
      { x: -0.05, y: 0.0165 },
      { x: -0.062, y: 0.016 },
      { x: -0.078, y: 0.004 },
      { x: -0.084, y: -0.022 },
      { x: -0.075, y: -0.038 },
      { x: -0.066, y: -0.032 },
      { x: -0.063, y: -0.017 },
    ],
    FigureShapes.head(IceTools.TIPS.tool, {
      top: 0.472,
      bottom: 0.426,
      pick: [0.472, -0.065, 0.459, -0.132],
      under: { x: 0.438, y: -0.108 },
      throat: [0.449, -0.075, 0.446, -0.04, 0.426, -0.03],
      back: [
        { x: 0.43, y: 0.066 },
        { x: 0.469, y: 0.066 },
      ],
    }),
    [
      { x: 0.104, y: -0.016 },
      { x: 0.11, y: -0.036 },
      { x: 0.127, y: -0.042 },
      { x: 0.139, y: -0.032 },
      { x: 0.13, y: -0.013 },
    ],
    { x: 0.449, y: 0.002 },
  );

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
        kept.push({
          x: point.x + (next.x - point.x) * share,
          y: point.y + (next.y - point.y) * share,
        });
      }
    }
    return kept;
  }

  /** An ice tool's shapes, from its pieces; the top edge of its pick, from the head's top to the
   * pick's point, is the head's outline from its top corner on the pick's side to its point. */
  private static tool(
    shaft: Outline,
    grip: Outline,
    foot: Outline,
    head: { readonly outline: Outline; readonly edge: Outline },
    rest: Outline | null,
    hole: Joint,
  ): ToolOutlines {
    return { shaft, grip, foot, head: head.outline, rest, hole, edge: head.edge };
  }

  /** A tool's head: the pick's top edge from the head's top on the pick's side curving down
   * through its two control points to its point, `tip`; teeth along its underside back to
   * `under`, and its throat curving down from there to the head's bottom; across the shaft, and
   * round the adze or the hammer behind by the corners `back`, from its bottom to its top. */
  private static head(
    tip: Joint,
    shape: {
      readonly top: number;
      readonly bottom: number;
      readonly pick: readonly [number, number, number, number];
      readonly under: Joint;
      readonly throat: readonly [number, number, number, number, number, number];
      readonly back: readonly Joint[];
    },
  ): { readonly outline: Outline; readonly edge: Outline } {
    const { top, bottom, pick, under, throat, back } = shape;
    const edge = FigureShapes.path({ x: top, y: -0.022 }, [[...pick, tip.x, tip.y]]);
    const point = { x: tip.x - 0.007, y: tip.y + 0.004 };
    const teeth = FigureShapes.teeth(point, under, 5, 0.006);
    const underside = FigureShapes.path(under, [[...throat], [bottom - 0.002, -0.022]]);
    return {
      outline: [
        ...edge,
        ...teeth,
        ...underside.slice(1),
        { x: bottom - 0.004, y: 0 },
        { x: bottom, y: 0.024 },
        ...back,
        { x: top - 0.002, y: 0.024 },
        { x: top, y: 0 },
      ],
      edge,
    };
  }

  /** Teeth along the line from `from` to `to`, `count` of them, each `deep` towards -x of it,
   * pointing back up the line as a pick's teeth do, to bite as it's pulled down. */
  private static teeth(from: Joint, to: Joint, count: number, deep: number): Outline {
    const points: Joint[] = [from];
    for (let tooth = 0; tooth < count; tooth += 1) {
      const base = (tooth + 0.35) / count;
      const end = (tooth + 1) / count;
      const at = (share: number): Joint => ({
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      });
      const low = at(base);
      points.push({ x: low.x - deep, y: low.y }, at(end));
    }
    return points;
  }

  /** A strip along the polyline `centre`, as wide each side as `from` at its start and `to` at its
   * end: a shaft, bent where its line bends. */
  private static strip(centre: readonly Joint[], from: number, to: number): Outline {
    const lengths = centre.map((point, index) => {
      const before = centre[index - 1] ?? point;
      return Math.hypot(point.x - before.x, point.y - before.y);
    });
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
    const left: Joint[] = [];
    const right: Joint[] = [];
    let along = 0;
    for (const [index, point] of centre.entries()) {
      along += lengths[index] ?? 0;
      const before = centre[index - 1] ?? point;
      const after = centre[index + 1] ?? point;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const half = from + (to - from) * (along / total);
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      left.push({ x: point.x + nx, y: point.y + ny });
      right.push({ x: point.x - nx, y: point.y - ny });
    }
    return [...right, ...left.reverse()];
  }

  /** A grip's rubber along +x from `from` to `to`, `half` thick each side, its ends rounded. */
  private static rounded(from: number, to: number, half: number): Outline {
    const round = half * 0.6;
    return [
      ...FigureShapes.arc({ x: to - round, y: 0 }, half, -Math.PI / 2, Math.PI / 2).map(
        ({ x, y }) => ({ x: to - round + (x - (to - round)) * (round / half), y }),
      ),
      ...FigureShapes.arc({ x: from + round, y: 0 }, half, Math.PI / 2, (3 * Math.PI) / 2).map(
        ({ x, y }) => ({ x: from + round + (x - (from + round)) * (round / half), y }),
      ),
    ];
  }

  /** The boot's shell: from the heel along the sole, round the toe and up over the instep, round
   * the ankle a little wider than the gaiter's end, and down the heel. */
  private static shell(): Outline {
    const { HEEL, TOE, ANKLE } = ClimberPose;
    const front = FigureShapes.path({ x: HEEL, y: 0 }, [
      [TOE, 0],
      [0.248, 0.004, 0.243, 0.046],
      [0.236, 0.088, 0.172, 0.102],
    ]);
    const round = FigureShapes.arc({ x: 0, y: ANKLE }, 0.1, 0.55, 2.8);
    const top = round.at(-1) ?? { x: 0, y: 0 };
    const heel = FigureShapes.path(top, [[-0.122, 0.052, HEEL, 0]]);
    return [...front, ...round, ...heel.slice(1, -1)];
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
    if (
      outline.length > 1 &&
      last !== undefined &&
      Math.hypot(last.x - start.x, last.y - start.y) < 1e-9
    ) {
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
        return {
          x: before.x + (point.x - before.x) * share,
          y: before.y + (point.y - before.y) * share,
        };
      });
    }
    return points[0] ?? { x: 0, y: 0 };
  }
}
