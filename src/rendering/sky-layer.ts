import { FillGradient, Graphics } from "pixi.js";

import type { Camera, ScreenSize } from "./camera";
import { ParallaxLayer } from "./parallax-layer";

/** The sky: a gradient, deep blue above, filling the screen, which it stays on. */
export class SkyLayer extends ParallaxLayer {
  private static readonly TOP = "#0b1d3a";
  private static readonly BOTTOM = "#6f94c6";

  private readonly graphics = new Graphics();
  /** The screen it was last drawn for. */
  private drawnFor: ScreenSize = { width: 0, height: 0 };

  constructor() {
    super("sky", { x: 0, y: 0 });
    this.addChild(this.graphics);
  }

  override place(camera: Camera): void {
    const { width, height } = camera.screen;
    if (width === this.drawnFor.width && height === this.drawnFor.height) {
      return;
    }
    this.drawnFor = { width, height };
    const gradient = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: SkyLayer.TOP },
        { offset: 1, color: SkyLayer.BOTTOM },
      ],
      textureSpace: "local",
    });
    this.graphics.clear().rect(0, 0, width, height).fill(gradient);
  }
}
