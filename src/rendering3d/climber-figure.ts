import { Group, Mesh, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material } from "three";

import { Palette } from "../rendering/palette";
import { ClimberGait } from "./climber-gait";
import type { Reach, Stance } from "./climber-gait";
import { Solid } from "./solid";
import { SunShadows } from "./sun-shadows";

/** What tells one climber from another: the suit's colour, the pack's and the helmet's. */
export interface Outfit {
  readonly suit: number;
  readonly legs: number;
  readonly pack: number;
  readonly helmet: number;
  readonly boots: number;
}

/**
 * A climber in 3D: a body 1.78 m tall in a down suit, harness, helmet, pack and crampons, built
 * in code from quilted limbs and simple solids, and posed each frame from a `Stance`, the hips,
 * the ankles and the wrists; the knees and the elbows are worked out from those, as a body's
 * are. The same figure is another climber seen across the ice and the player's own body: seen
 * from its own eyes it has no head, and looking down shows the suit, the harness and the boots.
 */
export class ClimberFigure {
  static readonly PLAYER: Outfit = {
    suit: Palette.PLAYER_SUIT,
    legs: Palette.PLAYER_SUIT,
    pack: Palette.PACK,
    helmet: 0xe9e6df,
    boots: Palette.BOOTS,
  };
  static readonly OTHER: Outfit = {
    suit: Palette.OTHER_SUIT,
    legs: Palette.OTHER_SUIT,
    pack: 0x3b4a3a,
    helmet: 0xd9441f,
    boots: Palette.BOOTS,
  };
  static readonly SHERPA: Outfit = {
    suit: Palette.SHERPA_SUIT,
    legs: 0x1b1d24,
    pack: 0xc9771a,
    helmet: 0x2c2f38,
    boots: 0x24252b,
  };

  /** The bones, in metres: thigh and shin, upper arm and forearm. */
  private static readonly THIGH = 0.44;
  private static readonly SHIN = 0.43;
  private static readonly UPPER_ARM = 0.3;
  private static readonly FOREARM = 0.28;
  /** Where the eyes are from the base of the neck: up, and forward. */
  private static readonly EYES = { up: 0.17, forward: 0.1 };
  private static readonly NECK = 0.56;
  private static readonly DOWN = new Vector3(0, -1, 0);

  readonly root = new Group();
  private readonly trunk: Mesh;
  private readonly head: Mesh;
  private readonly thighs: readonly [Mesh, Mesh];
  private readonly shins: readonly [Mesh, Mesh];
  private readonly feet: readonly [Mesh, Mesh];
  private readonly upperArms: readonly [Mesh, Mesh];
  private readonly forearms: readonly [Mesh, Mesh];
  private readonly joint = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly way = new Vector3();
  private readonly turn = new Quaternion();
  private readonly neck = new Vector3();

  constructor(outfit: Outfit, cloth: Material) {
    const mesh = (geometry: BufferGeometry, material = cloth): Mesh => {
      const part = new Mesh(geometry, material);
      part.layers.set(SunShadows.CLIMBERS);
      part.frustumCulled = false;
      this.root.add(part);
      return part;
    };
    const pair = (
      make: (side: 1 | -1) => BufferGeometry,
      material = cloth,
    ): readonly [Mesh, Mesh] => [mesh(make(-1), material), mesh(make(1), material)];
    this.trunk = mesh(ClimberFigure.trunk(outfit));
    this.head = mesh(ClimberFigure.head(outfit));
    this.thighs = pair(() => ClimberFigure.thigh(outfit));
    this.shins = pair(() => ClimberFigure.shin(outfit));
    this.feet = pair(() => ClimberFigure.foot(outfit));
    this.upperArms = pair(() =>
      new Solid()
        .ball(outfit.suit, { size: [0.092, 0.092, 0.092] })
        .limb(outfit.suit, ClimberFigure.UPPER_ARM, 0.086, 0.074, 4)
        .build(),
    );
    this.forearms = pair((side) => ClimberFigure.forearm(outfit, side));
    this.root.matrixAutoUpdate = true;
  }

  /** Seen through its own eyes: no head, which would be all the eye saw. */
  set ownEyes(own: boolean) {
    this.head.visible = !own;
  }

  /** Where the eyes are in the world, for a head turned `yaw` from the body and tipped `pitch`:
   * they swing forward over the chest as the head looks down. Call after `pose`. */
  eyes(yaw: number, pitch: number, into: Vector3): Vector3 {
    const { up, forward } = ClimberFigure.EYES;
    into
      .set(0, up, -forward)
      .applyAxisAngle(new Vector3(1, 0, 0), pitch)
      .applyAxisAngle(new Vector3(0, 1, 0), yaw);
    return this.root.localToWorld(into.add(this.neck));
  }

  /** Where a hand is in the world: 0 the left, 1 the right. Call after `pose`. */
  hand(side: 0 | 1, into: Vector3): Vector3 {
    const forearm = this.forearms[side];
    return this.root.localToWorld(
      into
        .set(0, -ClimberFigure.FOREARM - 0.06, 0)
        .applyQuaternion(forearm.quaternion)
        .add(forearm.position),
    );
  }

  /** Where the harness's belay loop is in the world: the cowstails start there. */
  belayLoop(into: Vector3): Vector3 {
    return this.root.localToWorld(
      into.set(0, 0.05, -0.15).applyQuaternion(this.trunk.quaternion).add(this.trunk.position),
    );
  }

  /** Stands the figure at a point of the world, facing `heading` about the vertical, lying
   * down by `lying`, from 0 on its feet to 1 flat on its back. */
  place(x: number, y: number, z: number, heading: number, lying = 0): void {
    this.root.position.set(x, y + 0.22 * lying, z);
    this.root.rotation.set(-lying * 1.45, heading, 0, "YXZ");
  }

  /** The body in a stance. */
  pose(stance: Stance): void {
    const { hips, lean, twist, ankles, toes, wrists } = stance;
    const { trunk, head } = this;
    trunk.position.set(hips.x, hips.y, hips.z);
    trunk.rotation.set(-lean, twist, 0, "YXZ");
    this.neck.set(0, ClimberFigure.NECK, 0).applyQuaternion(trunk.quaternion).add(trunk.position);
    head.position.copy(this.neck);
    head.rotation.set(-lean * 0.3, twist, 0, "YXZ");
    for (const side of [0, 1] as const) {
      const out = side === 0 ? -1 : 1;
      const hip = this.from
        .set(out * ClimberGait.HIP_WIDTH, -0.04, 0)
        .applyQuaternion(trunk.quaternion)
        .add(trunk.position);
      this.limb(
        hip,
        ankles[side],
        ClimberFigure.THIGH,
        ClimberFigure.SHIN,
        0,
        0,
        -1,
        this.thighs[side],
        this.shins[side],
      );
      const foot = this.feet[side];
      foot.position.set(ankles[side].x, ankles[side].y, ankles[side].z);
      foot.rotation.set(-toes[side], 0, 0);
      const shoulder = this.from
        .set(out * ClimberGait.SHOULDERS.out, ClimberGait.SHOULDERS.up - 0.04, 0)
        .applyQuaternion(trunk.quaternion)
        .add(trunk.position);
      this.limb(
        shoulder,
        wrists[side],
        ClimberFigure.UPPER_ARM,
        ClimberFigure.FOREARM,
        out * 0.25,
        -0.5,
        0.85,
        this.upperArms[side],
        this.forearms[side],
      );
    }
  }

  /** A limb of two bones from a joint to where its end is wanted: the middle joint, a knee or
   * an elbow, bends towards `(poleX, poleY, poleZ)`. A reach too long for the bones stops short. */
  private limb(
    start: Vector3,
    end: Reach,
    first: number,
    second: number,
    poleX: number,
    poleY: number,
    poleZ: number,
    upper: Mesh,
    lower: Mesh,
  ): void {
    const { joint, to, way, turn } = this;
    to.set(end.x, end.y, end.z);
    way.copy(to).sub(start);
    const far = Math.min(Math.max(way.length(), 0.05), (first + second) * 0.995);
    way.normalize();
    to.copy(start).addScaledVector(way, far);
    const along = (first * first - second * second + far * far) / (2 * far);
    const off = Math.sqrt(Math.max(first * first - along * along, 0));
    const pole = joint.set(poleX, poleY, poleZ);
    pole.addScaledVector(way, -pole.dot(way));
    if (pole.lengthSq() < 1e-6) {
      pole.set(0, 0, -1);
    }
    pole.normalize().multiplyScalar(off).addScaledVector(way, along).add(start);
    upper.position.copy(start);
    upper.quaternion.copy(
      turn.setFromUnitVectors(ClimberFigure.DOWN, way.copy(joint).sub(start).normalize()),
    );
    lower.position.copy(joint);
    lower.quaternion.copy(
      turn.setFromUnitVectors(ClimberFigure.DOWN, way.copy(to).sub(joint).normalize()),
    );
  }

  /** The trunk, from the hips' joint: the suit's body, its collar and hood, the harness, and the
   * pack on the back with an ice axe strapped to it. */
  private static trunk({ suit, legs, pack }: Outfit): BufferGeometry {
    const strap = Palette.STRAP;
    const solid = new Solid()
      .ball(legs, { at: [0, -0.02, 0.005], size: [0.18, 0.15, 0.15] })
      .limb(suit, 0.5, 0.19, 0.165, 5, { at: [0, 0.52, 0], size: [1, 1, 0.82] })
      .ball(suit, { at: [0, 0.5, 0], size: [0.215, 0.1, 0.15] })
      .ball(suit, { at: [0, 0.54, 0.07], size: [0.14, 0.08, 0.09] })
      .ring(Palette.HARNESS, { at: [0, 0.06, 0], size: [0.4, 1, 0.33] }, 0.11)
      .box(Palette.SLING, { at: [0, 0.03, -0.165], size: [0.035, 0.09, 0.02] })
      .box(pack, { at: [0, 0.3, 0.215], size: [0.31, 0.46, 0.19] })
      .ball(pack, { at: [0, 0.54, 0.215], size: [0.16, 0.08, 0.1] })
      .box(Palette.PACK_LID, { at: [0, 0.26, 0.315], size: [0.22, 0.26, 0.04] })
      .box(strap, { at: [0, 0.42, 0.215], size: [0.316, 0.018, 0.196] })
      .box(strap, { at: [0, 0.18, 0.215], size: [0.316, 0.018, 0.196] })
      .tube(Palette.AXE_SHAFT, { at: [-0.1, 0.3, 0.33], size: [0.022, 0.56, 0.022] })
      .box(Palette.TOOL_STEEL, { at: [-0.09, 0.03, 0.33], size: [0.2, 0.014, 0.028] });
    for (const side of [-1, 1]) {
      solid
        .box(strap, {
          at: [side * 0.13, 0.4, -0.125],
          size: [0.045, 0.3, 0.014],
          turn: [0.1, 0, 0],
        })
        .box(strap, { at: [side * 0.13, 0.555, 0.02], size: [0.045, 0.014, 0.3] })
        .ring(
          Palette.STEEL,
          { at: [side * 0.2, 0.01, 0.03], size: [0.06, 1, 0.04], turn: [0, 0, Math.PI / 2] },
          0.012,
        );
    }
    return solid.build();
  }

  /** The head, from the base of the neck: a balaclava, goggles, a helmet and its lamp. */
  private static head({ helmet }: Outfit): BufferGeometry {
    return new Solid()
      .ball(Palette.HOOD_SHADOW, { at: [0, 0.13, 0], size: [0.1, 0.118, 0.11] })
      .ball(helmet, { at: [0, 0.165, 0.005], size: [0.132, 0.105, 0.145] }, 16)
      .ball(Palette.GOGGLES, { at: [0, 0.135, -0.082], size: [0.085, 0.04, 0.045] })
      .box(Palette.LAMP_CASE, { at: [0, 0.2, -0.14], size: [0.05, 0.035, 0.03] })
      .build();
  }

  private static thigh({ legs }: Outfit): BufferGeometry {
    return new Solid()
      .limb(legs, ClimberFigure.THIGH, 0.106, 0.086, 5)
      .ring(Palette.HARNESS, { at: [0, -0.08, 0], size: [0.225, 1, 0.225] }, 0.035)
      .build();
  }

  /** The shin, down to the ankle: the suit's leg over the boot's tall gaiter. */
  private static shin({ legs, boots }: Outfit): BufferGeometry {
    return new Solid()
      .ball(legs, { size: [0.088, 0.088, 0.088] })
      .limb(legs, 0.27, 0.085, 0.078, 3)
      .tube(boots, { at: [0, -0.35, 0], size: [0.15, 0.2, 0.15] }, 1.08, 12)
      .tube(Palette.RAND, { at: [0, -0.275, 0], size: [0.158, 0.025, 0.158] }, 1, 12)
      .build();
  }

  /** The boot, from the ankle: its shell, its rand and sole, and the crampon under it, ten
   * points down and two out in front. */
  private static foot({ boots }: Outfit): BufferGeometry {
    const steel = Palette.STEEL;
    const solid = new Solid()
      .ball(boots, { at: [0, -0.035, -0.05], size: [0.062, 0.06, 0.15] })
      .ball(boots, { at: [0, -0.02, 0.01], size: [0.062, 0.075, 0.08] })
      .box(Palette.RAND, { at: [0, -0.085, -0.055], size: [0.118, 0.03, 0.3] })
      .box(steel, { at: [0, -0.102, -0.055], size: [0.1, 0.008, 0.285] })
      .box(0xd9a21c, { at: [0, -0.04, -0.12], size: [0.126, 0.012, 0.02] })
      .box(0xd9a21c, { at: [0, -0.03, 0.07], size: [0.126, 0.012, 0.02] });
    for (const back of [-0.18, -0.13, -0.05, 0.03, 0.08]) {
      for (const side of [-0.043, 0.043]) {
        solid.tube(
          steel,
          { at: [side, -0.118, back], size: [0.014, 0.03, 0.008], turn: [Math.PI, 0, 0] },
          0.1,
          4,
        );
      }
    }
    for (const side of [-0.022, 0.022]) {
      solid.tube(
        steel,
        { at: [side, -0.1, -0.215], size: [0.012, 0.04, 0.008], turn: [-Math.PI / 2 - 0.3, 0, 0] },
        0.1,
        4,
      );
    }
    return solid.build();
  }

  /** The forearm, from the elbow: the suit's sleeve, its cuff, and the mitt, with its thumb on
   * the inside. */
  private static forearm({ suit }: Outfit, side: 1 | -1): BufferGeometry {
    return new Solid()
      .ball(suit, { size: [0.076, 0.076, 0.076] })
      .limb(suit, 0.25, 0.074, 0.062, 3)
      .tube(Palette.MITTS, { at: [0, -0.265, 0], size: [0.11, 0.05, 0.11] })
      .ball(Palette.MITTS, { at: [0, -0.34, -0.008], size: [0.047, 0.078, 0.058] })
      .ball(Palette.MITTS, { at: [-side * 0.04, -0.315, -0.03], size: [0.02, 0.04, 0.024] }, 8)
      .build();
  }
}
