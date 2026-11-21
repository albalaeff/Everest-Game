import { describe, expect, it } from "vitest";
import type { DeviceDrawing, DrawnBox } from "./device-drawing";
import { MessengerDrawing } from "./messenger-drawing";
import { MeterDrawing } from "./meter-drawing";
import { RadioDrawing } from "./radio-drawing";
import { WatchDrawing } from "./watch-drawing";

/** Whether a box lies within the drawing. */
const inside = (drawing: DeviceDrawing, box: DrawnBox): boolean =>
  box.x >= 0 &&
  box.y >= 0 &&
  box.x + box.width <= drawing.width &&
  box.y + box.height <= drawing.height;

/** Whether two boxes overlap. */
const overlap = (a: DrawnBox, b: DrawnBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const DRAWINGS: readonly DeviceDrawing[] = [
  new RadioDrawing(),
  new WatchDrawing(),
  new MeterDrawing(),
  new MessengerDrawing(),
];

describe.each(DRAWINGS.map((drawing) => [drawing.name, drawing] as const))(
  "the %s drawn as the thing itself (#284)",
  (_name, drawing) => {
    it("lays its screen and every control within the drawing, no two buttons on one spot", () => {
      expect(inside(drawing, drawing.screen)).toBe(true);
      for (const control of drawing.controls) {
        expect(inside(drawing, control.box), control.name).toBe(true);
      }
      const buttons = drawing.controls.filter(({ kind }) => kind === "button");
      for (const [at, button] of buttons.entries()) {
        for (const other of buttons.slice(at + 1)) {
          expect(overlap(button.box, other.box), `${button.name} and ${other.name}`).toBe(false);
        }
      }
    });

    it("draws a cap for each control, which the page sinks while it's held", () => {
      const svg = drawing.svg();
      for (const control of drawing.controls.filter(({ kind }) => kind === "button")) {
        expect(svg, control.name).toContain(`data-cap="${control.name}"`);
      }
    });

    it("names its gradients after itself, so the four drawings share a page, and holds no words", () => {
      const svg = drawing.svg();
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id ?? "");
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(id.startsWith(`${drawing.name}-`), id).toBe(true);
      }
      expect(new Set(ids).size).toBe(ids.length);
      for (const [, paint] of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(ids, paint).toContain(paint);
      }
      expect(svg).not.toMatch(/<text/);
    });

    it("gives the page each box as shares of the drawing, to lay its readings and buttons over", () => {
      const { left, top, width, height } = drawing.share(drawing.screen);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(100);
      expect(top + height).toBeLessThanOrEqual(100);
    });
  },
);

describe("WatchDrawing: an outdoor GPS watch (gear.watch-buttons)", () => {
  const watch = new WatchDrawing();
  const middle = (name: string): number => {
    const { box } = watch.control(name);
    return box.x + box.width / 2;
  };

  it("has light, up and down on the left of its case, and start and back on the right", () => {
    const centre = watch.screen.x + watch.screen.width / 2;
    for (const name of ["light", "up", "down"]) {
      expect(middle(name), name).toBeLessThan(centre);
    }
    for (const name of ["start", "back"]) {
      expect(middle(name), name).toBeGreaterThan(centre);
    }
    const top = (name: string): number => watch.control(name).box.y;
    expect(top("light")).toBeLessThan(top("up"));
    expect(top("up")).toBeLessThan(top("down"));
    expect(top("start")).toBeLessThan(top("back"));
  });

  it("sinks each button into the case, towards its middle", () => {
    const centre = watch.screen.x + watch.screen.width / 2;
    for (const control of watch.controls) {
      const [across] = control.push;
      const fromMiddle = control.box.x + control.box.width / 2 - centre;
      expect(Math.sign(across), control.name).toBe(-Math.sign(fromMiddle));
    }
  });

  it("has a round screen of 33 mm in a case of 47", () => {
    expect(watch.screen.width).toBe(33);
    expect(watch.screen.height).toBe(33);
  });
});

describe("MeterDrawing: a pocket weather meter (gear.wind-meter-layout)", () => {
  const meter = new MeterDrawing();

  it("has its three buttons in a row under the screen, ◄ ◐ ►", () => {
    const [left, power, right] = ["left", "power", "right"].map((name) => meter.control(name).box);
    const screenFoot = meter.screen.y + meter.screen.height;
    for (const box of [left, power, right]) {
      expect(box?.y).toBeGreaterThan(screenFoot);
    }
    expect(left?.x).toBeLessThan(power?.x ?? 0);
    expect(power?.x).toBeLessThan(right?.x ?? 0);
  });

  it("turns its impeller over the screen, and reads the air at its left", () => {
    const impeller = meter.control("impeller").box;
    const thermometer = meter.control("thermometer").box;

    expect(impeller.y + impeller.height).toBeLessThanOrEqual(meter.screen.y);
    expect(thermometer.x).toBeLessThan(meter.screen.x);
  });
});

describe("MessengerDrawing: a palm-sized satellite messenger (gear.messenger-layout)", () => {
  const messenger = new MessengerDrawing();
  const middle = (name: string): number => {
    const { box } = messenger.control(name);
    return box.x + box.width / 2;
  };
  const centre = messenger.screen.x + messenger.screen.width / 2;

  it("has up over down on its left side, OK over back on its right, and the SOS low on its right", () => {
    expect(middle("up")).toBeLessThan(centre);
    expect(middle("down")).toBeLessThan(centre);
    expect(middle("ok")).toBeGreaterThan(centre);
    expect(middle("back")).toBeGreaterThan(centre);
    expect(messenger.control("up").box.y).toBeLessThan(messenger.control("down").box.y);
    expect(messenger.control("ok").box.y).toBeLessThan(messenger.control("back").box.y);
    expect(middle("sos")).toBeGreaterThan(centre);
    expect(messenger.control("sos").box.y).toBeGreaterThan(messenger.control("back").box.y);
  });

  it("has a square screen of 23 mm, and its antenna at its top left", () => {
    expect(messenger.screen.width).toBe(23);
    expect(messenger.screen.height).toBe(23);
    expect(middle("antenna")).toBeLessThan(centre);
    expect(messenger.control("antenna").box.y).toBeLessThan(messenger.screen.y);
  });
});
