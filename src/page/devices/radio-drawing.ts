import { DeviceDrawing } from "./device-drawing";
import type { DrawnBox, DrawnControl } from "./device-drawing";

/**
 * The handheld radio as the thing itself (#284), after a professional handheld of the kind
 * expeditions carry (gear.radio-handheld): a black case 55 mm wide and 130 high with its battery;
 * on its top the volume knob at the front left, the tall channel knob, the light, the orange
 * emergency button and the stubby antenna; down its left side a side button, the push-to-talk and
 * two more; on its face the speaker's grille, a small screen, its keys round a four-way pad, and
 * a keypad. Millimetres of the real one.
 */
export class RadioDrawing extends DeviceDrawing {
  /** The case, its face, the speaker's grille, the screen's frame and its glass, the keys' row
   * and the keypad, and the push-to-talk. */
  private static readonly CASE: DrawnBox = { x: 10, y: 72, width: 55, height: 130 };
  private static readonly FACE: DrawnBox = { x: 13, y: 76, width: 49, height: 122 };
  private static readonly GRILLE: DrawnBox = { x: 16, y: 79, width: 43, height: 33 };
  private static readonly FRAME: DrawnBox = { x: 16, y: 115, width: 43, height: 25 };
  private static readonly GLASS: DrawnBox = { x: 18, y: 117, width: 39, height: 21 };
  private static readonly KEYPAD: DrawnBox = { x: 16, y: 163, width: 43, height: 33 };
  private static readonly PTT: DrawnBox = { x: 5, y: 104, width: 5.6, height: 32 };
  /** The antenna's middle across, its top and its foot; the knobs, the light and the emergency
   * button along the top. */
  private static readonly ANTENNA = { x: 56, top: 7, foot: 72 };
  private static readonly VOLUME: DrawnBox = { x: 13, y: 64, width: 12, height: 8 };
  private static readonly CHANNEL: DrawnBox = { x: 26.5, y: 59, width: 10, height: 13 };
  private static readonly LED = { x: 38.6, y: 70.4 };
  private static readonly EMERGENCY: DrawnBox = { x: 41.5, y: 67, width: 7, height: 5 };

  readonly name = "radio";
  readonly width = 70;
  readonly height = 205;
  readonly screen = RadioDrawing.GLASS;
  readonly controls: readonly DrawnControl[] = [
    { name: "volume", kind: "part", box: { x: 12, y: 62, width: 13.5, height: 10 }, push: [0, 0] },
    { name: "channel", kind: "part", box: { x: 26, y: 57, width: 11, height: 15 }, push: [0, 0] },
    { name: "light", kind: "part", box: { x: 35.5, y: 66, width: 5.5, height: 6 }, push: [0, 0] },
    {
      name: "emergency",
      kind: "part",
      box: { x: 41.5, y: 64, width: 7, height: 8 },
      push: [0, 0],
    },
    { name: "antenna", kind: "part", box: { x: 49, y: 4, width: 14, height: 68 }, push: [0, 0] },
    { name: "ptt", kind: "part", box: { x: 2, y: 102, width: 10, height: 36 }, push: [0.9, 0] },
    { name: "speaker", kind: "part", box: RadioDrawing.GRILLE, push: [0, 0] },
    { name: "keypad", kind: "part", box: RadioDrawing.KEYPAD, push: [0, 0] },
  ];

  protected gradients(): string {
    return [
      this.linear(
        "case",
        [
          [0, "#3b4048"],
          [0.35, "#22262c"],
          [1, "#0c0e11"],
        ],
        [0, 0],
        [1, 0.4],
      ),
      this.linear(
        "face",
        [
          [0, "#2b2f36"],
          [1, "#15181c"],
        ],
        [0, 0],
        [0.3, 1],
      ),
      this.linear(
        "rubber",
        [
          [0, "#1a1c20"],
          [0.45, "#393d44"],
          [1, "#0f1013"],
        ],
        [0, 0],
        [1, 0],
      ),
      this.linear(
        "knurl",
        [
          [0, "#121418"],
          [0.4, "#4a4f57"],
          [0.6, "#2c3036"],
          [1, "#0b0c0e"],
        ],
        [0, 0],
        [1, 0],
      ),
      this.linear("frame", [
        [0, "#1d2025"],
        [1, "#050607"],
      ]),
      this.linear("key", [
        [0, "#4a4f57"],
        [1, "#24272d"],
      ]),
      this.linear(
        "orange",
        [
          [0, "#ffa04a"],
          [1, "#d2620f"],
        ],
        [0, 0],
        [1, 1],
      ),
      this.radial(
        "led",
        [
          [0, "#9aa0a8"],
          [1, "#2a2d33"],
        ],
        [0.35, 0.35],
        0.65,
      ),
      `<pattern id="${this.id("holes")}" width="3.4" height="3.2" patternUnits="userSpaceOnUse"><circle cx="1.7" cy="1.6" r="1" fill="#020203"/><circle cx="1.5" cy="1.4" r="0.5" fill="#0b0c0e"/></pattern>`,
    ].join("");
  }

  protected parts(): string {
    return [
      this.antenna(),
      this.top(),
      this.sideKeys(),
      this.radioCase(),
      this.face(),
      this.keys(),
    ].join("");
  }

  /** The stubby antenna, rubber over its coil, on a ribbed foot. */
  private antenna(): string {
    const { x, top, foot } = RadioDrawing.ANTENNA;
    const ribs = [0, 1, 2, 3]
      .map(
        (at) =>
          `<path d="M${x - 6} ${foot - 3 - at * 2.6}H${x + 6}" stroke="#08090b" stroke-width="0.6"/>`,
      )
      .join("");
    return `<path d="M${x - 4.4} ${foot - 12}L${x - 3.6} ${top + 3}Q${x} ${top - 1.6} ${x + 3.6} ${top + 3}L${x + 4.4} ${foot - 12}Z" fill="${this.paint("rubber")}"/><path d="M${x - 2.5} ${foot - 14}L${x - 2} ${top + 6}" stroke="#4c5159" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>${this.rect({ x: x - 6.5, y: foot - 14, width: 13, height: 14 }, 2, this.paint("knurl"))}${ribs}`;
  }

  /** Along the top: the volume knob and the channel knob, knurled; the light, dark until it
   * shows; the emergency button. */
  private top(): string {
    const knob = (box: DrawnBox): string => {
      const lines = Array.from({ length: Math.floor(box.width / 1.5) }, (_, at) => {
        const across = box.x + 0.75 + at * 1.5;
        return `<path d="M${DeviceDrawing.n(across)} ${box.y + 1}V${box.y + box.height}" stroke="#07080a" stroke-width="0.45"/>`;
      }).join("");
      return `${this.rect({ ...box, height: box.height + 1 }, 1.6, this.paint("knurl"))}${lines}${this.rect({ x: box.x + 0.6, y: box.y, width: box.width - 1.2, height: 1.3 }, 0.6, "#5b616a")}`;
    };
    const { x, y } = RadioDrawing.LED;
    const emergency = RadioDrawing.EMERGENCY;
    return `${knob(RadioDrawing.VOLUME)}${knob(RadioDrawing.CHANNEL)}<ellipse cx="${x}" cy="${y + 0.8}" rx="2.6" ry="1.4" fill="#08090b"/><circle class="radio__led" cx="${x}" cy="${y}" r="1.9" fill="${this.paint("led")}"/>${this.rect({ ...emergency, height: emergency.height + 1 }, 1.4, this.paint("orange"), 'stroke="#7a3606" stroke-width="0.3"')}`;
  }

  /** Down the left side: a side button, the push-to-talk, ribbed, and two side buttons below. */
  private sideKeys(): string {
    const ptt = RadioDrawing.PTT;
    const ribs = Array.from({ length: 11 }, (_, at) => {
      const y = ptt.y + 3 + at * 2.6;
      return `<path d="M${ptt.x + 0.8} ${y}H${ptt.x + ptt.width}" stroke="#07080a" stroke-width="0.5"/>`;
    }).join("");
    const key = (y: number): string =>
      this.rect({ x: ptt.x + 0.7, y, width: ptt.width - 0.7, height: 7.5 }, 1.8, this.paint("rubber"));
    return `${key(ptt.y - 11)}${key(ptt.y + ptt.height + 3.5)}${key(ptt.y + ptt.height + 13.5)}${this.cap("ptt", `${this.rect(ptt, 2.4, this.paint("rubber"))}${ribs}`)}`;
  }

  /** The case, lit down its left edge, and the battery's seam showing at its sides. */
  private radioCase(): string {
    const box = RadioDrawing.CASE;
    return `${this.rect(box, 7, this.paint("case"), 'stroke="#050607" stroke-width="0.5"')}<path d="M${box.x + 0.4} ${box.y + 92}h2.5M${box.x + box.width - 2.9} ${box.y + 92}h2.5" stroke="#050607" stroke-width="0.6"/><path d="M${box.x + 2} ${box.y + 4}V${box.y + box.height - 6}" stroke="#5a606a" stroke-width="0.6" stroke-linecap="round" opacity="0.6"/>`;
  }

  /** The face: the speaker's grille, holes in rows, and the screen's glossy frame. */
  private face(): string {
    const grille = RadioDrawing.GRILLE;
    return `${this.rect(RadioDrawing.FACE, 5, this.paint("face"))}${this.rect(grille, 5, "#191c20")}${this.rect({ x: grille.x + 1.2, y: grille.y + 1.2, width: grille.width - 2.4, height: grille.height - 2.4 }, 4, this.paint("holes"))}${this.rect(RadioDrawing.FRAME, 3, this.paint("frame"), 'stroke="#3b4048" stroke-width="0.4"')}`;
  }

  /** Under the screen, two keys each side of the four-way pad with its OK, and the keypad. */
  private keys(): string {
    const small = (x: number, y: number): string =>
      this.rect({ x, y, width: 8, height: 5.5 }, 1.6, this.paint("key"), 'stroke="#0b0c0e" stroke-width="0.3"');
    const pad = `<circle cx="37.5" cy="151" r="8" fill="${this.paint("key")}" stroke="#0b0c0e" stroke-width="0.35"/><circle cx="37.5" cy="151" r="3.6" fill="#2f333a" stroke="#0b0c0e" stroke-width="0.35"/>${[0, 90, 180, 270]
      .map(
        (turn) =>
          `<path d="M37.5 144.6l1.1 1.4h-2.2z" fill="#0b0c0e" transform="rotate(${turn} 37.5 151)"/>`,
      )
      .join("")}`;
    const { x, y } = RadioDrawing.KEYPAD;
    const keypad: string[] = [];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        keypad.push(
          this.rect(
            { x: x + 1.5 + column * 14.5, y: y + 1 + row * 8.2, width: 11, height: 6.2 },
            1.8,
            this.paint("key"),
            'stroke="#0b0c0e" stroke-width="0.3"',
          ),
        );
      }
    }
    return `${small(16, 144)}${small(16, 153.5)}${small(51, 144)}${small(51, 153.5)}${pad}${keypad.join("")}`;
  }
}
