/** A box of a device's drawing, in its own units: its screen, or a control. */
export interface DrawnBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A control as drawn on its device: its name among the device's controls; whether the player
 * presses it, or it's a part named only, a knob or a light; the box a finger presses; and how far
 * its cap gives under the finger, across and down, in the drawing's units. */
export interface DrawnControl {
  readonly name: string;
  readonly kind: "button" | "part";
  readonly box: DrawnBox;
  readonly push: readonly [x: number, y: number];
}

/** A colour stop of a gradient: where along it, and the colour. */
type Stop = readonly [offset: number, colour: string];

/**
 * A device drawn as the thing itself (#284), in SVG in millimetres of the real one: its case
 * shaded from a light above and to the left, as the tent's things are (`TentArt`), its screen's
 * glass, and its controls, each cap in a group of its own that the page sinks while it's held.
 * A subclass draws one device; the page lays the screen's readings and the controls' buttons over
 * the boxes it gives (`DeviceFace`), so the drawing itself holds no words.
 */
export abstract class DeviceDrawing {
  /** The device's name, which its gradients' ids start with, so two drawings share a page. */
  abstract readonly name: string;
  abstract readonly width: number;
  abstract readonly height: number;
  /** Where its screen's glass is: what the page fills with the readings. */
  abstract readonly screen: DrawnBox;
  abstract readonly controls: readonly DrawnControl[];

  /** The drawing as an SVG of its own, hidden from screen readers: the buttons laid over it
   * carry the names. */
  svg(): string {
    const { width, height } = this;
    return `<svg class="device__drawing" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs>${this.gradients()}</defs>${this.parts()}</svg>`;
  }

  /** A box as shares of the drawing, in per cent: where the page lays what goes over it. */
  share(box: DrawnBox): {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  } {
    return {
      left: (box.x / this.width) * 100,
      top: (box.y / this.height) * 100,
      width: (box.width / this.width) * 100,
      height: (box.height / this.height) * 100,
    };
  }

  /** The control called `name`. */
  control(name: string): DrawnControl {
    const control = this.controls.find((each) => each.name === name);
    if (control === undefined) {
      throw new RangeError(`The ${this.name} has no control called ${name}`);
    }
    return control;
  }

  /** Everything drawn, back to front. */
  protected abstract parts(): string;

  /** The gradients the parts are shaded with. */
  protected abstract gradients(): string;

  /** A gradient's id on the page, and the paint that uses it. */
  protected id(gradient: string): string {
    return `${this.name}-${gradient}`;
  }

  protected paint(gradient: string): string {
    return `url(#${this.id(gradient)})`;
  }

  /** A gradient from one point of its box to another, as shares of it. */
  protected linear(
    gradient: string,
    stops: readonly Stop[],
    from: readonly [number, number] = [0, 0],
    to: readonly [number, number] = [0, 1],
  ): string {
    return `<linearGradient id="${this.id(gradient)}" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">${DeviceDrawing.stops(stops)}</linearGradient>`;
  }

  /** A gradient out from a point of its box, as shares of it. */
  protected radial(
    gradient: string,
    stops: readonly Stop[],
    centre: readonly [number, number] = [0.5, 0.5],
    radius = 0.5,
  ): string {
    return `<radialGradient id="${this.id(gradient)}" cx="${centre[0]}" cy="${centre[1]}" r="${radius}">${DeviceDrawing.stops(stops)}</radialGradient>`;
  }

  /** A rectangle with rounded corners, filled with `fill` and drawn with `extra` attributes. */
  protected rect(box: DrawnBox, radius: number, fill: string, extra = ""): string {
    const { x, y, width, height } = box;
    return `<rect x="${DeviceDrawing.n(x)}" y="${DeviceDrawing.n(y)}" width="${DeviceDrawing.n(width)}" height="${DeviceDrawing.n(height)}" rx="${DeviceDrawing.n(radius)}" fill="${fill}"${extra === "" ? "" : ` ${extra}`}/>`;
  }

  /** A control's cap, in the group the page sinks while it's held. */
  protected cap(name: string, inner: string): string {
    const [x, y] = this.control(name).push;
    return `<g class="cap" data-cap="${name}" style="--push-x:${x}px;--push-y:${y}px">${inner}</g>`;
  }

  /** A number for the markup, short. */
  protected static n(value: number): string {
    return String(Math.round(value * 100) / 100);
  }

  private static stops(stops: readonly Stop[]): string {
    return stops
      .map(([offset, colour]) => `<stop offset="${offset}" stop-color="${colour}"/>`)
      .join("");
  }
}
