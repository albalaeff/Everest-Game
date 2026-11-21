import { DeviceDrawing } from "./device-drawing";
import type { DrawnBox, DrawnControl } from "./device-drawing";

/**
 * The satellite messenger as the thing itself (#284), after the palm-sized kind climbers carry
 * (gear.satellite-messenger, gear.messenger-layout): a red case 52 mm wide and 99 high, its
 * antenna's housing raised at its top left and its power button on its top at the right; a black
 * face with a square screen of 23 mm, not a touch screen; up and down on its left side, OK and
 * back on its right, each marked on the face beside the screen; the SOS under a red cap low on
 * its right side; and the cap of its charging port at its foot's left. Millimetres of the real
 * one.
 */
export class MessengerDrawing extends DeviceDrawing {
  /** The case, the antenna's housing, the face, the screen's frame and its glass. */
  private static readonly CASE: DrawnBox = { x: 4, y: 13, width: 52, height: 89 };
  private static readonly ANTENNA: DrawnBox = { x: 6, y: 3, width: 24, height: 14 };
  private static readonly FACE: DrawnBox = { x: 8, y: 18, width: 44, height: 80 };
  private static readonly FRAME: DrawnBox = { x: 15, y: 25, width: 30, height: 30 };
  private static readonly GLASS: DrawnBox = { x: 18.5, y: 28.5, width: 23, height: 23 };
  /** The side keys: their tops, and how far a key stands out of the case. */
  private static readonly SIDE_KEYS: readonly (readonly [name: string, side: -1 | 1, y: number])[] =
    [
      ["up", -1, 30],
      ["down", -1, 43],
      ["ok", 1, 30],
      ["back", 1, 43],
    ];
  private static readonly KEY = { height: 10, out: 1.6 };
  private static readonly SOS: DrawnBox = { x: 55, y: 68, width: 3.4, height: 15 };

  readonly name = "messenger";
  readonly width = 60;
  readonly height = 106;
  readonly screen = MessengerDrawing.GLASS;
  readonly controls: readonly DrawnControl[] = [
    { name: "antenna", kind: "part", box: { x: 6, y: 2, width: 24, height: 12 }, push: [0, 0] },
    { name: "power", kind: "part", box: { x: 40, y: 9, width: 10, height: 6 }, push: [0, 0] },
    ...MessengerDrawing.SIDE_KEYS.map(
      ([name, side, y]): DrawnControl => ({
        name,
        kind: "button",
        box: { x: side === -1 ? 0 : 50, y: y - 1, width: 10, height: 12 },
        push: [-side * 0.9, 0],
      }),
    ),
    { name: "sos", kind: "button", box: { x: 49, y: 66, width: 11, height: 19 }, push: [-0.8, 0] },
  ];

  protected gradients(): string {
    return [
      this.linear(
        "case",
        [
          [0, "#ff7a55"],
          [0.4, "#e2462a"],
          [1, "#a1260f"],
        ],
        [0, 0],
        [1, 0.6],
      ),
      this.linear(
        "face",
        [
          [0, "#2c2f35"],
          [1, "#121418"],
        ],
        [0, 0],
        [0.4, 1],
      ),
      this.linear("frame", [
        [0, "#1b1d21"],
        [1, "#060708"],
      ]),
      this.linear(
        "key",
        [
          [0, "#4b5058"],
          [1, "#1d1f23"],
        ],
        [0, 0],
        [1, 0],
      ),
      this.linear(
        "cap",
        [
          [0, "#ff5a48"],
          [1, "#a3150b"],
        ],
        [0, 0],
        [1, 1],
      ),
    ].join("");
  }

  protected parts(): string {
    return [
      this.antennaAndPower(),
      ...this.sideKeys(),
      this.sos(),
      this.messengerCase(),
      this.face(),
    ].join("");
  }

  /** The antenna's housing, raised at the top left, and the power button on the top at the
   * right. */
  private antennaAndPower(): string {
    const antenna = MessengerDrawing.ANTENNA;
    return `${this.rect(antenna, 6, this.paint("case"), 'stroke="#6d1607" stroke-width="0.4"')}<path d="M${antenna.x + 4} ${antenna.y + 2.2}H${antenna.x + antenna.width - 5}" stroke="#ffb59f" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>${this.rect({ x: 41, y: 10.5, width: 8, height: 3.5 }, 1.2, this.paint("key"), 'stroke="#0b0c0e" stroke-width="0.3"')}`;
  }

  /** Up and down on the left side, OK and back on the right, standing out of the case. */
  private sideKeys(): readonly string[] {
    const { height, out } = MessengerDrawing.KEY;
    const { x, width } = MessengerDrawing.CASE;
    return MessengerDrawing.SIDE_KEYS.map(([name, side, y]) => {
      const left = side === -1 ? x - out : x + width - 1.4;
      return this.cap(
        name,
        this.rect({ x: left, y, width: out + 1.4, height }, 1.2, this.paint("key"), 'stroke="#0b0c0e" stroke-width="0.3"'),
      );
    });
  }

  /** The SOS under its red cap, low on the right side. */
  private sos(): string {
    const box = MessengerDrawing.SOS;
    return this.cap(
      "sos",
      `${this.rect(box, 1.6, this.paint("cap"), 'stroke="#5e0c05" stroke-width="0.4"')}<path d="M${box.x + 1.1} ${box.y + 3}V${box.y + box.height - 3}" stroke="#ffb3a8" stroke-width="0.45" stroke-linecap="round" opacity="0.8"/>`,
    );
  }

  /** The case, lit down its left edge, with the charging port's cap at its foot's left. */
  private messengerCase(): string {
    const box = MessengerDrawing.CASE;
    return `${this.rect(box, 9, this.paint("case"), 'stroke="#6d1607" stroke-width="0.5"')}<path d="M${box.x + 1.6} ${box.y + 9}V${box.y + box.height - 9}" stroke="#ffb59f" stroke-width="0.7" stroke-linecap="round" opacity="0.5"/>${this.rect({ x: box.x + 0.8, y: box.y + box.height - 15, width: 3, height: 10 }, 1.2, "#7a1a0a")}`;
  }

  /** The black face, the screen's frame round its glass, and the keys' marks beside it: ▲ and
   * ▼ on the left, OK's tick and back's arrow on the right. */
  private face(): string {
    const frame = MessengerDrawing.FRAME;
    const mark = "#c9ced5";
    const marks = [
      `<path d="M11 35.5l1.8-2.6l1.8 2.6Z" fill="${mark}"/>`,
      `<path d="M11 46.5l1.8 2.6l1.8-2.6Z" fill="${mark}"/>`,
      `<path d="M45.6 35l1.3 1.4l2.4-2.8" fill="none" stroke="${mark}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<path d="M49 49.4h-2.6a1.6 1.6 0 0 1 0-3.2h1.6M47.4 45l-1.4 1.2l1.4 1.2" fill="none" stroke="${mark}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    ].join("");
    return `${this.rect(MessengerDrawing.FACE, 6, this.paint("face"), 'stroke="#050607" stroke-width="0.4"')}${this.rect(frame, 2.5, this.paint("frame"), 'stroke="#3a3e45" stroke-width="0.4"')}${marks}`;
  }
}
