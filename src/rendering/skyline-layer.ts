import { FillGradient, Graphics } from "pixi.js";

import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import type { Atmosphere } from "./atmosphere";
import type { Camera } from "./camera";
import { CloudSea } from "./cloud-sea";
import { Drift } from "./drift";
import { MountainFaces } from "./mountain-faces";
import type { Massif } from "./mountain-faces";
import { Palette } from "./palette";
import type { Depth } from "./parallax-layer";
import { ParallaxLayer } from "./parallax-layer";
import { Zoom } from "./zoom";

/** What a background layer shows: its depth, how far above the ground's height its ridge runs,
 * how fine its line is, the massifs that rise over the ridge, and how far into the haze it stands.
 * A layer that would hide the slope zoomed out fades out between two of the camera's metres high;
 * the farthest has the sea of clouds below its peaks, and one has the summit's plume. */
export interface SkylineStyle {
  readonly label: string;
  readonly depth: Depth;
  readonly step: number;
  readonly low: number;
  readonly high: number;
  readonly massifs: readonly Massif[];
  /** How far into the air's haze the layer stands, 0 the slope's own to 1 lost in it, in clear
   * weather; the weather's haze adds to it. */
  readonly haze: number;
  /** Whether the layer is ice, the seracs around the slope, rather than a far snow face. */
  readonly ice: boolean;
  readonly alpha: number;
  readonly fadesOut?: { readonly from: number; readonly to: number };
  readonly cloudSea?: { readonly height: number };
  /** The plume blown off a summit: which massif's, and how long it streams. */
  readonly plume?: { readonly massif: string; readonly length: number };
}

/**
 * A range behind the slope, or the ice in front of it: the faces of named massifs over a ridge,
 * built once over the whole section at the layer's depth, with their flutings, their rock bands
 * and the crests the alpenglow lights, the sea of clouds in the valley under the farthest, and the
 * plume off the summit. The ridge rises from the ground's height at that depth, so under the
 * climber it stays as high above them however far the section climbs; away from them it rises
 * and falls with the ground ahead and behind, at the depth's share of its steepness, which is
 * why a far layer's vertical depth is next to nothing. The shapes are drawn white and tinted each
 * frame by the hour's light and the weather's haze.
 */
export class SkylineLayer extends ParallaxLayer {
  /** The Khumbu's skyline from the Icefall, left to right in each layer's metres: Pumori and its
   * neighbours across the valley behind, the West Shoulder and Nuptse's fluted wall nearer, and
   * the Icefall's own seracs around the slope. */
  static readonly FAR_RANGES: SkylineStyle = {
    label: "far-ranges",
    depth: { x: 0.1, y: 0 },
    step: 6,
    low: 6,
    high: 11,
    massifs: [
      { name: "Pumori", summit: -120, halfWidth: 110, height: 34, shape: 0.8, bands: [0.55] },
      { name: "Lingtren", summit: 40, halfWidth: 90, height: 22, shape: 1.1, bands: [] },
      { name: "Khumbutse", summit: 190, halfWidth: 100, height: 26, shape: 0.95, bands: [0.4] },
    ],
    haze: 0.6,
    ice: false,
    alpha: 1,
    cloudSea: { height: -2 },
  };
  static readonly PEAKS: SkylineStyle = {
    label: "peaks",
    depth: { x: 0.25, y: 0.02 },
    step: 4,
    low: 3,
    high: 7,
    massifs: [
      { name: "West Shoulder", summit: -60, halfWidth: 150, height: 30, shape: 1.6, bands: [] },
      { name: "Nuptse", summit: 220, halfWidth: 170, height: 48, shape: 0.85, bands: [0.35, 0.6] },
    ],
    haze: 0.35,
    ice: false,
    alpha: 1,
    plume: { massif: "Nuptse", length: 40 },
  };
  static readonly NEAR_RIDGE: SkylineStyle = {
    label: "near-ridge",
    depth: { x: 0.5, y: 0.1 },
    step: 2.5,
    low: 1,
    high: 4,
    massifs: [
      { name: "serac", summit: -40, halfWidth: 30, height: 8, shape: 0.5, bands: [] },
      { name: "serac", summit: 70, halfWidth: 24, height: 6, shape: 0.4, bands: [] },
      { name: "serac", summit: 160, halfWidth: 36, height: 9, shape: 0.6, bands: [] },
    ],
    haze: 0.12,
    ice: true,
    alpha: 1,
  };
  /** The ice in front, along the bottom of the screen: zoomed out, it would cover half of it. */
  static readonly FOREGROUND: SkylineStyle = {
    label: "foreground",
    depth: { x: 1.5, y: 1.5 },
    step: 1.5,
    low: -7,
    high: -4,
    massifs: [],
    haze: 0,
    ice: true,
    alpha: 0.9,
    fadesOut: { from: Zoom.STANDARD.metresHigh, to: Zoom.FAR.metresHigh },
  };
  /** Past the section's ends, so the widest screen never sees the layer's edge, at 100 m too. */
  private static readonly MARGIN_METRES = 300;
  /** How far down the fill goes below the line's lowest point. */
  private static readonly BELOW_METRES = 400;
  /** The flutings: how wide, in the layer's metres, and how strong; the rock bands' strength. */
  private static readonly FLUTING_METRES = 0.12;
  private static readonly FLUTING_ALPHA = 0.3;
  private static readonly BAND_ALPHA = 0.85;
  /** The crests the glow lights: how deep under the skyline, and where a massif is high enough. */
  private static readonly CREST_DEPTH = 3;
  private static readonly CREST_SHARE = 0.5;
  private static readonly CREST_ALPHA = 0.7;
  /** The ice's edge: a brighter line along the seracs' tops, and how far towards white it is by
   * day. */
  private static readonly ICE_EDGE_METRES = 0.3;
  private static readonly ICE_EDGE_LIGHT = 0.5;
  /** The plume: its motes, how high over the summit they ride and how big they are, and from
   * what gust it shows. */
  private static readonly PLUME_MOTES = 60;
  private static readonly PLUME_FROM_GUST = 0.1;
  private static readonly PLUME_SIZE = { min: 0.8, max: 2.2 };
  private static readonly PLUME_ALPHA = 0.6;
  private static readonly CLOUD_SEA_PUFF = { min: 6, max: 16 };
  private static readonly CLOUD_SEA_ALPHA = 0.92;

  private readonly style: SkylineStyle;
  private readonly faces: MountainFaces;
  private readonly fill = new Graphics();
  private readonly crests = new Graphics();
  private readonly flutings = new Graphics();
  private readonly bands = new Graphics();
  private readonly edge = new Graphics();
  private readonly cloudSea = new Graphics();
  private readonly plume: Drift | null;
  private readonly plumeGraphics = new Graphics();
  private tintedWith: Atmosphere | null = null;

  constructor(style: SkylineStyle, terrain: Terrain, seed: number) {
    super(style.label, style.depth);
    this.style = style;
    const { depth } = style;
    const first = terrain.points[0]?.[0] ?? 0;
    const last = terrain.points.at(-1)?.[0] ?? 0;
    const from = first * depth.x - SkylineLayer.MARGIN_METRES;
    const to = last * depth.x + SkylineLayer.MARGIN_METRES;
    const base = (x: number): number => depth.y * terrain.height(x / depth.x);
    this.faces = new MountainFaces({
      from,
      to,
      step: style.step,
      massifs: style.massifs,
      low: style.low,
      high: style.high,
      base,
      seed,
    });
    this.drawFaces(from, to);
    const plume = style.plume;
    const summit = style.massifs.find(({ name }) => name === plume?.massif);
    if (plume !== undefined && summit !== undefined) {
      const foot: Point = { x: summit.summit, y: this.faces.top(summit.summit) };
      this.plume = new Drift(
        {
          count: SkylineLayer.PLUME_MOTES,
          from: 0,
          to: plume.length,
          height: { min: -1, max: summit.height * 0.25 },
          size: SkylineLayer.PLUME_SIZE,
          speed: { min: plume.length / 6, max: plume.length / 2 },
        },
        SeededRandom.fromSeed(seed + 1),
      );
      this.plumeGraphics.position.set(foot.x, foot.y);
    } else {
      this.plume = null;
    }
    if (style.cloudSea !== undefined) {
      const sea = new CloudSea({
        from,
        to,
        step: style.step,
        height: style.cloudSea.height,
        puff: SkylineLayer.CLOUD_SEA_PUFF,
        seed: seed + 2,
      });
      const bottom = style.cloudSea.height - SkylineLayer.BELOW_METRES;
      this.cloudSea
        .poly([from, bottom, ...sea.outline.flatMap(({ x, y }) => [x, y]), to, bottom])
        .fill({ color: 0xffffff, alpha: SkylineLayer.CLOUD_SEA_ALPHA });
    }
    this.addChild(
      this.fill,
      this.crests,
      this.flutings,
      this.bands,
      this.edge,
      this.plumeGraphics,
      this.cloudSea,
    );
    this.alpha = style.alpha;
  }

  /** Placed as every layer is, and faded as far as the camera's zoom asks. */
  override place(camera: Camera): void {
    super.place(camera);
    const { fadesOut, alpha } = this.style;
    if (fadesOut !== undefined) {
      const share = (fadesOut.to - camera.metresHigh) / (fadesOut.to - fadesOut.from);
      this.alpha = Math.min(Math.max(share, 0), 1) * alpha;
      this.visible = this.alpha > 0;
    }
  }

  /** The layer in this frame's light and air: its colours mixed from the palette and faded into
   * the haze by its depth and the weather, the crests lit by the glow, the plume blown by the
   * gust. */
  light(atmosphere: Atmosphere, seconds: number): void {
    const { palette, light, look, gust, elapsed } = atmosphere;
    if (
      this.tintedWith === null ||
      atmosphere.recoloured(this.tintedWith) ||
      look !== this.tintedWith.look
    ) {
      const haze = Math.min(1, this.style.haze + look.haze * (0.3 + this.style.haze));
      const body = this.style.ice ? palette.ice : palette.face;
      this.fill.tint = palette.faded(body, haze);
      this.flutings.tint = palette.faded(palette.fluting, haze);
      this.bands.tint = palette.faded(palette.rock, haze);
      // The seracs' tops catch the light: barely under the stars, brightly by day.
      const edgeLight = SkylineLayer.ICE_EDGE_LIGHT * (0.1 + 0.9 * light.daylight);
      this.edge.tint = palette.faded(Palette.mix(palette.ice, 0xffffff, edgeLight), haze);
      this.cloudSea.tint = palette.faded(palette.cloud, haze * 0.5);
      this.crests.tint = palette.glow;
      this.plumeGraphics.tint = palette.faded(palette.fluting, haze);
    }
    this.tintedWith = atmosphere;
    this.crests.alpha = light.glow * SkylineLayer.CREST_ALPHA;
    this.crests.visible = this.crests.alpha > 0.01;
    if (this.plume !== null) {
      const strength = Math.max(
        0,
        (gust - SkylineLayer.PLUME_FROM_GUST) / (1 - SkylineLayer.PLUME_FROM_GUST),
      );
      this.plumeGraphics.visible = strength > 0;
      if (this.plumeGraphics.visible) {
        this.plume.blow(seconds, gust, () => 0, elapsed);
        this.drawPlume(strength);
      }
    }
  }

  private drawFaces(from: number, to: number): void {
    const { outline, flutings, bands } = this.faces;
    const bottom = Math.min(...outline.map(({ y }) => y)) - SkylineLayer.BELOW_METRES;
    this.fill
      .poly([from, bottom, ...outline.flatMap(({ x, y }) => [x, y]), to, bottom])
      .fill(0xffffff);
    // The glow lights a crest from its top down, fading out as it goes: the layer's y is up, so
    // the gradient's first stop is the crest's foot.
    for (const crest of this.faces.crests(SkylineLayer.CREST_DEPTH, SkylineLayer.CREST_SHARE)) {
      this.crests.poly(crest.flatMap(({ x, y }) => [x, y])).fill(
        new FillGradient({
          type: "linear",
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: Palette.css(0xffffff, 0) },
            { offset: 0.5, color: Palette.css(0xffffff, 0.45) },
            { offset: 1, color: Palette.css(0xffffff, 1) },
          ],
          textureSpace: "local",
        }),
      );
    }
    for (const { top, foot } of flutings) {
      this.flutings.moveTo(top.x, top.y).lineTo(foot.x, foot.y);
    }
    this.flutings.stroke({
      width: SkylineLayer.FLUTING_METRES * this.style.step,
      color: 0xffffff,
      alpha: SkylineLayer.FLUTING_ALPHA,
      cap: "round",
    });
    for (const band of bands) {
      this.bands
        .poly(band.flatMap(({ x, y }) => [x, y]))
        .fill({ color: 0xffffff, alpha: SkylineLayer.BAND_ALPHA });
    }
    if (this.style.ice) {
      const [first, ...rest] = outline;
      if (first !== undefined) {
        this.edge.moveTo(first.x, first.y);
        for (const { x, y } of rest) {
          this.edge.lineTo(x, y);
        }
        this.edge.stroke({ width: SkylineLayer.ICE_EDGE_METRES, color: 0xffffff, join: "round" });
      }
    }
  }

  /** The plume's motes, from the summit downwind, thinning as they stream away from it. */
  private drawPlume(strength: number): void {
    const { plume } = this;
    const length = this.style.plume?.length ?? 1;
    if (plume === null) {
      return;
    }
    this.plumeGraphics.clear();
    for (const mote of plume.motes) {
      const alpha = strength * (1 - mote.x / length) * SkylineLayer.PLUME_ALPHA;
      this.plumeGraphics.circle(mote.x, mote.y, mote.size).fill({ color: 0xffffff, alpha });
    }
  }
}
