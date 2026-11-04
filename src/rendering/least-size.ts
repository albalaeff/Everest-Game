/**
 * The least the picture draws, however far out the view: a climber 24 px tall, a line 1.5 px
 * wide. True to scale, a climber at 100 m would be 7 px on a phone and a rope a quarter of a pixel;
 * above these, everything is true to scale. A frozen value for one scale, the camera's pixels a
 * metre this frame.
 */
export class LeastSize {
  private static readonly CLIMBER_PIXELS = 24;
  private static readonly LINE_PIXELS = 1.5;

  constructor(readonly pixelsPerMetre: number) {}

  /** How wide to draw a line `metres` wide: as wide as that, or 1.5 px if that's wider. */
  line(metres: number): number {
    return Math.max(metres, LeastSize.LINE_PIXELS / this.pixelsPerMetre);
  }

  /** How many times life size to draw a climber `metres` tall: 1, or enough for 24 px. */
  climber(metres: number): number {
    return Math.max(1, LeastSize.CLIMBER_PIXELS / (metres * this.pixelsPerMetre));
  }
}
