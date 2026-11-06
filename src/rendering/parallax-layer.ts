import { Container } from "pixi.js";

import type { Camera } from "./camera";
import { Perspective } from "./perspective";

/** How much a layer moves with the camera, across and up, at the standard view: 1 is the slope's
 * own, less for what's far behind it, more for what's in front, and 0 stays on the screen. */
export interface Depth {
  readonly x: number;
  readonly y: number;
}

/**
 * One layer of the picture: a container drawn once, in metres with y up, that the camera places
 * each frame, scaled to its pixels a metre and moved by the layer's depth. A layer behind the
 * slope is seen in perspective: as the view widens it moves more of the slope's way and is drawn
 * larger than the slope's metres, so its mountains keep most of their size (`Perspective`). A
 * layer that lives in screen space, such as the sky, places itself.
 */
export abstract class ParallaxLayer extends Container {
  private readonly perspective: Perspective;

  protected constructor(
    label: string,
    readonly depth: Depth,
  ) {
    super({ label });
    this.perspective = new Perspective(depth.x);
  }

  /** Puts the layer where the camera sees it this frame. */
  place(camera: Camera): void {
    const { anchor, position, metresHigh } = camera;
    const metres = camera.pixelsPerMetre;
    const size = this.perspective.scale(metresHigh) * metres;
    this.position.set(
      anchor.x - position.x * this.perspective.share(metresHigh) * metres,
      anchor.y + position.y * this.depth.y * size,
    );
    this.scale.set(size, -size);
  }
}
