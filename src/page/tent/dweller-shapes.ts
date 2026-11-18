import { ClimberPose } from "../../rendering/climber-pose";
import { FigureShapes } from "../../rendering/figure-shapes";
import type { Outline, Padded } from "../../rendering/figure-shapes";
import { FrontShapes } from "../../rendering/front-shapes";
import type { Quilted } from "../../rendering/front-shapes";
import type { Spot } from "./dweller-pose";

/** A part of the down suit in its own frame, in the tent's pixels: along +x from its root at the
 * origin, as long as its bone; its outline, the bands of down between its seams, and the seams. */
export interface SuitPart {
  readonly length: number;
  readonly outline: Outline;
  readonly baffles: readonly Outline[];
  readonly seams: readonly Outline[];
}

/** The body in the tent's pixels, from the hips, y down: the suit's quilted body, its dark yoke,
 * the zip up the middle to where it's undone, the base layer showing in the opening and round the
 * neck, the collar's two halves either side of it, and the hood lying down behind the neck. */
export interface DwellerBody {
  readonly outline: Outline;
  readonly baffles: readonly Outline[];
  readonly seams: readonly Outline[];
  readonly yoke: Outline;
  readonly zip: Outline;
  readonly opening: Outline;
  readonly baseLayer: Outline;
  readonly collar: readonly [Outline, Outline];
  readonly hood: Outline;
}

/** The legs' joints, from the hips, in the tent's pixels: each hip, knee, ankle and the toe of
 * the bootie, the leg on the viewer's left first. */
export interface LegJoints {
  readonly hips: readonly [Spot, Spot];
  readonly knees: readonly [Spot, Spot];
  readonly ankles: readonly [Spot, Spot];
  readonly toes: readonly [Spot, Spot];
}

/**
 * The person in the tent drawn as the climber on the slope is (#264): on the slope climber's bones
 * (`ClimberPose`) and in their suit seen from the front (`FrontShapes`), at the tent's 300 pixels
 * a metre, y down. The body is the front figure's own, from its crotch to its collar, the hips
 * where it sits; the arms and the legs are its quilted limbs, each in its own frame along +x,
 * as long as its bone and as thick as the suit's down (`FigureShapes.DOWN`), with the side
 * figure's seams. In the tent the suit's harness, pack and boots are off: its zip is undone to the
 * chest with the base layer showing, its hood lies down behind the neck, and down booties are on
 * the feet. Sitting, the legs are crossed in front, the knees out to the sides on the mats; on
 * hands and knees, they're under the body. The shapes are cut once; a pose only moves them.
 */
export class DwellerShapes {
  /** The tent's pixels a metre (`TentArt.SCALE`). */
  static readonly SCALE = 300;
  /** The front figure, standing: the body this one is drawn on. */
  private static readonly FRONT = new FrontShapes();
  private static readonly PELVIS = DwellerShapes.FRONT.standing.pelvis.y;
  /** Up the body from the hips, in pixels: where the arms hang from, the collar's top, and from
   * there to the head's middle, its eyes' height. */
  private static readonly SHOULDER =
    (DwellerShapes.FRONT.standing.arms[0].root.y - DwellerShapes.PELVIS) * DwellerShapes.SCALE;
  private static readonly SPINE =
    (DwellerShapes.FRONT.standing.shoulder.y - DwellerShapes.PELVIS) * DwellerShapes.SCALE;
  /** The shoulders, the arms' roots: each side of the middle as the front figure's, the one on
   * the viewer's left first. */
  static readonly SHOULDERS: readonly [Spot, Spot] = [
    { x: -FrontShapes.ARMS.shoulder * DwellerShapes.SCALE, y: -DwellerShapes.SHOULDER },
    { x: FrontShapes.ARMS.shoulder * DwellerShapes.SCALE, y: -DwellerShapes.SHOULDER },
  ];
  /** The neck's root, at the collar's top, and from there to the head's middle. */
  static readonly NECK: Spot = {
    x: 0,
    y: -(DwellerShapes.SPINE + FrontShapes.NECK * DwellerShapes.SCALE),
  };
  static readonly HEAD: Spot = {
    x: 0,
    y: -(ClimberPose.NECK - FrontShapes.NECK) * DwellerShapes.SCALE,
  };
  /** The bones: the upper arm, and the forearm to the wrist, where the sleeve's cuff ends; the
   * thigh and the shin. A hand's length is its own (`DwellerHands.WRIST`). */
  static readonly UPPER_ARM = ClimberPose.UPPER_ARM * DwellerShapes.SCALE;
  static readonly FOREARM = ClimberPose.FOREARM * DwellerShapes.SCALE;
  static readonly THIGH = ClimberPose.THIGH * DwellerShapes.SCALE;
  static readonly SHIN = ClimberPose.SHIN * DwellerShapes.SCALE;
  /** The suit's cuff round the wrist, the side figure's: from 7 cm short of it to 2 cm short. */
  static readonly CUFF = { from: 0.07 * DwellerShapes.SCALE, to: 0.02 * DwellerShapes.SCALE };
  /** A down bootie: as long as a foot in its down, and as thick each side of its middle. */
  static readonly BOOTIE = {
    length: 0.25 * DwellerShapes.SCALE,
    half: 0.055 * DwellerShapes.SCALE,
  };
  /** How far down the chest the zip is undone, from the collar's top. */
  private static readonly UNZIPPED = 0.15;
  /** The legs crossed, sitting: the hips, the knees out to the sides on the mats, each ankle
   * under the other knee, the shin of the leg on the viewer's right in front, and the booties'
   * toes. On hands and knees: the knees under the hips, the shins trailing behind. */
  private static readonly CROSSED: LegJoints = {
    hips: [
      { x: -FrontShapes.LEGS.hip * DwellerShapes.SCALE, y: 3 },
      { x: FrontShapes.LEGS.hip * DwellerShapes.SCALE, y: 3 },
    ],
    knees: [
      { x: -102, y: 2 },
      { x: 102, y: 2 },
    ],
    ankles: [
      { x: 16, y: 10 },
      { x: -16, y: 8 },
    ],
    toes: [
      { x: 84, y: 20 },
      { x: -84, y: 17 },
    ],
  };
  private static readonly KNELT: LegJoints = {
    hips: DwellerShapes.CROSSED.hips,
    knees: [
      { x: -8, y: 1 },
      { x: 8, y: 1 },
    ],
    ankles: [
      { x: 96, y: 5 },
      { x: 110, y: 5 },
    ],
    toes: [
      { x: 132, y: 1 },
      { x: 146, y: 1 },
    ],
  };

  readonly body: DwellerBody = DwellerShapes.dressed();
  readonly upperArm = DwellerShapes.part("upperArm", DwellerShapes.UPPER_ARM);
  readonly forearm = DwellerShapes.part("forearm", DwellerShapes.FOREARM);
  readonly thigh = DwellerShapes.part("thigh", DwellerShapes.THIGH);
  readonly shin = DwellerShapes.part("shin", DwellerShapes.SHIN);
  /** The sleeve's cuff at the forearm's end. */
  readonly cuff: Outline = FigureShapes.band(
    this.forearm.outline,
    FigureShapes.AHEAD,
    DwellerShapes.FOREARM - DwellerShapes.CUFF.from,
    DwellerShapes.FOREARM - DwellerShapes.CUFF.to,
  );
  /** The dark panel down the shin, as the slope's suit has, from `FigureShapes.SHIN_PANEL`
   * below the knee to the ankle. */
  readonly shinPanel: Outline = FigureShapes.band(
    this.shin.outline,
    FigureShapes.AHEAD,
    FigureShapes.SHIN_PANEL * DwellerShapes.SCALE,
    Infinity,
  );
  /** A down bootie along +x from the ankle, and its sole along one side: toward +y, or -y. */
  readonly bootie: SuitPart = DwellerShapes.booted();
  readonly soles: readonly [Outline, Outline] = [
    FigureShapes.band(
      this.bootie.outline,
      FigureShapes.UP,
      DwellerShapes.BOOTIE.half * 0.45,
      Infinity,
    ),
    FigureShapes.band(
      this.bootie.outline,
      { x: 0, y: -1 },
      DwellerShapes.BOOTIE.half * 0.45,
      Infinity,
    ),
  ];

  /** The legs' joints `under` of the way from crossed, sitting, to under the body on hands and
   * knees, the hips `rise` pixels off the seat: the knees, the shins and the booties stay on the
   * mats. */
  legs(under: number, rise = 0): LegJoints {
    const share = Math.min(1, Math.max(0, under));
    const mix = (from: readonly [Spot, Spot], to: readonly [Spot, Spot]): readonly [Spot, Spot] => [
      DwellerShapes.between(from[0], { x: to[0].x, y: to[0].y + rise }, share),
      DwellerShapes.between(from[1], { x: to[1].x, y: to[1].y + rise }, share),
    ];
    const { CROSSED, KNELT } = DwellerShapes;
    return {
      hips: [
        DwellerShapes.between(CROSSED.hips[0], KNELT.hips[0], share),
        DwellerShapes.between(CROSSED.hips[1], KNELT.hips[1], share),
      ],
      knees: mix(CROSSED.knees, KNELT.knees),
      ankles: mix(CROSSED.ankles, KNELT.ankles),
      toes: mix(CROSSED.toes, KNELT.toes),
    };
  }

  /** A quilted part of the suit, `length` long along +x, in pixels. */
  private static part(padded: Exclude<Padded, "neck">, length: number): SuitPart {
    const metres = length / DwellerShapes.SCALE;
    const seams =
      padded === "shin" ? [] : FigureShapes.SEAMS[padded === "upperArm" ? "upperArm" : padded];
    const quilted = FrontShapes.quilted(
      { x: 0, y: 0 },
      { x: metres, y: 0 },
      FigureShapes.DOWN[padded],
      seams,
    );
    return DwellerShapes.inPixels(quilted, length, { x: 0, y: 0 });
  }

  /** A down bootie: a rounded puff along +x from the ankle, quilted across in three. */
  private static booted(): SuitPart {
    const { length, half } = DwellerShapes.BOOTIE;
    const metres = length / DwellerShapes.SCALE;
    const quilted = FrontShapes.quilted(
      { x: 0, y: 0 },
      { x: metres, y: 0 },
      { root: (half / DwellerShapes.SCALE) * 1.08, end: half / DwellerShapes.SCALE },
      [0.4, 0.7],
    );
    return DwellerShapes.inPixels(quilted, length, { x: 0, y: 0 });
  }

  /** The front figure's body, in pixels from its hips, with the zip undone and the hood down. */
  private static dressed(): DwellerBody {
    const { FRONT, PELVIS, SCALE, SPINE, UNZIPPED } = DwellerShapes;
    const origin = { x: 0, y: PELVIS };
    const body = DwellerShapes.inPixels(FRONT.torso, 0, origin);
    const pixels = (outline: Outline): Outline => DwellerShapes.pixels(outline, origin);
    const collarTop = -(SPINE + FrontShapes.NECK * SCALE);
    const undone = collarTop + UNZIPPED * SCALE;
    const neck = FigureShapes.DOWN.neck.root * SCALE;
    // The opening's V from the collar's edges down to where the zip stops.
    const opening: Outline = [
      { x: -0.07 * SCALE, y: collarTop - 2 },
      { x: 0.07 * SCALE, y: collarTop - 2 },
      { x: 2, y: undone },
      { x: -2, y: undone },
    ];
    // The base layer's own collar round the neck, up under the jaw.
    const baseLayer = FigureShapes.path({ x: -0.052 * SCALE, y: collarTop + 8 }, [
      [-0.06 * SCALE, collarTop - 4, -0.054 * SCALE, collarTop - 14],
      [-0.02 * SCALE, collarTop - 18, 0.02 * SCALE, collarTop - 18, 0.054 * SCALE, collarTop - 14],
      [0.06 * SCALE, collarTop - 4, 0.052 * SCALE, collarTop + 8],
    ]);
    // Each half of the collar, standing round the neck and laid open at the front.
    const half = (side: -1 | 1): Outline => {
      const points = FigureShapes.path({ x: side * 4, y: undone - 2 }, [
        [side * 0.03 * SCALE, collarTop + 14, side * 0.068 * SCALE, collarTop],
        [side * 0.075 * SCALE, collarTop - 7, side * 0.088 * SCALE, collarTop - 18],
        [side * 0.12 * SCALE, collarTop - 12, side * neck, collarTop + 8],
        [side * 0.07 * SCALE, collarTop + 22, side * 0.02 * SCALE, undone + 6],
      ]);
      return side === 1 ? points : [...points].reverse();
    };
    // The hood lying down: a roll of down behind the neck, above the shoulders.
    const shoulders = -SPINE;
    // Narrow enough that it stays behind the neck, over the yoke, as the sleeves tuck behind
    // the shoulders.
    const hood = FigureShapes.path({ x: -0.12 * SCALE, y: shoulders - 4 }, [
      [
        -0.13 * SCALE,
        shoulders - 18,
        -0.105 * SCALE,
        shoulders - 27,
        -0.055 * SCALE,
        shoulders - 29,
      ],
      [0, shoulders - 30, 0.055 * SCALE, shoulders - 29],
      [0.105 * SCALE, shoulders - 27, 0.13 * SCALE, shoulders - 18, 0.12 * SCALE, shoulders - 4],
    ]);
    return {
      outline: body.outline,
      baffles: body.baffles,
      seams: body.seams,
      yoke: pixels(FRONT.yoke),
      zip: [
        { x: 0, y: (FrontShapes.CROTCH - 0.02) * SCALE },
        { x: 0, y: undone },
      ],
      opening,
      baseLayer,
      collar: [half(-1), half(1)],
      hood,
    };
  }

  /** A quilted part in pixels, from `origin` in metres: its outline, the bands of down between
   * its seams and the seams, cut along its way. */
  private static inPixels(quilted: Quilted, length: number, origin: Spot): SuitPart {
    const { outline, along, seams } = quilted;
    const ends = [-Infinity, ...seams, Infinity];
    const baffles = ends
      .slice(1)
      .map((end, index) => FigureShapes.band(outline, along, ends[index] ?? -Infinity, end));
    const half = FigureShapes.SEAM_WIDTH / 2;
    const seamBands = seams.map((seam) =>
      FigureShapes.band(outline, along, seam - half, seam + half),
    );
    const pixels = (part: Outline): Outline => DwellerShapes.pixels(part, origin);
    return {
      length,
      outline: pixels(outline),
      baffles: baffles.map(pixels),
      seams: seamBands.map(pixels),
    };
  }

  /** An outline in metres, y up, as the tent's pixels from `origin`, y down. */
  private static pixels(outline: Outline, origin: Spot): Outline {
    const { SCALE } = DwellerShapes;
    return outline.map(({ x, y }) => ({ x: (x - origin.x) * SCALE, y: -(y - origin.y) * SCALE }));
  }

  private static between(from: Spot, to: Spot, share: number): Spot {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }
}
