import { KeptChoice } from "./kept-choice";
import type { ChoiceStorage } from "./kept-choice";

export type QualityName = "low" | "medium" | "high";

/** The layers a level may leave out; the sky, the peaks and the slope are always drawn. */
export interface OptionalLayers {
  readonly farRanges: boolean;
  readonly nearRidge: boolean;
  readonly foreground: boolean;
}

/**
 * One of the three levels of the graphics setting (spec.md → Phone and PC: a quality setting
 * reduces the parallax layers and the particles): which optional layers, how many snowflakes,
 * puffs of blown snow (and as many of the air's glinting crystals) and banks of fog, whether the
 * sky's gradient is dithered, whether the glacier's ice under the route is worked out pixel by
 * pixel (`GlacierIce`) or its layers drawn flat, and a cap on how sharp the picture is drawn, in
 * device pixels per CSS pixel. Low loses beauty, never information: it keeps some blown snow,
 * which tells the wind, and some fog, which tells the weather.
 */
export class GraphicsQuality {
  static readonly LOW = new GraphicsQuality(
    "low",
    { farRanges: false, nearRidge: false, foreground: false },
    0,
    40,
    3,
    false,
    false,
    1,
  );
  static readonly MEDIUM = new GraphicsQuality(
    "medium",
    { farRanges: false, nearRidge: false, foreground: true },
    120,
    90,
    5,
    false,
    true,
    1.5,
  );
  static readonly HIGH = new GraphicsQuality(
    "high",
    { farRanges: true, nearRidge: true, foreground: true },
    300,
    180,
    8,
    true,
    true,
    Infinity,
  );
  static readonly LEVELS: readonly GraphicsQuality[] = [
    GraphicsQuality.LOW,
    GraphicsQuality.MEDIUM,
    GraphicsQuality.HIGH,
  ];

  private constructor(
    readonly name: QualityName,
    readonly layers: OptionalLayers,
    readonly flakes: number,
    readonly motes: number,
    readonly fogBanks: number,
    readonly dithered: boolean,
    readonly glacierIce: boolean,
    private readonly sharpnessCap: number,
  ) {}

  /** The level above, and Low again after High. */
  get next(): GraphicsQuality {
    const index = GraphicsQuality.LEVELS.indexOf(this);
    return GraphicsQuality.LEVELS[(index + 1) % GraphicsQuality.LEVELS.length] ?? this;
  }

  /** How sharp to draw on a screen of `devicePixelRatio`: the screen's own, up to the cap. */
  resolution(devicePixelRatio: number): number {
    return Math.min(devicePixelRatio, this.sharpnessCap);
  }
}

/** The level this device plays on: High to start with, Medium on a phone (a coarse pointer), and
 * then whatever was chosen last. */
export class QualityChoice extends KeptChoice<GraphicsQuality> {
  static readonly KEY = "everest.graphics";

  constructor(storage: ChoiceStorage | null, coarsePointer: boolean) {
    super(
      storage,
      QualityChoice.KEY,
      GraphicsQuality.LEVELS,
      coarsePointer ? GraphicsQuality.MEDIUM : GraphicsQuality.HIGH,
    );
  }
}
