import { Graphics } from "pixi.js";

import type { Terrain } from "../physics";
import type { Camera } from "./camera";
import type { Depth } from "./parallax-layer";
import { ParallaxLayer } from "./parallax-layer";
import { Skyline } from "./skyline";
import { Zoom } from "./zoom";

/** How a silhouette looks: its depth, how far above the ground's height its line runs, how fine
 * its peaks are, and its colour. A layer that would hide the slope zoomed out fades out between
 * two of the camera's metres high. */
export interface SkylineStyle {
  readonly label: string;
  readonly depth: Depth;
  readonly step: number;
  readonly low: number;
  readonly high: number;
  readonly colour: number;
  readonly alpha: number;
  readonly fadesOut?: { readonly from: number; readonly to: number };
}

/**
 * A silhouette behind the slope, or the ice in front of it: a skyline filled down from its line,
 * built once over the whole section at the layer's depth. Its line rises from the ground's height
 * at that depth, so under the climber it stays as high above them however far the section climbs;
 * away from them it rises and falls with the ground ahead and behind, at the depth's share of its
 * steepness, which is why a far layer's vertical depth is next to nothing. The shapes stand in for
 * the real peaks until the final style (#86).
 */
export class SkylineLayer extends ParallaxLayer {
  static readonly FAR_RANGES: SkylineStyle = {
    label: "far-ranges",
    depth: { x: 0.1, y: 0 },
    step: 6,
    low: 6,
    high: 11,
    colour: 0x7d9cc7,
    alpha: 1,
  };
  static readonly PEAKS: SkylineStyle = {
    label: "peaks",
    depth: { x: 0.25, y: 0.02 },
    step: 4,
    low: 3,
    high: 7,
    colour: 0x5577a8,
    alpha: 1,
  };
  static readonly NEAR_RIDGE: SkylineStyle = {
    label: "near-ridge",
    depth: { x: 0.5, y: 0.1 },
    step: 2.5,
    low: 1,
    high: 4,
    colour: 0xc3d4e8,
    alpha: 1,
  };
  /** The ice in front, along the bottom of the screen: zoomed out, it would cover half of it. */
  static readonly FOREGROUND: SkylineStyle = {
    label: "foreground",
    depth: { x: 1.5, y: 1.5 },
    step: 1.5,
    low: -7,
    high: -4,
    colour: 0x9bb8da,
    alpha: 0.9,
    fadesOut: { from: Zoom.STANDARD.metresHigh, to: Zoom.FAR.metresHigh },
  };
  /** Past the section's ends, so the widest screen never sees the layer's edge, at 100 m too. */
  private static readonly MARGIN_METRES = 300;
  /** How far down the fill goes below the line's lowest point. */
  private static readonly BELOW_METRES = 400;

  private readonly fadesOut: SkylineStyle["fadesOut"];

  constructor(style: SkylineStyle, terrain: Terrain, seed: number) {
    super(style.label, style.depth);
    this.fadesOut = style.fadesOut;
    const { depth } = style;
    const first = terrain.points[0]?.[0] ?? 0;
    const last = terrain.points.at(-1)?.[0] ?? 0;
    const from = first * depth.x - SkylineLayer.MARGIN_METRES;
    const to = last * depth.x + SkylineLayer.MARGIN_METRES;
    const skyline = new Skyline({
      from,
      to,
      step: style.step,
      low: style.low,
      high: style.high,
      base: (x) => depth.y * terrain.height(x / depth.x),
      seed,
    });
    const bottom = Math.min(...skyline.points.map(({ y }) => y)) - SkylineLayer.BELOW_METRES;
    const outline = skyline.points.flatMap(({ x, y }) => [x, y]);
    const graphics = new Graphics()
      .poly([from, bottom, ...outline, to, bottom])
      .fill({ color: style.colour, alpha: style.alpha });
    this.addChild(graphics);
  }

  /** Placed as every layer is, and faded as far as the camera's zoom asks. */
  override place(camera: Camera): void {
    super.place(camera);
    const { fadesOut } = this;
    if (fadesOut !== undefined) {
      const share = (fadesOut.to - camera.metresHigh) / (fadesOut.to - fadesOut.from);
      this.alpha = Math.min(Math.max(share, 0), 1);
      this.visible = this.alpha > 0;
    }
  }
}
