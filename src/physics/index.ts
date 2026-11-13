// The slope physics, as the modules above it see it (docs/conventions/slope-physics.md).
export type { ClimberView, Fall, Gear, Kit } from "./climber";
export { Climber } from "./climber";
export { Lamplight } from "./lamplight";
export type { LampSettings, Lamps } from "./lamplight";
export { Logbook } from "./logbook";
export type { LogPage, LoggedStretch } from "./logbook";
export { SectionScale } from "./section-scale";
export type { SectionAltitude } from "./section-scale";
export { SlopePhysics } from "./slope-physics";
export type {
  AlongStretch,
  ClimberLayout,
  IceClimbSettings,
  LadderCondition,
  LadderLayout,
  RopeLayout,
  SlopeLayout,
  SlopeSettings,
  SnowLayout,
} from "./slope-physics";
export type { GradientPoint, SteepnessPoint } from "./steepness";
export { Terrain } from "./terrain";
export type { Pair, Point } from "./terrain";
