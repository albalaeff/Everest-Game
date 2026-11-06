import type { DayLight } from "./day-light";

/** A colour's channels, 0 to 255 each. */
export interface Channels {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/**
 * The picture's colours, named once (docs/guidelines/graphics.md → colour: one palette), so a
 * strong colour means one thing on the screen: the player's suit, the rope, the others' suits. The
 * fixed colours are the class's; an instance is the palette at one hour's light, its sky, air,
 * faces and snow mixed from the night's and the day's colours by `DayLight`. The interface's
 * blues live in the style sheet, where the text is.
 */
export class Palette {
  /** The climbers: the player's suit, 3.6:1 on the snow, and the others', apart by colour alone. */
  static readonly PLAYER_SUIT = 0xe8412c;
  static readonly OTHER_SUIT = 0xf5c518;
  static readonly BOOTS = 0x1d2024;
  static readonly CRAMPONS = 0x8e97a3;
  static readonly PACK = 0x262e47;
  static readonly BOTTLE = 0xd7dde6;
  static readonly MASK = 0x15181c;
  static readonly GOGGLES = 0x7fc4ff;
  static readonly HARNESS = 0x3b4a6b;
  static readonly JUMAR = 0xb5bdca;
  static readonly LAMP = 0xfff1b0;
  static readonly BREATH = 0xffffff;
  /** The fixed line and what holds it: the one orange of the slope. */
  static readonly ROPE = 0xff6f3c;
  static readonly ROPE_SHADE = 0x6b2810;
  static readonly PICKET = 0xb5bdca;
  static readonly ANCHOR = 0x3a3f47;
  static readonly LADDER = 0xc9d3dd;
  static readonly LADDER_SHADE = 0x4a5560;
  /** The camps' tents, lit from inside at night. */
  static readonly TENT = 0xe9a13b;
  static readonly TENT_DOOR = 0xb06a1e;
  /** The prayer flags over Base Camp, blue, white, red, green and yellow in their order: muted, so
   * the suits and the rope keep their colours. */
  static readonly PRAYER_FLAGS: readonly number[] = [
    0x5b7aa6, 0xdcd8cc, 0x9e5a52, 0x5f8a69, 0xc4ab6a,
  ];
  /** The snow of the play plane: its body, its crest in the light, the shade of its sastrugi. */
  static readonly SNOW = 0xeef3f9;
  static readonly SNOW_CREST = 0xffffff;
  static readonly SNOW_SHADE = 0xc3d2e6;
  static readonly SNOW_DEEP = 0x9fb6d4;
  static readonly TRACK = 0xd3dfed;
  static readonly ICE = 0xcfe6f5;
  static readonly ICE_EDGE = 0x8fb7d4;
  static readonly ICE_DEEP = 0x7fa9d0;
  static readonly LOADED = 0xffffff;
  static readonly ROCK = 0x3a3d48;
  /** The sky and the air at night and by day, and the glow of dawn and dusk between them. */
  static readonly NIGHT_SKY_TOP = 0x02040c;
  static readonly NIGHT_SKY_HORIZON = 0x1d2550;
  static readonly NIGHT_HAZE = 0x1a2140;
  static readonly NIGHT_FACE = 0x2a2650;
  static readonly NIGHT_ICE = 0x3d4a73;
  static readonly NIGHT_SNOW_TINT = 0xdde4f2;
  static readonly NIGHT_CLOUD = 0x544a7a;
  static readonly DAY_SKY_TOP = 0x1b4a97;
  static readonly DAY_SKY_HORIZON = 0xa9c8ea;
  static readonly DAY_HAZE = 0xc4d6ec;
  static readonly DAY_FACE = 0xd9e6f4;
  static readonly DAY_ICE = 0xc3dff2;
  static readonly DAY_CLOUD = 0xf4f7fb;
  static readonly DAWN_SKY_HORIZON = 0xf29a66;
  static readonly GLOW = 0xff9a5c;
  static readonly STAR = 0xffffff;
  /** How much of the horizon the glow colours at its strongest. */
  private static readonly GLOW_SHARE = 0.75;
  /** How much of the far faces' colour the flutings brighten, and the rock bands keep. */
  private static readonly FLUTING_LIGHT = 0.45;

  readonly skyTop: number;
  readonly skyHorizon: number;
  /** The air between the layers: what a far face fades into. */
  readonly haze: number;
  /** The snow faces of the far mountains, their flutings in the light, and their rock. */
  readonly face: number;
  readonly fluting: number;
  readonly rock: number;
  /** The ice of the near seracs, and the sea of clouds in the valley. */
  readonly ice: number;
  readonly cloud: number;
  /** The snow of the play plane: blue-white at night, white by day, its crest and its shade. */
  readonly snowTint: number;
  readonly snowCrest: number;
  readonly snowShade: number;
  readonly snowDeep: number;
  readonly iceWall: number;
  readonly iceEdge: number;
  readonly track: number;

  constructor(light: DayLight) {
    const { daylight, glow } = light;
    const by = (night: number, day: number): number => Palette.mix(night, day, daylight);
    const horizon = by(Palette.NIGHT_SKY_HORIZON, Palette.DAY_SKY_HORIZON);
    this.skyTop = by(Palette.NIGHT_SKY_TOP, Palette.DAY_SKY_TOP);
    this.skyHorizon = Palette.mix(horizon, Palette.DAWN_SKY_HORIZON, glow * Palette.GLOW_SHARE);
    this.haze = by(Palette.NIGHT_HAZE, Palette.DAY_HAZE);
    this.face = by(Palette.NIGHT_FACE, Palette.DAY_FACE);
    this.fluting = Palette.mix(this.face, 0xffffff, Palette.FLUTING_LIGHT);
    this.rock = Palette.mix(Palette.ROCK, this.haze, 0.3);
    this.ice = by(Palette.NIGHT_ICE, Palette.DAY_ICE);
    this.cloud = by(Palette.NIGHT_CLOUD, Palette.DAY_CLOUD);
    this.snowTint = by(Palette.NIGHT_SNOW_TINT, 0xffffff);
    this.snowCrest = Palette.mix(this.snowTint, Palette.SNOW_CREST, 0.5);
    this.snowShade = Palette.mix(
      Palette.mix(Palette.SNOW_SHADE, Palette.NIGHT_HAZE, 0.5),
      Palette.SNOW_SHADE,
      daylight,
    );
    this.snowDeep = Palette.mix(
      Palette.mix(Palette.SNOW_DEEP, Palette.NIGHT_HAZE, 0.5),
      Palette.SNOW_DEEP,
      daylight,
    );
    this.iceWall = Palette.mix(
      Palette.mix(Palette.ICE, Palette.NIGHT_ICE, 0.5),
      Palette.ICE,
      daylight,
    );
    this.iceEdge = Palette.mix(
      Palette.mix(Palette.ICE_EDGE, Palette.NIGHT_HAZE, 0.5),
      Palette.ICE_EDGE,
      daylight,
    );
    this.track = Palette.mix(
      Palette.mix(Palette.TRACK, Palette.NIGHT_SNOW_TINT, 0.5),
      Palette.TRACK,
      daylight,
    );
  }

  /** A colour `share` of the way into the haze: a layer's, by how far behind the slope it is. */
  faded(colour: number, share: number): number {
    return Palette.mix(colour, this.haze, share);
  }

  /** The colour `share` of the way from one to another, 0 for the first and 1 for the second. */
  static mix(from: number, to: number, share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    const a = Palette.channels(from);
    const b = Palette.channels(to);
    return Palette.colour({
      red: a.red + (b.red - a.red) * t,
      green: a.green + (b.green - a.green) * t,
      blue: a.blue + (b.blue - a.blue) * t,
    });
  }

  /** The same colour `share` of the way to black: its shaded side. */
  static shaded(colour: number, share: number): number {
    return Palette.mix(colour, 0x000000, share);
  }

  static channels(colour: number): Channels {
    return { red: (colour >> 16) & 0xff, green: (colour >> 8) & 0xff, blue: colour & 0xff };
  }

  static colour({ red, green, blue }: Channels): number {
    const clamp = (channel: number): number => Math.min(Math.max(Math.round(channel), 0), 255);
    return (clamp(red) << 16) | (clamp(green) << 8) | clamp(blue);
  }

  /** The colour as CSS writes it, with an alpha: what a gradient's stop takes. */
  static css(colour: number, alpha = 1): string {
    const { red, green, blue } = Palette.channels(colour);
    return `rgba(${red},${green},${blue},${Math.min(Math.max(alpha, 0), 1)})`;
  }

  /** The brightness the stories read: the channels' mean, 0 to 255. */
  static brightness(colour: number): number {
    const { red, green, blue } = Palette.channels(colour);
    return (red + green + blue) / 3;
  }

  /** The contrast between two colours, 1:1 to 21:1, as WCAG counts it. */
  static contrast(one: number, other: number): number {
    const a = Palette.luminance(one);
    const b = Palette.luminance(other);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  private static luminance(colour: number): number {
    const { red, green, blue } = Palette.channels(colour);
    const linear = (channel: number): number => {
      const share = channel / 255;
      return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  }
}
