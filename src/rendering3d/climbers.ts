import { Group, Vector3 } from "three";
import type { Material } from "three";

import type { ClimberView, Point } from "../physics";
import { Palette } from "../rendering/palette";
import type { SceneWorld } from "../rendering/slope-scene";
import { SteppedPoints } from "../rendering/stepped-points";
import type { BetweenSteps } from "../rendering/stepped-points";
import type { ClimberId } from "../simulation";
import { ClimberFigure } from "./climber-figure";
import { ClimberGait } from "./climber-gait";
import type { GaitMode, Reach } from "./climber-gait";
import { RopeTube, RouteKit } from "./route-kit";
import type { Trail } from "./trail";

/** One climber of the picture: their figure, their steps, and what the last frame left. */
interface Drawn {
  readonly id: ClimberId;
  readonly figure: ClimberFigure;
  readonly gait: ClimberGait;
  readonly cowstails: readonly [RopeTube, RopeTube];
  heading: number;
  way: 1 | -1;
  last: Point | null;
}

/**
 * The climbers in the 3D picture: each one's figure stood where the physics has them, between
 * its last two steps, turned the way they go, and walked by how far they went since the last
 * frame. On a ladder up a wall, or on a face, they turn to face the ice; hanging, they hang;
 * down, they lie. A climber sliding their jumar has that hand on the rope, and each cowstail
 * runs from the harness to its carabiner. The player's own figure is the body they look down
 * at, and their eyes are its eyes.
 */
export class Climbers {
  /** How far a climber on a wall stands off from it, in metres, and how fast a body turns. */
  private static readonly OFF_THE_WALL = 0.34;
  private static readonly TURN = 7;
  /** How far in a frame is a climber put somewhere, not walked there, in metres. */
  private static readonly JUMP = 1.5;
  private static readonly COWSTAIL_POINTS = 7;
  /** How near the player another climber is stood aside, and how far aside, in metres. */
  private static readonly ELBOW_ROOM = 0.7;

  readonly group = new Group();
  private readonly drawn: readonly Drawn[];
  private readonly points = new SteppedPoints();
  private readonly feet = new Vector3();
  private readonly scratch = new Vector3();
  private readonly chain: Vector3[] = Array.from(
    { length: Climbers.COWSTAIL_POINTS },
    () => new Vector3(),
  );

  constructor(
    private readonly world: SceneWorld,
    private readonly trail: Trail,
    private readonly kit: RouteKit,
    cloth: Material,
  ) {
    this.drawn = world.climbers.map((id) => {
      const outfit =
        id === world.player
          ? ClimberFigure.PLAYER
          : world.npcs.includes(id)
            ? ClimberFigure.SHERPA
            : ClimberFigure.OTHER;
      const figure = new ClimberFigure(outfit, cloth);
      figure.ownEyes = id === world.player;
      const cowstails = [0, 1].map(
        () => new RopeTube(Climbers.COWSTAIL_POINTS, Palette.SLING, cloth),
      );
      const [first, second] = cowstails;
      if (first === undefined || second === undefined) {
        throw new RangeError("A climber has two cowstails");
      }
      this.group.add(figure.root, first.mesh, second.mesh);
      return {
        id,
        figure,
        gait: new ClimberGait(),
        cowstails: [first, second],
        heading: 0,
        way: 1,
        last: null,
      };
    });
  }

  /** A frame: every climber where they're drawn between the last two steps, in their stance.
   * `lookYaw` is where the player's head is turned, about the vertical. */
  update(seconds: number, between: BetweenSteps, lookYaw: number): void {
    const { physics, player } = this.world;
    const views = this.drawn.map(({ id }) => physics.climber(id));
    this.points.follow(views, between);
    for (const [index, drawn] of this.drawn.entries()) {
      const view = views[index];
      if (view === undefined) {
        continue;
      }
      const at = { x: this.points.x(index), y: this.points.y(index) };
      const mode = this.mode(view);
      const up = this.trail.heading(at.x);
      if (mode === "upright") {
        drawn.way = this.wallWay(drawn.id, view);
      } else if (drawn.id === player) {
        // The player's body faces the way they look along the route, with some give, so a
        // glance sideways doesn't spin it.
        const along = Math.cos(lookYaw - up);
        drawn.way = along > 0.25 ? 1 : along < -0.25 ? -1 : drawn.way;
      } else {
        drawn.way = view.facing;
      }
      const wanted = up + (drawn.way > 0 ? 0 : Math.PI);
      const off = Math.atan2(Math.sin(wanted - drawn.heading), Math.cos(wanted - drawn.heading));
      drawn.heading += drawn.last === null ? off : off * Math.min(seconds * Climbers.TURN, 1);

      const { last } = drawn;
      const dx = last === null ? 0 : at.x - last.x;
      const dy = last === null ? 0 : at.y - last.y;
      const far = Math.hypot(dx, dy);
      const forwards =
        mode === "upright" ? Math.sign(dy) : Math.sign(dx * drawn.way) || Math.sign(dy);
      const metres = far > Climbers.JUMP ? 0 : far * forwards;
      drawn.last = at;

      // Nobody stands inside anybody: one who has come up beside the player stands a step to
      // the left of the trail, off the rope's side.
      const self = views[this.drawn.findIndex(({ id }) => id === player)];
      const beside =
        drawn.id !== player &&
        self !== undefined &&
        Math.hypot(at.x - self.x, at.y - self.y) < Climbers.ELBOW_ROOM
          ? -Climbers.ELBOW_ROOM
          : 0;
      const place = this.trail.place(at, beside);
      const back =
        mode === "upright"
          ? Climbers.OFF_THE_WALL
          : mode === "ground"
            ? this.offAWall(physics.along(drawn.id), drawn.way, view)
            : 0;
      const lying = mode === "down" ? 1 : 0;
      drawn.figure.place(
        place.x + Math.sin(drawn.heading) * back,
        place.y,
        place.z + Math.cos(drawn.heading) * back,
        drawn.heading,
        lying,
      );
      drawn.figure.root.updateMatrixWorld(true);
      const along = physics.along(drawn.id);
      const { way } = drawn;
      const stance = drawn.gait.step({
        metres,
        seconds,
        mode,
        ground: (ahead) => physics.terrain.point(along + way * ahead).y - view.y,
        holds: [null, this.jumarHold(drawn, view)],
      });
      drawn.figure.pose(stance);
      this.cowstail(drawn, 0, view.firstAt);
      this.cowstail(drawn, 1, view.secondAt);
      if (drawn.id === player) {
        this.feet.set(place.x, place.y, place.z);
      }
    }
  }

  /** Where the player's feet are in the world, as last drawn. */
  get playerFeet(): Vector3 {
    return this.feet;
  }

  /** The way the player's body faces along the route: 1 up it, −1 down. */
  get playerWay(): 1 | -1 {
    return this.drawn.find(({ id }) => id === this.world.player)?.way ?? 1;
  }

  /** Where the player's eyes are in the world, the head turned to `yaw` about the vertical and
   * tipped `pitch`. */
  eyes(yaw: number, pitch: number, into: Vector3): Vector3 {
    const own = this.drawn.find(({ id }) => id === this.world.player);
    return own === undefined
      ? into.copy(this.feet)
      : own.figure.eyes(yaw - own.heading, pitch, into);
  }

  /** How far back from where the physics has their feet a climber on the ground stands, in
   * metres: a body's depth off a wall that rises just in front of them, so they stand at its
   * foot and not in it; nought in the open. */
  private offAWall(along: number, way: 1 | -1, view: ClimberView): number {
    const { terrain } = this.world.physics;
    let back = 0;
    for (const ahead of [0.6, 1.2, 2]) {
      const point = terrain.point(along + way * ahead);
      if (point.y - view.y > 0.5) {
        back = Math.max(back, Climbers.OFF_THE_WALL + 0.08 - Math.abs(point.x - view.x));
      }
    }
    return back;
  }

  /** How a climber is moving, as the picture poses them. */
  private mode(view: ClimberView): GaitMode {
    if (view.dead || view.down) {
      return "down";
    }
    if (view.falling || view.hanging || view.hauled) {
      return "hanging";
    }
    if (view.onIce || view.lowering) {
      return "upright";
    }
    if (view.ladder !== null) {
      const [from, to] = this.world.physics.ladder(view.ladder);
      const steep =
        from !== undefined && to !== undefined && Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
      return steep ? "upright" : "across";
    }
    return "ground";
  }

  /** Which way along the route a climber on a wall faces: towards the ice, the way the wall
   * rises, whichever way they're going on it. */
  private wallWay(id: ClimberId, view: ClimberView): 1 | -1 {
    const { physics } = this.world;
    if (view.ladder !== null) {
      const [from, to] = physics.ladder(view.ladder);
      return (to?.y ?? 0) >= (from?.y ?? 0) ? 1 : -1;
    }
    const face = physics.face(physics.along(id));
    return face === null || face.top >= face.foot ? 1 : -1;
  }

  /** Where the right hand holds the jumar, in the climber's own frame: on the rope, where the
   * first cowstail's carabiner is, while they slide it; nothing otherwise. */
  private jumarHold({ figure }: Drawn, view: ClimberView): Reach | null {
    if (!view.jumarHeld || view.firstAt === null || view.falling) {
      return null;
    }
    const local = figure.root.worldToLocal(this.kit.onRope(view.firstAt, this.scratch));
    // Within an arm's reach in front and to the side, wherever the rope has drifted to.
    return {
      x: Math.min(Math.max(local.x, 0.1), 0.55),
      y: Math.min(Math.max(local.y, 0.75), 1.35),
      z: Math.min(Math.max(local.z, -0.6), -0.15),
    };
  }

  /** A cowstail: from the harness to its carabiner on the rope, hanging in a curve, or tucked
   * out of sight when it's clipped to nothing. */
  private cowstail({ figure, cowstails }: Drawn, which: 0 | 1, onRope: Point | null): void {
    const tube = cowstails[which];
    tube.mesh.visible = onRope !== null;
    if (onRope === null) {
      return;
    }
    const from = figure.belayLoop(this.scratch).clone();
    const to = this.kit.onRope(onRope, this.scratch);
    const span = from.distanceTo(to);
    const slack = Math.max(1.0 - span, 0.05) * 0.35;
    const last = this.chain.length - 1;
    for (const [index, point] of this.chain.entries()) {
      const share = index / last;
      point.lerpVectors(from, to, share).y -= slack * 4 * share * (1 - share);
    }
    tube.along(this.chain);
  }
}
