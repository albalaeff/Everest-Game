import { Container } from "pixi.js";

import type { Camera } from "./camera";

/** How much a layer moves with the camera, across and up: 1 is the slope's own, less for what's
 * far behind it, more for what's in front, and 0 stays on the screen. */
export interface Depth {
  readonly x: number;
  readonly y: number;
}

/**
 * One layer of the picture: a container drawn once, in metres with y up, that the camera places
 * each frame, scaled to its pixels a metre and moved by the layer's depth. A layer that lives in
 * screen space, such as the sky, places itself.
 */
export abstract class ParallaxLayer extends Container {
  protected constructor(
    label: string,
    readonly depth: Depth,
  ) {
    super({ label });
  }

  /** Puts the layer where the camera sees it this frame. */
  place(camera: Camera): void {
    const metres = camera.pixelsPerMetre;
    const { anchor, position } = camera;
    this.position.set(
      anchor.x - position.x * this.depth.x * metres,
      anchor.y + position.y * this.depth.y * metres,
    );
    this.scale.set(metres, -metres);
  }
}
