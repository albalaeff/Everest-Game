import { ClimberPose } from "./climber-pose";
import type { Joint, Pose, PoseState } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";

/** A part of the down suit seen from the front: its outline, the way along it from its root, a
 * length of 1, and how far that way each seam between its baffles is, from the figure's origin. */
export interface Quilted {
  readonly outline: Outline;
  readonly along: Joint;
  readonly seams: readonly number[];
}

/** An arm seen from the front, hanging at the side: the upper arm and the forearm in their down,
 * the cuff over the wrist, and the mitt, its gauntlet over the cuff and its thumb ahead; and where
 * it shades the body it hangs against. */
export interface FrontArm {
  /** The band of the body the arm shades, along its inner side from the shoulder to the elbow. */
  readonly shade: Outline;
  readonly upper: Quilted;
  readonly forearm: Quilted;
  readonly cuff: Outline;
  readonly gauntlet: Outline;
  readonly mitt: Outline;
  readonly thumb: Outline;
}

/** A boot seen from the front, on its crampon: the shell, the rubber rand round its sole and the
 * cap over its toe, the crampon's bail over the toe, a line, and its frame and points under the
 * sole, the front points among them, seen end on. */
export interface FrontBoot {
  readonly shell: Outline;
  /** Where the light catches the top of the toe box, coming towards the viewer. */
  readonly instep: Outline;
  readonly rand: Outline;
  readonly toe: Outline;
  readonly bail: Outline;
  readonly crampon: readonly Outline[];
}

/** A leg seen from the front: the thigh in its down, the harness's leg loop round its top, the
 * shin with its dark panel, the gaiter with its collar and its zip, a line, and the boot. */
export interface FrontLeg {
  readonly thigh: Quilted;
  /** The crease where the knee comes towards the viewer: the top of the shin's round, a line. */
  readonly knee: Outline;
  readonly loop: Outline;
  readonly shin: Quilted;
  readonly panel: Outline;
  readonly gaiter: Outline;
  readonly collar: Outline;
  readonly zip: Outline;
  readonly boot: FrontBoot;
}

/** The pack seen from the front, behind the body, in its own frame from the pelvis as the side
 * figure's is (`FigureShapes.pack`), to be scaled from there: its body and its lid, and the oxygen's
 * bottle standing in it, its top over the lid with the regulator on it, a box and its dial. */
export interface FrontPack {
  readonly body: Outline;
  readonly lid: Outline;
  readonly bottle: Outline;
  readonly regulator: Outline;
  readonly dial: Outline;
}

/** The harness from the front: its belt round the waist with the buckle and the slot through it,
 * the belay loop under it and each gear loop at a hip, lines, with a carabiner hanging on each. */
export interface FrontHarness {
  readonly belt: Outline;
  readonly buckle: Outline;
  readonly slot: Outline;
  readonly belay: Outline;
  readonly gearLoops: readonly [Outline, Outline];
  readonly carabiners: readonly [Outline, Outline];
}

/** The pack's straps over the chest: each shoulder strap's pad and the webbing from its end round
 * under the arm, the left first; the chest strap across them, and its buckle. */
export interface FrontStraps {
  readonly pads: readonly [Outline, Outline];
  readonly webbing: readonly [Outline, Outline];
  readonly chest: Outline;
  readonly buckle: Outline;
}

/** The head from the front: the hood and the seams of its middle panel, the puffed rim of it round
 * the face and the opening, dark
 * under the brim; the face in it, its nose and its mouth, a line; the goggles' frame and their
 * lens, the strap from each side round the hood, and the glints on the lens; the headlamp's case on
 * the brim and its strap from each side. */
export interface FrontHead {
  readonly hood: Outline;
  /** The seams each side of the hood's middle panel, lines from the brim over the crown. */
  readonly panels: readonly [Outline, Outline];
  readonly rim: Outline;
  readonly opening: Outline;
  readonly face: Outline;
  readonly nose: Outline;
  readonly mouth: Outline;
  readonly goggles: Outline;
  readonly lens: Outline;
  readonly goggleStraps: readonly [Outline, Outline];
  readonly glints: readonly Outline[];
  readonly lampCase: Outline;
  readonly lampStraps: readonly [Outline, Outline];
}

/** The oxygen mask from the front: on the face, over the nose and the mouth, its valve in front;
 * or off it, hanging on the chest from its strap, round the back of the neck, its valve below. */
export interface FrontMask {
  readonly on: Outline;
  readonly valve: Joint;
  readonly hanging: Outline;
  readonly hangingValve: Joint;
  readonly straps: readonly [Outline, Outline];
}

/**
 * A climber in their kit seen from the front (#235), standing, in the figure's metres from the
 * ground between the boots, y up and x to the viewer's right. It stands on the side figure's own
 * bones (`ClimberPose`, as it stands still on the flat): the knees, the pelvis, the harness, the
 * shoulders, the elbows, the hands and the head are as high as the side figure has them, and each
 * limb is as thick as its down (`FigureShapes.DOWN`), with the seams of the side's baffles, so the
 * one turns into the other with nothing growing or shrinking. How far apart the limbs are, how wide
 * the body, the hood and the boots are, are this view's own. The down bulges a little between its
 * seams, so the suit reads as quilted. The left and right are mirror images: the light, not the
 * shapes, tells them apart (`FrontRig`). The curves are cut into corners once, when the shapes are
 * made, as `FigureShapes` cuts the side's.
 */
export class FrontShapes {
  /** How far the down bulges out between two seams, in metres. */
  static readonly PUFF = 0.007;
  /** How far apart, each side of the middle, the hips, knees and ankles are; the shoulders, elbows
   * and hands; and where a hanging mitt's middle is from the hand, in metres. The person in a
   * tent sits on the same hips and shoulders (#264). */
  static readonly LEGS = { hip: 0.098, knee: 0.113, ankle: 0.136 };
  static readonly ARMS = { shoulder: 0.222, elbow: 0.262, hand: 0.284 };
  /** Where the hose leaves the regulator, in the pack's frame from the pelvis: under it. */
  private static readonly REGULATOR: Joint = { x: -0.15, y: 0.638 };
  /** How far in from an arm's inner side the body is in its shade. */
  private static readonly ARM_SHADE = 0.04;
  /** The body's half widths, at heights from the pelvis: over the hips, at the waist, the chest
   * and under the arms, up to the yoke. */
  private static readonly WAIST: readonly (readonly [up: number, half: number])[] = [
    [-0.025, 0.207],
    [0.04, 0.2],
    [0.11, 0.193],
    [0.24, 0.2],
    [0.34, 0.205],
    [FigureShapes.YOKE, 0.203],
  ];
  /** How far below the pelvis the crotch is, and above the shoulders the collar ends. */
  static readonly CROTCH = 0.085;
  static readonly NECK = 0.052;
  /** How many corners each side of a quilted limb is cut into. */
  private static readonly QUILT_CORNERS = 28;
  /** The climber standing still on the flat, fresh: how the side figure stands. */
  private static readonly STILL: PoseState = {
    travelled: 0,
    moving: false,
    falling: false,
    dead: false,
    tiredness: "fresh",
    pace: "steady",
    ground: () => 0,
    terrain: () => 0,
    jumar: null,
    carabiner: null,
    sliding: false,
    ladder: null,
    footing: 1,
    hauling: false,
  };

  /** The side figure's bones, standing: what this one is drawn on. */
  readonly standing: Pose = new ClimberPose().advance(0, FrontShapes.STILL);
  /** Where the headlamp shines from, and where the breath comes out of the mask's valve. */
  readonly lamp: Joint;
  readonly mouth: Joint;
  /** Where the cowstails tie in, at the foot of the belay loop. */
  readonly tie: Joint;
  readonly pack: FrontPack;
  readonly legs: readonly [FrontLeg, FrontLeg];
  readonly torso: Quilted;
  readonly yoke: Outline;
  /** The main zip, a line up the middle from the crotch to the chin. */
  readonly zip: Outline;
  readonly harness: FrontHarness;
  readonly straps: FrontStraps;
  /** The suit's collar round the neck, under the hood. */
  readonly collar: Outline;
  readonly arms: readonly [FrontArm, FrontArm];
  readonly head: FrontHead;
  readonly mask: FrontMask;

  constructor() {
    const { standing } = this;
    const [near, far] = standing.legs;
    const pelvis = standing.pelvis.y;
    const knee = (near.middle.y + far.middle.y) / 2;
    const ankle = near.end.y;
    const shoulder = standing.shoulder.y;
    const head = standing.head.y;
    this.lamp = { x: 0, y: head + 0.11 };
    this.mouth = { x: 0, y: head - 0.078 };
    this.tie = { x: 0, y: pelvis - 0.035 };
    this.pack = FrontShapes.backpack();
    this.legs = FrontShapes.pair((side) => FrontShapes.leg(side, pelvis, knee, ankle));
    this.torso = FrontShapes.body(pelvis, shoulder);
    this.yoke = FigureShapes.band(
      this.torso.outline,
      FigureShapes.UP,
      pelvis + FigureShapes.YOKE,
      Infinity,
    );
    this.zip = [
      { x: 0, y: pelvis - FrontShapes.CROTCH + 0.02 },
      { x: 0, y: head - 0.15 },
    ];
    this.harness = FrontShapes.belted(this.torso.outline, pelvis);
    this.straps = FrontShapes.harnessed(pelvis, shoulder);
    this.collar = FrontShapes.neck(shoulder);
    const [root, elbow, hand] = [
      standing.arms[0].root,
      standing.arms[0].middle,
      standing.arms[0].end,
    ];
    this.arms = FrontShapes.pair((side) => FrontShapes.arm(side, root.y, elbow.y, hand.y));
    this.head = FrontShapes.hooded(head);
    this.mask = FrontShapes.masked(head, pelvis, shoulder);
  }

  /** The oxygen's hose, a line from the regulator on the bottle in a pack `pack` times a client's,
   * over the left shoulder and down the chest: up again to the mask's valve while it's on the face
   * (`masked`), or to its valve where it hangs on the chest. */
  hose(pack: number, masked: boolean): Outline {
    const pelvis = this.standing.pelvis.y;
    const shoulder = this.standing.shoulder.y;
    const [x, y] = [FrontShapes.REGULATOR.x * pack, pelvis + FrontShapes.REGULATOR.y * pack];
    // Down beside the collar and over the shoulder strap.
    const over: readonly number[] = [x - 0.01, y - 0.05, -0.168, shoulder + 0.07, -0.158, shoulder];
    const valve = masked ? this.mask.valve : this.mask.hangingValve;
    const down: readonly number[] = masked
      ? [-0.15, shoulder - 0.07, -0.055, shoulder - 0.12, -0.014, shoulder - 0.06]
      : [-0.152, shoulder - 0.05, -0.06, valve.y - 0.03, -0.014, valve.y - 0.006];
    const segments: (readonly number[])[] = [over, down];
    if (masked) {
      // Up the middle of the chest to the valve under the mask.
      segments.push([0, shoulder + 0.01, 0, valve.y - 0.08, valve.x, valve.y - 0.02]);
    }
    return FigureShapes.path({ x, y }, segments);
  }

  /** The left and the right of a part, mirror images: the left first. */
  private static pair<Part>(make: (side: -1 | 1) => Part): readonly [Part, Part] {
    return [make(-1), make(1)];
  }

  /** An outline with each corner's x times `side`, mirrored to the left for -1, and its corners
   * kept in order round it. */
  private static sided(outline: Outline, side: -1 | 1): Outline {
    const mirrored = outline.map(({ x, y }) => ({ x: x * side, y }));
    return side === 1 ? mirrored : mirrored.reverse();
  }

  /** The right half of a shape that's its own mirror image, from the middle at its bottom round to
   * the middle at its top, closed with its left half. */
  private static whole(right: Outline): Outline {
    const left = right
      .slice(1, -1)
      .map(({ x, y }) => ({ x: -x, y }))
      .reverse();
    return [...right, ...left];
  }

  /** The pack behind the body, its lid, and the bottle with the regulator on it over the left
   * shoulder, where the hose comes from: as tall as the side figure's, from the pelvis. */
  private static backpack(): FrontPack {
    return {
      body: FrontShapes.roundBox(-0.175, 0.071, 0.175, 0.555, 0.05),
      lid: FrontShapes.roundBox(-0.168, 0.5, 0.168, 0.596, 0.04),
      bottle: FrontShapes.roundBox(-0.182, 0.47, -0.118, 0.652, 0.03),
      regulator: FrontShapes.roundBox(-0.168, 0.638, -0.132, 0.676, 0.008),
      dial: FigureShapes.ellipse({ x: -0.15, y: 0.668 }, 0.015, 0.015),
    };
  }

  /** A leg on `side`: the thigh from the hip to the knee, the shin to the ankle, and the boot. */
  private static leg(side: -1 | 1, pelvis: number, knee: number, ankle: number): FrontLeg {
    const { LEGS } = FrontShapes;
    const { DOWN, SEAMS, GAITER, SHIN_PANEL } = FigureShapes;
    const hip = { x: side * LEGS.hip, y: pelvis };
    const bent = { x: side * LEGS.knee, y: knee };
    const foot = { x: side * LEGS.ankle, y: ankle };
    const thigh = FrontShapes.quilted(hip, bent, DOWN.thigh, SEAMS.thigh);
    const shin = FrontShapes.quilted(bent, foot, DOWN.shin, []);
    // The shin seen from the front is as long as the knee is high over the ankle: a share of the
    // way down it is that share of the bone.
    const share = (metres: number): number => metres / ClimberPose.SHIN;
    const down = (part: number): Joint => ({
      x: bent.x + (foot.x - bent.x) * part,
      y: bent.y + (foot.y - bent.y) * part,
    });
    const from = (point: Joint): number => point.x * shin.along.x + point.y * shin.along.y;
    const panel = FigureShapes.band(
      shin.outline,
      shin.along,
      from(down(share(SHIN_PANEL))),
      Infinity,
    );
    const top = down(share(ClimberPose.SHIN - GAITER.up));
    const deep = GAITER.collar * ((knee - ankle) / ClimberPose.SHIN);
    const gaiter: Outline = [
      { x: top.x + GAITER.half, y: top.y },
      { x: top.x - GAITER.half, y: top.y },
      ...FigureShapes.arc(foot, GAITER.ankle, Math.PI, 2 * Math.PI),
    ];
    const boot = FrontShapes.boot(foot.x + side * 0.004);
    const kneeAngle = Math.atan2(shin.along.y, shin.along.x);
    return {
      thigh,
      knee: FigureShapes.arc(
        bent,
        FigureShapes.DOWN.shin.root,
        kneeAngle + Math.PI * 0.62,
        kneeAngle + Math.PI * 1.38,
      ),
      loop: FrontShapes.sided(FrontShapes.legLoop(pelvis), side),
      shin,
      panel,
      gaiter,
      collar: FigureShapes.band(gaiter, FigureShapes.UP, top.y - deep, Infinity),
      zip: [
        { x: top.x - side * 0.012, y: top.y - deep },
        { x: foot.x - side * 0.014, y: 0.15 },
      ],
      boot,
    };
  }

  /** The harness's leg loop round the right thigh, from the belay loop down round its front and up
   * its outside to the belt. */
  private static legLoop(pelvis: number): Outline {
    const centre = FigureShapes.path({ x: 0.014, y: pelvis - 0.07 }, [
      [0.05, pelvis - 0.1, 0.14, pelvis - 0.104, 0.206, pelvis - 0.058],
    ]);
    return FigureShapes.strip(centre, 0.017, 0.014);
  }

  /** An eight-thousander's boot from the front, its middle at `x`: the shell, round at the ankle,
   * on its sole; the rand round the sole and the cap over the toe, which comes towards the viewer;
   * the crampon's bail over the toe cap, its frame under the sole, and its points, the outer ones
   * and the two front points between them, seen end on. */
  private static boot(x: number): FrontBoot {
    const shell = FigureShapes.path({ x: x - 0.074, y: 0 }, [
      [x + 0.074, 0],
      [x + 0.08, 0.012, x + 0.085, 0.05, x + 0.087, 0.09],
      [x + 0.089, 0.13, x + 0.088, 0.165, x + 0.07, 0.182],
      [x + 0.03, 0.196, x - 0.03, 0.196, x - 0.07, 0.182],
      [x - 0.088, 0.165, x - 0.089, 0.13, x - 0.087, 0.09],
      [x - 0.085, 0.05, x - 0.08, 0.012, x - 0.074, 0],
    ]);
    const point = (at: number, deep: number, wide: number): Outline => [
      { x: at - wide, y: -0.005 },
      { x: at, y: -deep },
      { x: at + wide, y: -0.005 },
    ];
    return {
      shell,
      instep: FigureShapes.ellipse({ x: x + 0.012, y: 0.092 }, 0.045, 0.026),
      rand: FigureShapes.band(shell, FigureShapes.UP, -Infinity, 0.03),
      toe: FigureShapes.path({ x: x - 0.068, y: 0 }, [
        [x - 0.068, 0.028],
        [x - 0.05, 0.072, x + 0.05, 0.072, x + 0.068, 0.028],
        [x + 0.068, 0],
      ]),
      bail: FigureShapes.path({ x: x - 0.064, y: 0.024 }, [
        [x - 0.042, 0.058, x + 0.042, 0.058, x + 0.064, 0.024],
      ]),
      crampon: [
        FigureShapes.box(x - 0.071, -0.009, x + 0.071, 0),
        point(x - 0.057, 0.033, 0.011),
        point(x + 0.057, 0.033, 0.011),
        point(x - 0.021, 0.026, 0.009),
        point(x + 0.021, 0.026, 0.009),
      ],
    };
  }

  /** The suit's body from the crotch to the shoulders, as wide as `WAIST` has it, quilted between
   * the side's seams, up to the yoke. */
  private static body(pelvis: number, shoulder: number): Quilted {
    const { WAIST, CROTCH, NECK, PUFF } = FrontShapes;
    const seams = FigureShapes.SEAMS.torso.map((up) => pelvis + up);
    const [first] = WAIST;
    const last = WAIST[WAIST.length - 1];
    const low = pelvis + (first?.[0] ?? 0);
    const yoke = pelvis + FigureShapes.YOKE;
    const hips = first?.[1] ?? 0;
    const bottom = FigureShapes.path({ x: 0, y: pelvis - CROTCH }, [
      [0.07, pelvis - CROTCH + 0.003, 0.17, pelvis - CROTCH + 0.018, hips, low],
    ]);
    const knots = [low, ...seams, yoke];
    const side: Joint[] = [];
    const corners = FrontShapes.QUILT_CORNERS;
    for (let corner = 1; corner <= corners; corner += 1) {
      const y = low + ((yoke - low) * corner) / corners;
      side.push({
        x: FrontShapes.between(WAIST, y - pelvis) + PUFF * FrontShapes.bulge(knots, y),
        y,
      });
    }
    const neck = shoulder + NECK;
    const broad = last?.[1] ?? 0;
    const top = FigureShapes.path({ x: broad, y: yoke }, [
      [broad + 0.004, yoke + 0.06, 0.17, neck - 0.012, FigureShapes.DOWN.neck.root, neck],
      [0, neck + 0.002],
    ]);
    return {
      outline: FrontShapes.whole([...bottom, ...side, ...top.slice(1)]),
      along: FigureShapes.UP,
      seams,
    };
  }

  /** The harness on the body, `outline`, from the pelvis: the belt round it as high as the side
   * figure's, its buckle, the belay loop under it, and a gear loop with its carabiner at each
   * hip. */
  private static belted(outline: Outline, pelvis: number): FrontHarness {
    const { from, to } = FigureShapes.BELT;
    const [low, high] = [pelvis + from, pelvis + to];
    const gearLoop = (side: -1 | 1): Outline =>
      FrontShapes.sided(
        FigureShapes.path({ x: 0.146, y: low + 0.002 }, [
          [0.148, low - 0.03, 0.188, low - 0.03, 0.19, low + 0.002],
        ]),
        side,
      );
    return {
      belt: FigureShapes.band(outline, FigureShapes.UP, low, high),
      buckle: FrontShapes.roundBox(-0.021, low - 0.004, 0.021, high + 0.004, 0.006),
      slot: FigureShapes.box(-0.012, low + 0.012, 0.012, high - 0.012),
      belay: FigureShapes.path({ x: -0.021, y: low + 0.002 }, [
        [-0.024, low - 0.03],
        [-0.024, low - 0.052, 0.024, low - 0.052, 0.024, low - 0.03],
        [0.021, low + 0.002],
      ]),
      gearLoops: [gearLoop(-1), gearLoop(1)],
      carabiners: FrontShapes.pair((side) =>
        FigureShapes.ellipse({ x: side * 0.168, y: low - 0.05 }, 0.011, 0.024),
      ),
    };
  }

  /** The pack's straps: each shoulder strap's pad from behind the collar, over the shoulder and
   * down the chest, the webbing on from its end round under the arm, and the chest strap across
   * them, as high as the side figure's, with its buckle. */
  private static harnessed(pelvis: number, shoulder: number): FrontStraps {
    const pad = FigureShapes.strip(
      FigureShapes.path({ x: 0.112, y: shoulder + 0.056 }, [
        [0.15, shoulder + 0.047, 0.168, shoulder - 0.01, 0.17, shoulder - 0.08],
        [0.172, shoulder - 0.15, 0.172, shoulder - 0.22, 0.172, shoulder - 0.275],
      ]),
      0.027,
      0.023,
    );
    const webbing = FigureShapes.strip(
      FigureShapes.path({ x: 0.172, y: shoulder - 0.27 }, [
        [0.176, shoulder - 0.32, 0.196, shoulder - 0.355, 0.222, shoulder - 0.365],
      ]),
      0.01,
      0.01,
    );
    const chest = pelvis + 0.33;
    return {
      pads: FrontShapes.pair((side) => FrontShapes.sided(pad, side)),
      webbing: FrontShapes.pair((side) => FrontShapes.sided(webbing, side)),
      chest: FigureShapes.box(-0.17, chest - 0.011, 0.17, chest + 0.011),
      buckle: FrontShapes.roundBox(-0.026, chest - 0.018, 0.026, chest + 0.018, 0.007),
    };
  }

  /** The suit's collar round the neck, as wide as the side figure's neck is deep, up under the
   * hood's chin. */
  private static neck(shoulder: number): Outline {
    const { root } = FigureShapes.DOWN.neck;
    const neck = shoulder + FrontShapes.NECK - 0.012;
    return FrontShapes.whole(
      FigureShapes.path({ x: 0, y: neck }, [
        [root + 0.006, neck],
        [root + 0.014, neck + 0.05, root + 0.018, neck + 0.08, root, neck + 0.1],
        [0, neck + 0.1],
      ]),
    );
  }

  /** An arm on `side`, hanging from the shoulder a little out from the body, as high at the elbow
   * and the hand as the side figure's: the upper arm, the forearm, its cuff, and the mitt. */
  private static arm(side: -1 | 1, shoulder: number, elbow: number, hand: number): FrontArm {
    const { ARMS } = FrontShapes;
    const { DOWN, SEAMS } = FigureShapes;
    const root = { x: side * ARMS.shoulder, y: shoulder };
    const bend = { x: side * ARMS.elbow, y: elbow };
    const wrist = { x: side * ARMS.hand, y: hand };
    const upper = FrontShapes.quilted(root, bend, DOWN.upperArm, SEAMS.upperArm);
    const forearm = FrontShapes.quilted(bend, wrist, DOWN.forearm, SEAMS.forearm);
    const base = bend.x * forearm.along.x + bend.y * forearm.along.y;
    const length = Math.hypot(wrist.x - bend.x, wrist.y - bend.y);
    const at = (share: number): number => base + share * length;
    // The side figure's cuff, from 7 cm short of the wrist to 2 cm short of it.
    const cuff = FigureShapes.band(
      forearm.outline,
      forearm.along,
      at(1 - 0.07 / ClimberPose.FOREARM),
      at(1 - 0.02 / ClimberPose.FOREARM),
    );
    const middle = { x: wrist.x + side * 0.004, y: wrist.y - 0.012 };
    // Along the arm's inner side, from the shoulder to the elbow, where it lies against the body.
    const inner = (point: Joint, radius: number, by: number): Joint => ({
      x: point.x - side * (radius + by),
      y: point.y,
    });
    const shade = [
      inner(root, DOWN.upperArm.root, 0),
      inner(bend, DOWN.forearm.root, 0),
      inner(bend, DOWN.forearm.root, FrontShapes.ARM_SHADE),
      inner(root, DOWN.upperArm.root, FrontShapes.ARM_SHADE),
    ];
    return {
      shade,
      upper,
      forearm,
      cuff,
      gauntlet: FrontShapes.sided(
        [
          { x: ARMS.hand - 0.066, y: hand + 0.02 },
          { x: ARMS.hand + 0.068, y: hand + 0.02 },
          { x: ARMS.hand + 0.058, y: hand + 0.064 },
          { x: ARMS.hand - 0.058, y: hand + 0.064 },
        ],
        side,
      ),
      mitt: FigureShapes.ellipse(middle, 0.054, 0.074),
      thumb: FigureShapes.ellipse({ x: middle.x - side * 0.03, y: middle.y + 0.006 }, 0.021, 0.036),
    };
  }

  /** The head from the front, round its middle `head`: as tall as the side figure's hood and as
   * wide as it's deep, the face in its opening, the goggles over the eyes and the lamp on the
   * brim, as high as the side's. */
  private static hooded(head: number): FrontHead {
    const at = (x: number, y: number): Joint => ({ x, y: head + y });
    const hood = FrontShapes.whole(
      FigureShapes.path(at(0, -0.158), [
        [0.045, head - 0.158, 0.09, head - 0.152, 0.115, head - 0.13],
        [0.14, head - 0.098, 0.153, head - 0.035, 0.15, head + 0.03],
        [0.146, head + 0.098, 0.088, head + 0.142, 0, head + 0.142],
      ]),
    );
    const goggles = FrontShapes.whole(
      FigureShapes.path(at(0, 0.01), [
        [0.01, head + 0.01, 0.012, head - 0.008, 0.03, head - 0.008],
        [0.084, head - 0.008],
        [0.106, head - 0.008, 0.106, head + 0.012],
        [0.106, head + 0.036],
        [0.106, head + 0.058, 0.084, head + 0.058],
        [0, head + 0.058],
      ]),
    );
    const lens = FrontShapes.whole(
      FigureShapes.path(at(0, 0.017), [
        [0.009, head + 0.017, 0.011, head, 0.026, head],
        [0.082, head],
        [0.098, head, 0.098, head + 0.014],
        [0.098, head + 0.034],
        [0.098, head + 0.05, 0.082, head + 0.05],
        [0, head + 0.05],
      ]),
    );
    const goggleStrap: Outline = [
      at(0.103, 0.012),
      at(0.151, 0.004),
      at(0.152, 0.03),
      at(0.103, 0.038),
    ];
    const lampStrap: Outline = [
      ...FigureShapes.path(at(0.03, 0.121), [
        [0.09, head + 0.116, 0.13, head + 0.1, 0.147, head + 0.08],
      ]),
      ...FigureShapes.path(at(0.142, 0.056), [
        [0.126, head + 0.078, 0.085, head + 0.096, 0.03, head + 0.099],
      ]),
    ];
    const panel = FigureShapes.path(at(0.05, 0.1), [[0.056, head + 0.125, 0.046, head + 0.138]]);
    return {
      hood,
      panels: FrontShapes.pair((side) => FrontShapes.sided(panel, side)),
      rim: FigureShapes.ellipse(at(0, -0.016), 0.106, 0.126),
      opening: FigureShapes.ellipse(at(0, -0.024), 0.083, 0.102),
      face: FigureShapes.ellipse(at(0, -0.058), 0.062, 0.064),
      nose: FigureShapes.path(at(0, -0.004), [
        [0.009, head - 0.033],
        [0.013, head - 0.042, 0.004, head - 0.046],
        [-0.004, head - 0.046],
        [-0.013, head - 0.042, -0.009, head - 0.033],
      ]),
      mouth: FigureShapes.path(at(-0.022, -0.08), [[0, head - 0.086, 0.022, head - 0.08]]),
      goggles,
      lens,
      goggleStraps: FrontShapes.pair((side) => FrontShapes.sided(goggleStrap, side)),
      glints: [
        [at(0.028, 0.046), at(0.06, 0.046), at(0.044, 0.018), at(0.018, 0.018)],
        [at(0.068, 0.046), at(0.079, 0.046), at(0.07, 0.03), at(0.061, 0.03)],
      ],
      lampCase: FrontShapes.roundBox(-0.034, head + 0.088, 0.034, head + 0.132, 0.011),
      lampStraps: FrontShapes.pair((side) => FrontShapes.sided(lampStrap, side)),
    };
  }

  /** The oxygen mask: on the face from under the goggles to the chin, its valve as high as the side
   * figure's; or hanging on the chest under the collar, as low as the side's hangs, from the strap
   * round the back of the neck. */
  private static masked(head: number, pelvis: number, shoulder: number): FrontMask {
    const hung = pelvis + 0.452;
    const on = FrontShapes.whole(
      FigureShapes.path({ x: 0, y: head - 0.132 }, [
        [0.022, head - 0.132, 0.048, head - 0.125, 0.063, head - 0.106],
        [0.075, head - 0.085, 0.072, head - 0.05, 0.056, head - 0.03],
        [0.042, head - 0.014, 0.022, head - 0.004, 0, head - 0.004],
      ]),
    );
    const hanging = FrontShapes.whole(
      FigureShapes.path({ x: 0, y: hung - 0.038 }, [
        [0.045, hung - 0.034, 0.064, hung - 0.012, 0.062, hung + 0.012],
        [0.058, hung + 0.032, 0.03, hung + 0.038, 0, hung + 0.036],
      ]),
    );
    const strap = FigureShapes.strip(
      [
        { x: 0.05, y: hung + 0.028 },
        { x: 0.075, y: shoulder + 0.02 },
        { x: 0.09, y: shoulder + 0.06 },
      ],
      0.005,
      0.005,
    );
    return {
      on,
      valve: { x: 0, y: head - 0.078 },
      hanging,
      hangingValve: { x: 0, y: hung - 0.012 },
      straps: FrontShapes.pair((side) => FrontShapes.sided(strap, side)),
    };
  }

  /** A limb seen from the front from `root` to `end`, as thick as its `down` round each, bulging
   * `PUFF` between the seams at `seams`, shares of the way along it. Its sides come round its ends,
   * so it reads as a sleeve of down rather than a stick. */
  static quilted(
    root: Joint,
    end: Joint,
    down: { readonly root: number; readonly end: number },
    seams: readonly number[],
  ): Quilted {
    const dx = end.x - root.x;
    const dy = end.y - root.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = { x: dx / length, y: dy / length };
    const knots = [0, ...seams, 1];
    const corners = FrontShapes.QUILT_CORNERS;
    const edge = (side: -1 | 1): Joint[] =>
      Array.from({ length: corners + 1 }, (_, corner) => {
        const share = corner / corners;
        const offset =
          down.root +
          (down.end - down.root) * share +
          FrontShapes.PUFF * FrontShapes.bulge(knots, share);
        return {
          x: root.x + dx * share - along.y * offset * side,
          y: root.y + dy * share + along.x * offset * side,
        };
      });
    const angle = Math.atan2(along.y, along.x);
    const right = edge(-1);
    const left = edge(1).reverse();
    const endCap = FigureShapes.arc(end, down.end, angle - Math.PI / 2, angle + Math.PI / 2);
    const rootCap = FigureShapes.arc(
      root,
      down.root,
      angle + Math.PI / 2,
      angle + (3 * Math.PI) / 2,
    );
    const base = root.x * along.x + root.y * along.y;
    return {
      outline: [...right, ...endCap.slice(1, -1), ...left, ...rootCap.slice(1, -1)],
      along,
      seams: seams.map((share) => base + share * length),
    };
  }

  /** How far the down bulges at `at` along a part, from nothing at each of `knots`, its seams and
   * its ends, to all of it halfway between two. */
  private static bulge(knots: readonly number[], at: number): number {
    for (let index = 1; index < knots.length; index += 1) {
      const from = knots[index - 1] ?? 0;
      const to = knots[index] ?? 0;
      if (at <= to && to > from) {
        return Math.sin((Math.PI * Math.max(at - from, 0)) / (to - from));
      }
    }
    return 0;
  }

  /** A half width at `up`, smoothly between the two of `widths` it's between. */
  private static between(widths: readonly (readonly [number, number])[], up: number): number {
    for (let index = 1; index < widths.length; index += 1) {
      const [from, low] = widths[index - 1] ?? [0, 0];
      const [to, high] = widths[index] ?? [0, 0];
      if (up <= to) {
        const share = Math.min(Math.max((up - from) / (to - from || 1), 0), 1);
        return low + ((high - low) * (1 - Math.cos(Math.PI * share))) / 2;
      }
    }
    return widths[widths.length - 1]?.[1] ?? 0;
  }

  /** A box with its corners rounded by `radius`. */
  private static roundBox(
    left: number,
    bottom: number,
    right: number,
    top: number,
    radius: number,
  ): Outline {
    const quarter = Math.PI / 2;
    const corner = (x: number, y: number, from: number): Outline =>
      FigureShapes.arc({ x, y }, radius, from * quarter, (from + 1) * quarter);
    return [
      ...corner(right - radius, bottom + radius, -1),
      ...corner(right - radius, top - radius, 0),
      ...corner(left + radius, top - radius, 1),
      ...corner(left + radius, bottom + radius, 2),
    ];
  }
}
