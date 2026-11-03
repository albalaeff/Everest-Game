export type QualityName = "low" | "medium" | "high";

/** The layers a level may leave out; the sky, the peaks and the slope are always drawn. */
export interface OptionalLayers {
  readonly farRanges: boolean;
  readonly nearRidge: boolean;
  readonly foreground: boolean;
}

/**
 * One of the three levels of the graphics setting (spec.md → Phone and PC: a quality setting
 * reduces the parallax layers and the particles): which optional layers, how many snowflakes, and
 * a cap on how sharp the picture is drawn, in device pixels per CSS pixel.
 */
export class GraphicsQuality {
  static readonly LOW = new GraphicsQuality(
    "low",
    { farRanges: false, nearRidge: false, foreground: false },
    0,
    1,
  );
  static readonly MEDIUM = new GraphicsQuality(
    "medium",
    { farRanges: false, nearRidge: false, foreground: true },
    120,
    1.5,
  );
  static readonly HIGH = new GraphicsQuality(
    "high",
    { farRanges: true, nearRidge: true, foreground: true },
    300,
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
    private readonly sharpnessCap: number,
  ) {}

  static named(name: string): GraphicsQuality | undefined {
    return GraphicsQuality.LEVELS.find((level) => level.name === name);
  }

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

/** The device's storage, as far as the choice uses it: `localStorage`, or none. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The level this device plays on: High to start with, Medium on a phone (a coarse pointer), and
 * then whatever was chosen last, kept in the storage until the saves take the settings (#60).
 */
export class QualityChoice {
  static readonly KEY = "everest.graphics";

  private current: GraphicsQuality;

  constructor(
    private readonly storage: ChoiceStorage | null,
    coarsePointer: boolean,
  ) {
    const stored = QualityChoice.read(storage);
    this.current = stored ?? (coarsePointer ? GraphicsQuality.MEDIUM : GraphicsQuality.HIGH);
  }

  get quality(): GraphicsQuality {
    return this.current;
  }

  choose(quality: GraphicsQuality): void {
    this.current = quality;
    try {
      this.storage?.setItem(QualityChoice.KEY, quality.name);
    } catch {
      // A browser that keeps nothing, as Safari in private mode: the choice holds for the page.
    }
  }

  private static read(storage: ChoiceStorage | null): GraphicsQuality | undefined {
    try {
      return GraphicsQuality.named(storage?.getItem(QualityChoice.KEY) ?? "");
    } catch {
      return undefined;
    }
  }
}
