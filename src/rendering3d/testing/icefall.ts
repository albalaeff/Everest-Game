import { KnowledgeBase } from "../../content/knowledge-base";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { Mountain } from "../../content/mountain";
import type { SlopePhysics } from "../../physics";
import type { PartStretch } from "../../rendering/glacier";
import { Expedition } from "../../simulation";
import { GlacierShape } from "../glacier-shape";
import { Trail } from "../trail";

/** The Icefall as the game sets off on it, for the 3D picture's tests: the route's own ground,
 * ropes and ladders, laid by the physics, and the trail and the glacier's shape built on them
 * as the scene builds them. */
export class IcefallForTests {
  static readonly SEED = 311;

  readonly physics: SlopePhysics;
  readonly parts: readonly PartStretch[];
  readonly trail: Trail;
  readonly shape: GlacierShape;

  constructor() {
    const mountain = new Mountain(new KnowledgeBase(KNOWLEDGE_FILES));
    const rules = mountain.rules();
    Expedition.start(mountain.scenario(1, undefined, undefined, false), rules.all);
    this.physics = rules.physics;
    this.parts = mountain.route.parts;
    this.trail = new Trail(this.physics.terrain.points.at(-1)?.[0] ?? 0);
    this.shape = new GlacierShape(
      this.physics.terrain,
      this.trail,
      this.parts,
      this.physics.ice,
      IcefallForTests.SEED,
    );
  }
}
