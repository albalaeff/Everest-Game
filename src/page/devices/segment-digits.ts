/**
 * A segment screen's digits, as a radio's and a weather meter's are (#284): each digit seven bars
 * in a cell of its own, the top leaning right as an LCD's figures do; the bars it doesn't light
 * still faint on the glass, as an unlit segment shows; a decimal point after any digit, and a
 * minus in a cell of its own. Right-aligned in its cells, as a meter's number is. It writes the
 * few letters a meter's hints need too, "SPd", "dEG" and "chiLL" (gear.wind-meter-layout). It
 * draws SVG in the units of its digits' height, and its colour is the screen's ink
 * (`currentColor`).
 */
export class SegmentDigits {
  /** Which bars each character lights: a to f clockwise from the top, g the middle. */
  private static readonly LIT: Readonly<Record<string, string>> = {
    S: "acdfg",
    P: "abefg",
    d: "bcdeg",
    E: "adefg",
    G: "acdef",
    c: "deg",
    h: "cefg",
    i: "e",
    L: "def",
    "0": "abcdef",
    "1": "bc",
    "2": "abdeg",
    "3": "abcdg",
    "4": "bcfg",
    "5": "acdfg",
    "6": "acdefg",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg",
    "-": "g",
    "−": "g",
    " ": "",
  };
  private static readonly BARS = "abcdefg";
  /** A digit's width and a bar's thickness, as shares of its height; the gap between two bars'
   * ends, the space a cell leaves for its decimal point, and how far the top leans right. */
  private static readonly WIDE = 0.54;
  private static readonly THICK = 0.13;
  private static readonly GAP = 0.025;
  private static readonly POINT_ROOM = 0.24;
  private static readonly LEAN = 0.09;

  constructor(
    readonly cells: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(cells) || cells < 1 || !(height > 0)) {
      throw new RangeError(`A segment screen needs whole cells and a height: ${cells}, ${height}`);
    }
  }

  /** The width its cells take, the lean of the top included. */
  get width(): number {
    return this.cells * this.pitch + SegmentDigits.LEAN * this.height;
  }

  /** `text` as an SVG of its own, as wide as its cells and as high as its digits: hidden from a
   * screen reader, which reads the words beside it. */
  svg(text: string): string {
    const { width, height } = this;
    return `<svg class="segments" viewBox="0 0 ${width.toFixed(2)} ${height}" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">${this.markup(text)}</svg>`;
  }

  /** The bars of `text`, lit and faint, right-aligned in the cells. */
  markup(text: string): string {
    const shown = this.characters(text);
    const blank = this.cells - shown.length;
    const bars: string[] = [];
    for (let cell = 0; cell < this.cells; cell += 1) {
      const { character, point } = shown[cell - blank] ?? { character: " ", point: false };
      const lit = SegmentDigits.LIT[character] ?? "";
      const left = cell * this.pitch;
      for (const bar of SegmentDigits.BARS) {
        bars.push(this.bar(bar, left, lit.includes(bar)));
      }
      bars.push(this.point(left, point));
    }
    return bars.join("");
  }

  /** From one cell to the next: a digit and its decimal point's room. */
  private get pitch(): number {
    return (SegmentDigits.WIDE + SegmentDigits.POINT_ROOM) * this.height;
  }

  /** The characters one to a cell, each with whether a decimal point follows it. */
  private characters(text: string): readonly { character: string; point: boolean }[] {
    const shown: { character: string; point: boolean }[] = [];
    for (const character of text) {
      const last = shown.at(-1);
      if (character === "." && last !== undefined && !last.point) {
        last.point = true;
      } else if (character in SegmentDigits.LIT) {
        shown.push({ character, point: false });
      } else {
        throw new RangeError(`A segment screen can't show “${character}” in “${text}”`);
      }
    }
    if (shown.length > this.cells) {
      throw new RangeError(`“${text}” needs more than the screen's ${this.cells} cells`);
    }
    return shown;
  }

  /** One bar of a digit whose cell starts at `left`: a long hexagon between two ends. */
  private bar(name: string, left: number, lit: boolean): string {
    const { height } = this;
    const thick = SegmentDigits.THICK * height;
    const wide = SegmentDigits.WIDE * height;
    const gap = SegmentDigits.GAP * height;
    const [x0, x1] = [left + thick / 2, left + wide - thick / 2];
    const [top, middle, bottom] = [thick / 2, height / 2, height - thick / 2];
    const ends: Readonly<Record<string, readonly [number, number, number, number]>> = {
      a: [x0, top, x1, top],
      b: [x1, top, x1, middle],
      c: [x1, middle, x1, bottom],
      d: [x0, bottom, x1, bottom],
      e: [x0, middle, x0, bottom],
      f: [x0, top, x0, middle],
      g: [x0, middle, x1, middle],
    };
    const [fromX, fromY, toX, toY] = ends[name] ?? [0, 0, 0, 0];
    const across = fromY === toY;
    const half = thick / 2;
    const [start, end] = across ? [fromX + gap, toX - gap] : [fromY + gap, toY - gap];
    const along = (at: number, side: number): readonly [number, number] =>
      across ? [at, fromY + side] : [fromX + side, at];
    const points = [
      along(start, 0),
      along(start + half, -half),
      along(end - half, -half),
      along(end, 0),
      along(end - half, half),
      along(start + half, half),
    ];
    return `<path class="${lit ? "seg seg--lit" : "seg"}" d="${this.path(points)}"/>`;
  }

  /** The decimal point after a digit whose cell starts at `left`. */
  private point(left: number, lit: boolean): string {
    const { height } = this;
    const size = SegmentDigits.THICK * height * 1.1;
    const x = left + (SegmentDigits.WIDE + SegmentDigits.POINT_ROOM / 2) * height - size / 2;
    const y = height - size;
    const points: readonly (readonly [number, number])[] = [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ];
    return `<path class="${lit ? "seg seg--lit" : "seg"}" d="${this.path(points)}"/>`;
  }

  /** A closed path through points of a cell, the top leaned right. */
  private path(points: readonly (readonly [number, number])[]): string {
    const lean = SegmentDigits.LEAN;
    const { height } = this;
    return `${points
      .map(([x, y], index) => {
        const leaned = x + lean * (height - y);
        return `${index === 0 ? "M" : "L"}${leaned.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join("")}Z`;
  }
}
