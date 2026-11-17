import type { Point } from "../../physics";

/**
 * The start's picture as an elevation: the mountain seen from the west-north-west, from above
 * Kala Patthar, looking along a bearing of 105°, with nothing nearer drawn larger. A place's
 * height on the picture is its altitude and its place across is how far to the right of the summit
 * it stands, at the same scale both ways, so the mountains keep their proportions and a camp
 * stands as high on the picture as it does on the mountain. The picture's size, its scale and the
 * summit's place on it are its own numbers (docs/conventions/rendering.md); the summit's altitude
 * is the knowledge base's.
 */
export class Elevation {
  /** The picture's middle, 16:9, and how far it's drawn either side for a wider screen. */
  static readonly WIDTH = 1600;
  static readonly HEIGHT = 900;
  static readonly LEFT = -280;
  static readonly RIGHT = 1880;
  /** The picture's pixels to a metre of the mountain. */
  static readonly PIXELS_A_METRE = 0.17;
  /** Where Everest's summit is on the picture. */
  static readonly SUMMIT: Point = { x: 860, y: 160 };

  /** `summit`: the summit's altitude, in metres. */
  constructor(private readonly summit: number) {}

  /** How far down the picture a place at `altitude` metres is. */
  height(altitude: number): number {
    return Elevation.SUMMIT.y + (this.summit - altitude) * Elevation.PIXELS_A_METRE;
  }

  /** The altitude drawn `y` pixels down the picture. */
  altitude(y: number): number {
    return this.summit - (y - Elevation.SUMMIT.y) / Elevation.PIXELS_A_METRE;
  }

  /** Where a place `right` metres to the right of the summit, at `altitude` metres, is drawn. */
  place(right: number, altitude: number): Point {
    return { x: Elevation.SUMMIT.x + right * Elevation.PIXELS_A_METRE, y: this.height(altitude) };
  }
}
