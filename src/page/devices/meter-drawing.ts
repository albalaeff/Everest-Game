import { DeviceDrawing } from "./device-drawing";
import type { DrawnBox, DrawnControl } from "./device-drawing";

/**
 * The pocket weather meter as the thing itself (#284), after the kind climbers have carried on
 * Everest (gear.wind-meter, gear.wind-meter-layout): a gold case 42 mm wide and 122 long, round
 * at its top round the impeller of 25 mm that turns in a hole through it, the thermometer's bead
 * in a window at its left, a segment screen under them, and three buttons in a row under the
 * screen, ◄ ◐ ►, then the hole for its lanyard. Millimetres of the real one.
 */
export class MeterDrawing extends DeviceDrawing {
  /** The case, the impeller's centre and hole, the screen's frame and glass, and the buttons. */
  private static readonly CASE: DrawnBox = { x: 3, y: 3, width: 42, height: 122 };
  private static readonly IMPELLER = { x: 24, y: 24, hole: 15, vanes: 12.5 };
  private static readonly FRAME: DrawnBox = { x: 5, y: 46, width: 38, height: 28 };
  private static readonly GLASS: DrawnBox = { x: 6.5, y: 47.5, width: 35, height: 25 };
  private static readonly BUTTONS: readonly (readonly [name: string, x: number])[] = [
    ["left", 8],
    ["power", 19],
    ["right", 30],
  ];
  private static readonly BUTTON = { y: 80, width: 10, height: 9 };
  /** The meter from its impeller down past its buttons: its foot, with the lanyard's hole, runs
   * on past the card's edge. */
  private static readonly VIEW: DrawnBox = { x: 0, y: 0, width: 48, height: 100 };

  readonly name = "meter";
  readonly width = 48;
  readonly height = 128;
  readonly screen = MeterDrawing.GLASS;
  readonly controls: readonly DrawnControl[] = [
    {
      name: "impeller",
      kind: "part",
      box: { x: 9, y: 9, width: 30, height: 30 },
      push: [0, 0],
    },
    { name: "thermometer", kind: "part", box: { x: 2, y: 37, width: 7, height: 9 }, push: [0, 0] },
    ...MeterDrawing.BUTTONS.map(([name, x]): DrawnControl => ({
      name,
      kind: "button",
      box: { x: x - 0.5, y: 78.5, width: 11, height: 12 },
      push: [0, 0.5],
    })),
  ];

  override get view(): DrawnBox {
    return MeterDrawing.VIEW;
  }

  protected gradients(): string {
    return [
      this.linear(
        "case",
        [
          [0, "#f6d36a"],
          [0.4, "#dcab2e"],
          [1, "#a8780f"],
        ],
        [0, 0],
        [1, 0.5],
      ),
      this.linear(
        "rim",
        [
          [0, "#fff2b8"],
          [1, "#8d6408"],
        ],
        [0, 0],
        [1, 1],
      ),
      this.linear("frame", [
        [0, "#24272c"],
        [1, "#0a0b0d"],
      ]),
      this.linear("key", [
        [0, "#3d4148"],
        [1, "#191b1f"],
      ]),
      this.radial(
        "hole",
        [
          [0, "#1a1d22"],
          [0.8, "#0b0c0e"],
          [1, "#050506"],
        ],
        [0.5, 0.45],
        0.6,
      ),
      this.linear(
        "vane",
        [
          [0, "#f4f6f8"],
          [1, "#9aa2ac"],
        ],
        [0, 0],
        [1, 1],
      ),
    ].join("");
  }

  protected parts(): string {
    return [
      this.meterCase(),
      this.impeller(),
      this.thermometer(),
      this.screenFrame(),
      ...this.keys(),
    ].join("");
  }

  /** The case: round at its top, its corners rounded at its foot, lit down its left; the hole
   * for the lanyard. */
  private meterCase(): string {
    const { x, y, width, height } = MeterDrawing.CASE;
    const half = width / 2;
    const foot = y + height;
    const outline = `M${x} ${y + half}A${half} ${half} 0 0 1 ${x + width} ${y + half}V${foot - 7}Q${x + width} ${foot} ${x + width - 7} ${foot}H${x + 7}Q${x} ${foot} ${x} ${foot - 7}Z`;
    return `<path d="${outline}" fill="${this.paint("case")}" stroke="#6e4e05" stroke-width="0.5"/><path d="M${x + 1.6} ${y + half}V${foot - 8}" stroke="#fff3c4" stroke-width="0.7" stroke-linecap="round" opacity="0.55"/><circle cx="${x + half}" cy="${foot - 8}" r="2.6" fill="#2a1f05" stroke="#8d6408" stroke-width="0.5"/>`;
  }

  /** The impeller in its hole through the case: eight vanes on a hub, turning as the wind
   * blows. */
  private impeller(): string {
    const { x, y, hole, vanes } = MeterDrawing.IMPELLER;
    const blades = Array.from({ length: 8 }, (_, at) => {
      const turn = at * 45;
      return `<path d="M${x} ${y - 2.2}C${x + 2.4} ${y - 5} ${x + 3.4} ${y - vanes + 2} ${x + 1.2} ${y - vanes}L${x - 1} ${y - vanes + 0.4}C${x - 0.4} ${y - 6} ${x - 1.4} ${y - 4} ${x} ${y - 2.2}Z" fill="${this.paint("vane")}" stroke="#5b636d" stroke-width="0.25" transform="rotate(${turn} ${x} ${y})"/>`;
    }).join("");
    return `<circle cx="${x}" cy="${y}" r="${hole + 1.4}" fill="${this.paint("rim")}"/><circle cx="${x}" cy="${y}" r="${hole}" fill="${this.paint("hole")}"/><g class="meter__vanes">${blades}<circle cx="${x}" cy="${y}" r="2.6" fill="#2c3037" stroke="#0b0c0e" stroke-width="0.3"/></g><path d="M${x - hole} ${y}H${x + hole}" stroke="#b58a1d" stroke-width="1.2" opacity="0.9"/>`;
  }

  /** The thermometer's bead in its window at the case's left, open to the air. */
  private thermometer(): string {
    return `<path d="M3 38.5h4.6a1.4 1.4 0 0 1 1.4 1.4v4.2a1.4 1.4 0 0 1-1.4 1.4H3Z" fill="#14161a"/><path d="M4 42h2.4" stroke="#8f969e" stroke-width="0.35"/><circle cx="6.7" cy="42" r="0.9" fill="#3b2a14" stroke="#c9a15a" stroke-width="0.25"/>`;
  }

  private screenFrame(): string {
    return this.rect(
      MeterDrawing.FRAME,
      3,
      this.paint("frame"),
      'stroke="#5e4304" stroke-width="0.4"',
    );
  }

  /** The three buttons under the screen, each with its mark: ◄, ◐ and ►. */
  private keys(): readonly string[] {
    const { y, width, height } = MeterDrawing.BUTTON;
    return MeterDrawing.BUTTONS.map(([name, x]) => {
      const middleX = x + width / 2;
      const middleY = y + height / 2;
      const marks: Readonly<Record<string, string>> = {
        left: `<path d="M${middleX + 1.6} ${middleY - 2}L${middleX - 1.8} ${middleY}L${middleX + 1.6} ${middleY + 2}Z" fill="#dfe3e8"/>`,
        right: `<path d="M${middleX - 1.6} ${middleY - 2}L${middleX + 1.8} ${middleY}L${middleX - 1.6} ${middleY + 2}Z" fill="#dfe3e8"/>`,
        power: `<circle cx="${middleX}" cy="${middleY}" r="2.1" fill="none" stroke="#dfe3e8" stroke-width="0.6"/><path d="M${middleX} ${middleY - 2.1}A2.1 2.1 0 0 1 ${middleX} ${middleY + 2.1}Z" fill="#dfe3e8"/>`,
      };
      return this.cap(
        name,
        `${this.rect({ x, y, width, height }, 3.2, this.paint("key"), 'stroke="#0a0b0d" stroke-width="0.4"')}${this.rect({ x: x + 1, y: y + 0.6, width: width - 2, height: 1.4 }, 0.7, "#5a5f67")}${marks[name] ?? ""}`,
      );
    });
  }
}
