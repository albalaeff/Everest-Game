import { DwellerHead } from "./dweller-head";
import type { DwellerJoints, Spot } from "./dweller-pose";
import { DwellerShapes } from "./dweller-shapes";

/** A cubic curve: where it starts, its two handles, and where it ends. */
export interface Curve {
  readonly from: Spot;
  readonly out: Spot;
  readonly in: Spot;
  readonly to: Spot;
}

/** The neck as a pose has it, in the body's frame: each side, from where it leaves the head down
 * to where it goes into the base layer's collar; the muscle down its near side; and the jaw's
 * shadow and the stubble under it, each from where it's darkest or grows to where it's gone,
 * straight down the head. */
export interface NeckShape {
  readonly far: Curve;
  readonly near: Curve;
  readonly muscle: Curve;
  readonly shade: readonly [Spot, Spot];
  readonly growth: readonly [Spot, Spot];
}

/** The neck this frame, as SVG's text: its outline, the muscle's ridge and the shade beside it,
 * and the two shadings' ends, `x1`, `y1`, `x2` and `y2`. */
export interface NeckFrame {
  readonly outline: string;
  readonly muscle: string;
  readonly muscleShade: string;
  readonly shade: readonly [string, string, string, string];
  readonly growth: readonly [string, string, string, string];
}

/**
 * The neck of the person in the tent (#277), drawn each frame between the base layer's collar and
 * the head. Its root turns with the body, in the body's frame; its top with the head, in the
 * head's own millimetres, under the skull behind the jaw, where the head covers it. So wherever the
 * head turns, tilts and sways on it, the neck comes out from under the jaw and the ear, never from
 * beside them, and its sides curve from the body's way up to the head's, as the top of a spine
 * bends. A man's neck, about 12 cm across (ANSUR II), in the face's skin: in the jaw's shadow under
 * it, with a few days' stubble a little way down from the jaw, and the muscle from behind the ear
 * down toward the collarbones lit along its ridge.
 */
export class DwellerNeck {
  /** Where the sides leave the head, in its millimetres (`DwellerHead`): the far side's under the
   * jaw, the near side's under the ear, well inside the head's outline. */
  static readonly TOP = { far: { x: -44, y: 70 }, near: { x: 62, y: 40 } } as const;
  /** Where the sides go into the base layer's collar, in the body's pixels: each side of the
   * middle, and how far under the suit's collar's top. */
  static readonly ROOT = { half: 17.5, down: 2 } as const;
  /** The muscle down the near side: from behind the ear, in the head's millimetres, to the notch
   * between the collarbones, in the body's pixels, under the base layer's collar. */
  static readonly MUSCLE = { ear: { x: 56, y: 50 }, notch: { x: 1, y: -2 } } as const;
  /** How far each side's handles reach, as a share of the way from its top to its root. */
  private static readonly HANDLE = 0.4;
  /** The jaw's shadow, in the head's millimetres: darkest at the jaw's underside, under the chin,
   * and gone this far from it down and away from the lamp, up and to the right, so the neck's near
   * side, under the ear, is lit; the stubble, grown under the jaw and the chin, and gone below it
   * and toward the ear, as a beard's line runs. */
  private static readonly SHADE = { from: { x: -6, y: 100 }, to: { x: 18, y: 136 } } as const;
  private static readonly GROWTH = { from: { x: -10, y: 108 }, to: { x: 28, y: 128 } } as const;
  /** How far in front of the muscle's ridge its shade is, in the body's pixels. */
  private static readonly RIDGE: Spot = { x: -2.6, y: 0.6 };

  /** The neck's parts, behind the base layer's collar: the skin, the jaw's shadow, the stubble and
   * the muscle, each set to the pose by the frame. */
  markup(): string {
    return `<path class="dw-neck" data-part="neck"/>
<path class="dw-neck-under" data-part="neck-under"/>
<path class="dw-neck-stubble" data-part="neck-stubble" mask="url(#dw-neck-grown)"/>
<g clip-path="url(#dw-neck-clip)"><path class="dw-neck-muscle-shade" data-part="neck-muscle-shade"/><path class="dw-neck-muscle" data-part="neck-muscle"/></g>`;
  }

  /** The neck's shadings: across it, lit on the near side; the jaw's shadow and the stubble's
   * growth, set along the head each frame; the stubble's hairs, as the face's; and the clip that
   * keeps the muscle on the neck. */
  defs(): string {
    const everywhere = `x="-2000" y="-2000" width="4000" height="4000"`;
    return `<linearGradient id="dw-neck-side" x1="0" y1="0.5" x2="1" y2="0.5"><stop offset="0" style="stop-color:var(--skin-deep)"/><stop offset="0.3" style="stop-color:var(--skin-shade)"/><stop offset="0.75" style="stop-color:var(--skin)"/><stop offset="1" style="stop-color:var(--skin)"/></linearGradient>
<linearGradient id="dw-neck-shade" data-part="neck-shade" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1a0c06" stop-opacity="0.6"/><stop offset="0.35" stop-color="#1a0c06" stop-opacity="0.24"/><stop offset="1" stop-color="#1a0c06" stop-opacity="0"/></linearGradient>
<linearGradient id="dw-neck-growth" data-part="neck-growth" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="dw-neck-grown" maskUnits="userSpaceOnUse" ${everywhere}><rect ${everywhere} fill="url(#dw-neck-growth)"/></mask>
<pattern id="dw-neck-hairs" width="${(9 * DwellerHead.SCALE).toFixed(2)}" height="${(9 * DwellerHead.SCALE).toFixed(2)}" patternUnits="userSpaceOnUse"><g transform="scale(${DwellerHead.SCALE})">${DwellerHead.hairs()}</g></pattern>
<clipPath id="dw-neck-clip" clipPathUnits="userSpaceOnUse"><path data-part="neck-clip"/></clipPath>`;
  }

  /** The neck as `joints` has it, in the body's frame. */
  shape(joints: DwellerJoints): NeckShape {
    const { TOP, ROOT, MUSCLE, HANDLE, SHADE, GROWTH } = DwellerNeck;
    const collar = DwellerShapes.NECK.y;
    // The head's frame in the body's: its middle, and how far it's turned against the body.
    const middle = DwellerNeck.turned(joints.head, -joints.torso);
    const turn = joints.headAngle - joints.torso;
    const fromHead = (spot: Spot): Spot => {
      const local = DwellerNeck.turned(
        { x: spot.x * DwellerHead.SCALE, y: spot.y * DwellerHead.SCALE },
        turn,
      );
      return { x: middle.x + local.x, y: middle.y + local.y };
    };
    const down = DwellerNeck.turned({ x: 0, y: 1 }, turn);
    // A side from the head down: its top leaves it along the head's way down, its root goes into
    // the collar along the body's.
    const side = (top: Spot, root: Spot, leaving: Spot = down, arriving: Spot = { x: 0, y: 1 }) => {
      const reach = Math.hypot(root.x - top.x, root.y - top.y) * HANDLE;
      return {
        from: top,
        out: { x: top.x + leaving.x * reach, y: top.y + leaving.y * reach },
        in: { x: root.x - arriving.x * reach, y: root.y - arriving.y * reach },
        to: root,
      };
    };
    const forward = DwellerNeck.turned(DwellerNeck.unit({ x: -0.6, y: 0.8 }), turn);
    return {
      far: side(fromHead(TOP.far), { x: -ROOT.half, y: collar + ROOT.down }),
      near: side(fromHead(TOP.near), { x: ROOT.half, y: collar + ROOT.down }),
      muscle: side(
        fromHead(MUSCLE.ear),
        { x: MUSCLE.notch.x, y: collar + MUSCLE.notch.y },
        forward,
        DwellerNeck.unit({ x: -0.2, y: 1 }),
      ),
      shade: [fromHead(SHADE.from), fromHead(SHADE.to)],
      growth: [fromHead(GROWTH.from), fromHead(GROWTH.to)],
    };
  }

  /** The neck as `joints` has it, as the drawing writes it. */
  frame(joints: DwellerJoints): NeckFrame {
    const { far, near, muscle, shade, growth } = this.shape(joints);
    const t = (value: number): string => DwellerNeck.text(value);
    const at = ({ x, y }: Spot): string => `${t(x)} ${t(y)}`;
    const curve = ({ out, in: into, to }: Curve): string => `C${at(out)} ${at(into)} ${at(to)}`;
    const back = ({ from, out, in: into, to }: Curve): Curve => ({
      from: to,
      out: into,
      in: out,
      to: from,
    });
    const ends = ([from, to]: readonly [Spot, Spot]): readonly [string, string, string, string] => [
      t(from.x),
      t(from.y),
      t(to.x),
      t(to.y),
    ];
    const { RIDGE } = DwellerNeck;
    const moved = (spot: Spot): Spot => ({ x: spot.x + RIDGE.x, y: spot.y + RIDGE.y });
    const ridge = {
      from: moved(muscle.from),
      out: moved(muscle.out),
      in: moved(muscle.in),
      to: moved(muscle.to),
    };
    return {
      // Down the far side, across under the collar, up the near side, and across inside the head.
      outline: `M${at(far.from)}${curve(far)}L${at(near.to)}${curve(back(near))}Z`,
      muscle: `M${at(muscle.from)}${curve(muscle)}`,
      muscleShade: `M${at(ridge.from)}${curve(ridge)}`,
      shade: ends(shade),
      growth: ends(growth),
    };
  }

  /** `spot` turned by `degrees`, clockwise on the screen. */
  private static turned(spot: Spot, degrees: number): Spot {
    const angle = (degrees * Math.PI) / 180;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    return { x: spot.x * cos - spot.y * sin, y: spot.x * sin + spot.y * cos };
  }

  private static unit({ x, y }: Spot): Spot {
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  /** A number as the drawing writes it: to a tenth of a pixel, and never `-0`. */
  private static text(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded === 0 ? 0 : rounded);
  }
}
