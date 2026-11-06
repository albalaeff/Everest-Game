import { Container, FillGradient, Graphics } from "pixi.js";

import type { Terrain } from "../physics";
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
import { Plume } from "./plume";
import { Zoom } from "./zoom";

/** What a background layer shows: its depth, how far above the ground's height its ridge runs,
 * how fine its line is, the massifs that rise over the ridge, and how far into the haze it stands.
 * A layer that would hide the slope zoomed out fades out between two of the camera's metres high;
 * the farthest has the sea of clouds in rows below its peaks, and the peaks the plumes off their
 * summits and the fog banks drifting across them. */
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
  /** The sea of clouds: how high over the ridge's base its nearest row lies, and how many rows. */
  readonly cloudSea?: { readonly height: number; readonly rows: number };
  /** The plumes blown off summits: which massif's, and how long each streams in a gale. */
  readonly plumes?: readonly { readonly massif: string; readonly length: number }[];
  /** The fog banks: how high over the base they drift, from the lowest to the highest. */
  readonly fog?: { readonly height: { readonly min: number; readonly max: number } };
}

/**
 * A range behind the slope, or the ice in front of it: the faces of named massifs over a ridge,
 * built once over the whole section at the layer's depth, with their flutings, their rock bands
 * and the crests the alpenglow lights; the sea of clouds in the valley under the farthest; the
 * plumes off the summits and the fog banks on the wind. The ridge rises from the ground's height
 * at that depth, so under the climber it stays as high above them however far the section climbs;
 * away from them it rises and falls with the ground ahead and behind, at the depth's share of its
 * steepness, which is why a far layer's vertical depth is next to nothing. The shapes are drawn
 * white and tinted each frame by the hour's light, the weather's haze and its cloud.
 */
export class SkylineLayer extends ParallaxLayer {
  /** The Khumbu from the Icefall, left to right in each layer's metres, the summits within the
   * sky over the climber at the standard view: the ranges down the valley and across it behind
   * the sea of clouds; Pumori's horn behind Base Camp, the West Shoulder hiding Everest's summit,
   * Nuptse's fluted wall and Lhotse's face ahead at the head of the Cwm; and the Icefall's own
   * seracs around the slope. */
  static readonly FAR_RANGES: SkylineStyle = {
    label: "far-ranges",
    depth: { x: 0.1, y: 0 },
    step: 2,
    low: 2.2,
    high: 3.6,
    massifs: [
      { name: "Cholatse", summit: -16, halfWidth: 9, height: 4.5, shape: 0.75, bands: [] },
      { name: "Lingtren", summit: 1, halfWidth: 8, height: 3.2, shape: 1.1, bands: [] },
      { name: "Khumbutse", summit: 13, halfWidth: 9, height: 4.2, shape: 0.9, bands: [] },
      { name: "Changtse", summit: 31, halfWidth: 10, height: 3.8, shape: 1.15, bands: [] },
      { name: "Chomo Lonzo", summit: 50, halfWidth: 12, height: 4.8, shape: 0.85, bands: [] },
    ],
    haze: 0.6,
    ice: false,
    alpha: 1,
    cloudSea: { height: 1.4, rows: 3 },
  };
  static readonly PEAKS: SkylineStyle = {
    label: "peaks",
    depth: { x: 0.25, y: 0.02 },
    step: 1.6,
    low: 0.3,
    high: 1.6,
    massifs: [
      { name: "Pumori", summit: -6, halfWidth: 13, height: 7.5, shape: 0.65, bands: [] },
      { name: "West Shoulder", summit: 26, halfWidth: 20, height: 5.5, shape: 1.6, bands: [] },
      { name: "Nuptse", summit: 54, halfWidth: 18, height: 7.5, shape: 0.8, bands: [0.35, 0.6] },
      { name: "Lhotse", summit: 80, halfWidth: 18, height: 8.5, shape: 0.85, bands: [0.4, 0.7] },
    ],
    haze: 0.35,
    ice: false,
    alpha: 1,
    plumes: [
      { massif: "Nuptse", length: 14 },
      { massif: "Lhotse", length: 16 },
    ],
    fog: { height: { min: 0.5, max: 5 } },
  };
  static readonly NEAR_RIDGE: SkylineStyle = {
    label: "near-ridge",
    depth: { x: 0.5, y: 0.1 },
    step: 1.2,
    low: 0.2,
    high: 1.2,
    massifs: [
      { name: "serac", summit: 12, halfWidth: 5, height: 2.4, shape: 0.5, bands: [] },
      { name: "serac", summit: 31, halfWidth: 7, height: 3.4, shape: 0.45, bands: [] },
      { name: "serac", summit: 53, halfWidth: 6, height: 2.8, shape: 0.5, bands: [] },
      { name: "serac", summit: 76, halfWidth: 8, height: 3.8, shape: 0.4, bands: [] },
      { name: "serac", summit: 99, halfWidth: 6, height: 2.9, shape: 0.5, bands: [] },
      { name: "serac", summit: 123, halfWidth: 7, height: 3.5, shape: 0.45, bands: [] },
      { name: "serac", summit: 146, halfWidth: 6, height: 2.6, shape: 0.5, bands: [] },
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
  private static readonly BAND_ALPHA = 0.5;
  /** The flanks away from the sun: how deep their shade is with the sun on the horizon, none
   * with it overhead at noon, and how much of it cloud takes, lighting them from all the sky. */
  private static readonly SHADE = 0.75;
  private static readonly SHADE_UNDER_CLOUD = 0.85;
  /** A plume's puffs are drawn this many times as long as they're high, along the wind. */
  private static readonly PUFF_STRETCH = 2.8;
  /** The crests the glow lights: how deep under the skyline, as a share of the tallest massif,
   * and where a massif is high enough. */
  private static readonly CREST_DEPTH = 0.3;
  private static readonly CREST_SHARE = 0.5;
  private static readonly CREST_ALPHA = 0.7;
  /** The ice's edge: a brighter line along the seracs' tops, and how far towards white it is by
   * day. */
  private static readonly ICE_EDGE_METRES = 0.12;
  private static readonly ICE_EDGE_LIGHT = 0.5;
  /** The sea of clouds: how far apart its rows lie, the nearest row's puffs, how solid they are,
   * and how much of the layer's haze the nearest and the farthest row take. */
  private static readonly CLOUD_ROWS_APART = 0.9;
  private static readonly CLOUD_SEA_PUFF = { min: 0.9, max: 2.2 };
  private static readonly CLOUD_SEA_ALPHA = 0.95;
  private static readonly CLOUD_HAZE = { nearest: 0.25, farthest: 0.7 };
  /** The fog banks: where they drift, past the farthest any screen sees at either end, how wide,
   * how flat, how fast at full gust, and how thick at the weather's thickest. */
  private static readonly FOG_SPAN = { from: -45, to: 135 };
  private static readonly FOG_HALF_WIDTH = { min: 7, max: 15 };
  private static readonly FOG_FLAT = 0.32;
  private static readonly FOG_SPEED = { min: 1.5, max: 4 };
  private static readonly FOG_ALPHA = 1;

  private readonly style: SkylineStyle;
  /** The height the layer's ridge rises from at each x: the ground's, at the layer's depth. */
  private readonly base: (x: number) => number;
  private readonly faces: MountainFaces;
  private readonly fill = new Graphics();
  private readonly leftShade = new Graphics();
  private readonly rightShade = new Graphics();
  private readonly crests = new Graphics();
  private readonly flutings = new Graphics();
  private readonly bands = new Graphics();
  private readonly edge = new Graphics();
  private readonly clouds: readonly Graphics[];
  /** The plumes, each puff drawn once and moved, and the fog banks: soft-edged, one gradient. */
  private readonly soft: FillGradient;
  private readonly plumes: readonly { readonly plume: Plume; readonly puffs: Container }[];
  private readonly fog: Drift | null;
  private readonly fogBanks = new Container();
  private tintedWith: Atmosphere | null = null;

  /** `fogBanks` is how many banks of fog the quality allows, if the style has fog. */
  constructor(style: SkylineStyle, terrain: Terrain, seed: number, fogBanks = 0) {
    super(style.label, style.depth);
    this.style = style;
    const { depth } = style;
    const first = terrain.points[0]?.[0] ?? 0;
    const last = terrain.points.at(-1)?.[0] ?? 0;
    const from = first * depth.x - SkylineLayer.MARGIN_METRES;
    const to = last * depth.x + SkylineLayer.MARGIN_METRES;
    this.base = (x: number): number => depth.y * terrain.height(x / depth.x);
    this.faces = new MountainFaces({
      from,
      to,
      step: style.step,
      massifs: style.massifs,
      low: style.low,
      high: style.high,
      base: this.base,
      seed,
    });
    this.drawFaces(from, to);
    this.clouds = this.drawClouds(from, to, seed + 2);
    this.soft = SkylineLayer.softFill();
    this.plumes = (style.plumes ?? []).flatMap(({ massif, length }, index) => {
      const summit = style.massifs.find(({ name }) => name === massif);
      if (summit === undefined) {
        return [];
      }
      const top = { x: summit.summit, y: this.faces.top(summit.summit) };
      const plume = new Plume(top, length, seed + 10 + index);
      const puffs = new Container();
      for (const { x, y } of plume.puffs) {
        const puff = new Graphics().ellipse(0, 0, SkylineLayer.PUFF_STRETCH, 1).fill(this.soft);
        puff.position.set(x, y);
        puff.visible = false;
        puffs.addChild(puff);
      }
      return [{ plume, puffs }];
    });
    this.fog =
      style.fog !== undefined && fogBanks > 0
        ? new Drift(
            {
              count: fogBanks,
              ...SkylineLayer.FOG_SPAN,
              height: style.fog.height,
              size: SkylineLayer.FOG_HALF_WIDTH,
              speed: SkylineLayer.FOG_SPEED,
            },
            SeededRandom.fromSeed(seed + 20),
          )
        : null;
    this.drawFog();
    // The plumes stream from behind the summits, so the faces hide where they're torn off.
    this.addChild(
      ...this.plumes.map(({ puffs }) => puffs),
      this.fill,
      this.leftShade,
      this.rightShade,
      this.crests,
      this.flutings,
      this.bands,
      this.edge,
      ...this.clouds,
      this.fogBanks,
    );
    this.alpha = style.alpha;
  }

  /** With its children, the soft edge's gradient, which no child owns. */
  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.soft.destroy();
    super.destroy(options);
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
   * the haze by its depth and the weather, the flanks away from the sun shaded, the crests lit by
   * the glow the cloud lets through, the plumes blown by the gust, and the fog as thick as the
   * weather and drifting on the wind. */
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
      this.leftShade.tint = palette.faded(palette.faceShade, haze);
      this.rightShade.tint = this.leftShade.tint;
      this.flutings.tint = palette.faded(palette.fluting, haze);
      this.bands.tint = palette.faded(palette.rock, haze);
      // The seracs' tops catch the light: barely under the stars, brightly by day.
      const edgeLight = SkylineLayer.ICE_EDGE_LIGHT * (0.1 + 0.9 * light.daylight);
      this.edge.tint = palette.faded(Palette.mix(palette.ice, 0xffffff, edgeLight), haze);
      const { nearest, farthest } = SkylineLayer.CLOUD_HAZE;
      for (const [row, cloud] of this.clouds.entries()) {
        const behind = (this.clouds.length - 1 - row) / Math.max(this.clouds.length - 1, 1);
        cloud.tint = palette.faded(palette.cloud, haze * (nearest + (farthest - nearest) * behind));
      }
      this.crests.tint = palette.glow;
      for (const { puffs } of this.plumes) {
        puffs.tint = palette.faded(palette.fluting, haze);
      }
      this.fogBanks.tint = palette.faded(palette.cloud, 0.2);
    }
    this.tintedWith = atmosphere;
    this.crests.alpha = atmosphere.glow * SkylineLayer.CREST_ALPHA;
    this.crests.visible = this.crests.alpha > 0.01;
    this.shadeFlanks(atmosphere);
    for (const { plume, puffs } of this.plumes) {
      plume.blow(seconds, gust, elapsed);
      SkylineLayer.placePuffs(plume, puffs);
    }
    this.driftFog(seconds, atmosphere);
  }

  /** The flanks away from the sun in its shade: the left ones in the morning, with the sun on the
   * right, up the mountain, the right ones in the evening, deepest with the sun low and none with
   * it overhead; none at night, and little under cloud, which lights them from all the sky. */
  private shadeFlanks({ light, look }: Atmosphere): void {
    const high = Math.min(Math.max(light.sun, 0), 1);
    // How far to the side the sun is along its arc: 1 as it rises, 0 at noon, -1 as it sets.
    const side = light.glowSide * Math.sqrt(1 - high * high);
    const shade =
      SkylineLayer.SHADE * light.daylight * (1 - look.overcast * SkylineLayer.SHADE_UNDER_CLOUD);
    this.leftShade.alpha = shade * Math.max(side, 0);
    this.rightShade.alpha = shade * Math.max(-side, 0);
    this.leftShade.visible = this.leftShade.alpha > 0.01;
    this.rightShade.visible = this.rightShade.alpha > 0.01;
  }

  private drawFaces(from: number, to: number): void {
    const { outline, flutings, bands } = this.faces;
    const bottom = Math.min(...outline.map(({ y }) => y)) - SkylineLayer.BELOW_METRES;
    this.fill
      .poly([from, bottom, ...outline.flatMap(({ x, y }) => [x, y]), to, bottom])
      .fill(0xffffff);
    if (!this.style.ice) {
      for (const [side, shade] of [
        [-1, this.leftShade],
        [1, this.rightShade],
      ] as const) {
        for (const flank of this.faces.shades(side, SkylineLayer.BELOW_METRES)) {
          shade.poly(flank.flatMap(({ x, y }) => [x, y])).fill(0xffffff);
        }
      }
    }
    // The glow lights a crest from its top down, fading out as it goes: the layer's y is up, so
    // the gradient's first stop is the crest's foot.
    const tallest = Math.max(0, ...this.style.massifs.map(({ height }) => height));
    const crests = this.faces.crests(tallest * SkylineLayer.CREST_DEPTH, SkylineLayer.CREST_SHARE);
    for (const crest of crests) {
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

  /** The sea of clouds' rows, the farthest first, each its own shape so each takes its own haze. */
  private drawClouds(from: number, to: number, seed: number): readonly Graphics[] {
    const { cloudSea } = this.style;
    if (cloudSea === undefined) {
      return [];
    }
    const rows = CloudSea.rows(
      {
        from,
        to,
        step: this.style.step / 4,
        height: cloudSea.height,
        puff: SkylineLayer.CLOUD_SEA_PUFF,
        seed,
      },
      cloudSea.rows,
      SkylineLayer.CLOUD_ROWS_APART,
    );
    const bottom = cloudSea.height - SkylineLayer.BELOW_METRES;
    return rows.map((row) =>
      new Graphics()
        .poly([from, bottom, ...row.outline.flatMap(({ x, y }) => [x, y]), to, bottom])
        .fill({ color: 0xffffff, alpha: SkylineLayer.CLOUD_SEA_ALPHA }),
    );
  }

  /** The fog banks, drawn once, white and soft-edged: each frame only moves them. */
  private drawFog(): void {
    if (this.fog === null) {
      return;
    }
    for (const bank of this.fog.motes) {
      this.fogBanks.addChild(
        new Graphics().ellipse(0, 0, bank.size, bank.size * SkylineLayer.FOG_FLAT).fill(this.soft),
      );
    }
  }

  /** White fading out from the middle to the edge of the shape it fills. */
  private static softFill(): FillGradient {
    return new FillGradient({
      type: "radial",
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: Palette.css(0xffffff, 1) },
        { offset: 0.45, color: Palette.css(0xffffff, 0.6) },
        { offset: 1, color: Palette.css(0xffffff, 0) },
      ],
      textureSpace: "local",
    });
  }

  /** The fog as thick as the weather has it, its banks `seconds` further on the wind. */
  private driftFog(seconds: number, atmosphere: Atmosphere): void {
    const { fog } = this;
    this.fogBanks.alpha = atmosphere.look.fog * SkylineLayer.FOG_ALPHA;
    this.fogBanks.visible = fog !== null && this.fogBanks.alpha > 0.01;
    if (fog === null || !this.fogBanks.visible) {
      return;
    }
    fog.blow(seconds, atmosphere.gust, this.base, atmosphere.elapsed);
    for (const [index, bank] of fog.motes.entries()) {
      this.fogBanks.children[index]?.position.set(bank.x, bank.y);
    }
  }

  /** A plume's puffs where the wind has them now, each drawn once and only moved, sized and
   * faded. */
  private static placePuffs({ puffs }: Plume, { children }: Container): void {
    for (let index = 0; index < children.length; index += 1) {
      const shape = children[index];
      const puff = puffs[index];
      if (shape === undefined || puff === undefined) {
        continue;
      }
      shape.visible = puff.alpha > 0.005;
      if (shape.visible) {
        shape.position.set(puff.x, puff.y);
        shape.scale.set(puff.radius);
        shape.alpha = puff.alpha;
      }
    }
  }
}
