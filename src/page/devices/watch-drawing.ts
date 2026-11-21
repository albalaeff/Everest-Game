import { DeviceDrawing } from "./device-drawing";
import type { DrawnBox, DrawnControl } from "./device-drawing";

/** A point of the drawing, in millimetres. */
type Point = readonly [x: number, y: number];

/**
 * The GPS watch as the thing itself (#284): a round case of 47 mm in a steel bezel with its
 * degrees cut in it, a 33 mm round screen behind its glass, five buttons, three on the left
 * (light, up, down) and two on the right (start, back), as an outdoor watch has them, and the
 * strap above and below, fading where the card ends (gear.watch-buttons). Millimetres of the
 * real one, the case's centre a little below the drawing's.
 */
export class WatchDrawing extends DeviceDrawing {
  /** The case's radius, the bezel's inner edge, the screen's glass and its black ring, the
   * buttons' angles from 12 o'clock, and where their middles stand off the case's centre. */
  private static readonly CENTRE: Point = [32, 46];
  private static readonly CASE = 23.5;
  private static readonly BEZEL_IN = 18.7;
  private static readonly GLASS = 17.6;
  private static readonly LENS = 16.5;
  private static readonly ANGLES: readonly (readonly [name: string, degrees: number])[] = [
    ["light", -58],
    ["up", -90],
    ["down", -122],
    ["start", 58],
    ["back", 122],
  ];
  private static readonly BUTTON_OUT = 25.2;
  /** A button's box for a finger, and how far it gives; the strap's width. */
  private static readonly HIT = 10.5;
  private static readonly PUSH = 0.7;
  private static readonly STRAP = 22;

  readonly name = "watch";
  readonly width = 64;
  readonly height = 92;
  readonly screen: DrawnBox;
  readonly controls: readonly DrawnControl[];

  constructor() {
    super();
    const [x, y] = WatchDrawing.CENTRE;
    const lens = WatchDrawing.LENS;
    this.screen = { x: x - lens, y: y - lens, width: lens * 2, height: lens * 2 };
    this.controls = WatchDrawing.ANGLES.map(([name, degrees]): DrawnControl => {
      const [middleX, middleY] = WatchDrawing.at(degrees, WatchDrawing.BUTTON_OUT);
      const [inX, inY] = WatchDrawing.at(degrees, -WatchDrawing.PUSH);
      const hit = WatchDrawing.HIT;
      return {
        name,
        kind: "button",
        box: { x: middleX - hit / 2, y: middleY - hit / 2, width: hit, height: hit },
        push: [inX - x, inY - y],
      };
    });
  }

  protected gradients(): string {
    return [
      this.linear("strap", [
        [0, "#16181c"],
        [0.5, "#24272d"],
        [1, "#121418"],
      ], [0, 0], [1, 0]),
      this.linear("case", [
        [0, "#5b616b"],
        [0.45, "#262a31"],
        [1, "#0d0f12"],
      ], [0.2, 0], [0.8, 1]),
      this.linear("bezel", [
        [0, "#f2f4f6"],
        [0.3, "#a9b0b8"],
        [0.55, "#6c737c"],
        [0.8, "#c6ccd2"],
        [1, "#7c838c"],
      ], [0.15, 0], [0.85, 1]),
      this.linear("button", [
        [0, "#e9ecef"],
        [0.5, "#8d949c"],
        [1, "#4a5058"],
      ], [0, 0], [1, 1]),
      `<mask id="${this.id("strap-ends")}"><rect width="64" height="92" fill="url(#${this.id("fade-mask")})"/></mask>`,
      `<linearGradient id="${this.id("fade-mask")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="0.14" stop-color="#fff"/><stop offset="0.86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`,
    ].join("");
  }

  protected parts(): string {
    return [this.strap(), this.lugs(), ...this.buttons(), this.watchCase(), this.bezel(), this.glass()].join(
      "",
    );
  }

  /** The strap above and below the case, its holes below, fading off where the card ends. */
  private strap(): string {
    const [x] = WatchDrawing.CENTRE;
    const half = WatchDrawing.STRAP / 2;
    const holes = [76, 82, 88]
      .map((y) => `<ellipse cx="${x}" cy="${y}" rx="1.3" ry="1.1" fill="#050607"/>`)
      .join("");
    const ribs = [8, 12, 16, 74, 79, 84]
      .map(
        (y) =>
          `<path d="M${x - half + 1} ${y}H${x + half - 1}" stroke="#30343b" stroke-width="0.35"/>`,
      )
      .join("");
    return `<g mask="url(#${this.id("strap-ends")})">${this.rect({ x: x - half, y: -4, width: half * 2, height: 100 }, 3, this.paint("strap"))}${ribs}${holes}</g>`;
  }

  /** The lugs that hold the strap to the case, two above and two below. */
  private lugs(): string {
    const [x, y] = WatchDrawing.CENTRE;
    const half = WatchDrawing.STRAP / 2;
    const lug = (side: -1 | 1, up: -1 | 1): string => {
      const near = x + side * (half - 1.5);
      const far = x + side * (half + 3.2);
      const root = y + up * 17;
      const tip = y + up * 27.5;
      return `<path d="M${near} ${root}L${near} ${tip}Q${(near + far) / 2} ${tip + up * 1.2} ${far} ${tip - up * 1}L${far + side * 1.5} ${root - up * 2}Z" fill="${this.paint("case")}" stroke="#08090b" stroke-width="0.3"/>`;
    };
    return [lug(-1, -1), lug(1, -1), lug(-1, 1), lug(1, 1)].join("");
  }

  /** Each button standing out of the case: a steel post with grooves round it. */
  private buttons(): readonly string[] {
    return WatchDrawing.ANGLES.map(([name, degrees]) => {
      const [x, y] = WatchDrawing.at(degrees, WatchDrawing.BUTTON_OUT - 0.6);
      const turn = degrees + 90;
      const grooves = [-1.6, 0, 1.6]
        .map((across) => `<path d="M-1.5 ${across}H1.5" stroke="#40454c" stroke-width="0.35"/>`)
        .join("");
      return this.cap(
        name,
        `<g transform="translate(${DeviceDrawing.n(x)} ${DeviceDrawing.n(y)}) rotate(${turn})"><rect x="-2.1" y="-3.2" width="4.2" height="6.4" rx="1.1" fill="${this.paint("button")}" stroke="#2a2e34" stroke-width="0.3"/>${grooves}</g>`,
      );
    });
  }

  private watchCase(): string {
    const [x, y] = WatchDrawing.CENTRE;
    return `<circle cx="${x}" cy="${y}" r="${WatchDrawing.CASE}" fill="${this.paint("case")}" stroke="#060708" stroke-width="0.4"/>`;
  }

  /** The steel bezel: its ring, its degrees cut every 6°, longer every 30°, and its four
   * screws. */
  private bezel(): string {
    const [x, y] = WatchDrawing.CENTRE;
    const outer = WatchDrawing.CASE - 0.7;
    const inner = WatchDrawing.BEZEL_IN;
    const ticks: string[] = [];
    for (let degrees = 0; degrees < 360; degrees += 6) {
      const long = degrees % 30 === 0;
      const [fromX, fromY] = WatchDrawing.at(degrees, outer - 0.8);
      const [toX, toY] = WatchDrawing.at(degrees, outer - (long ? 2.6 : 1.5));
      ticks.push(
        `<path d="M${DeviceDrawing.n(fromX)} ${DeviceDrawing.n(fromY)}L${DeviceDrawing.n(toX)} ${DeviceDrawing.n(toY)}" stroke="#2b2f35" stroke-width="${long ? 0.5 : 0.3}"/>`,
      );
    }
    const screws = [45, 135, 225, 315]
      .map((degrees) => {
        const [screwX, screwY] = WatchDrawing.at(degrees, (outer + inner) / 2 + 0.6);
        return `<circle cx="${DeviceDrawing.n(screwX)}" cy="${DeviceDrawing.n(screwY)}" r="0.95" fill="#3a3f46" stroke="#1a1d21" stroke-width="0.25"/><path d="M${DeviceDrawing.n(screwX - 0.5)} ${DeviceDrawing.n(screwY)}h1" stroke="#0c0d0f" stroke-width="0.3" transform="rotate(${degrees} ${DeviceDrawing.n(screwX)} ${DeviceDrawing.n(screwY)})"/>`;
      })
      .join("");
    return `<circle cx="${x}" cy="${y}" r="${outer}" fill="${this.paint("bezel")}" stroke="#4b5159" stroke-width="0.3"/><circle cx="${x}" cy="${y}" r="${inner}" fill="#0b0c0e"/>${ticks.join("")}${screws}`;
  }

  /** The black ring round the screen, under its glass: the glass's glare is the page's, over
   * the readings. */
  private glass(): string {
    const [x, y] = WatchDrawing.CENTRE;
    return `<circle cx="${x}" cy="${y}" r="${WatchDrawing.GLASS}" fill="#050607"/>`;
  }

  /** A point `radius` out from the case's centre at `degrees` from 12 o'clock, clockwise. */
  private static at(degrees: number, radius: number): Point {
    const [x, y] = WatchDrawing.CENTRE;
    const angle = (degrees * Math.PI) / 180;
    return [x + radius * Math.sin(angle), y - radius * Math.cos(angle)];
  }
}
