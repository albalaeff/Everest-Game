import type { DayLight } from "./day-light";
import type { ThinAir } from "./thin-air";
import type { WeatherLook } from "./weather-look";

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
 * faces and snow mixed from the night's and the day's colours by `DayLight`, the top of the sky
 * deeper the thinner the air above (`ThinAir`), and the sky greyer the more of it is cloud
 * (`WeatherLook.overcast`). The interface's blues live in the style sheet, where the text is.
 */
export class Palette {
  /** The climbers: the player's suit, 3.6:1 on the snow, and the others', apart by colour alone. */
  static readonly PLAYER_SUIT = 0xe8412c;
  static readonly OTHER_SUIT = 0xf5c518;
  /** Their kit, as on #125's scene: the suit's dark panels and seams, the boots and their rands,
   * the mitts, the steel of the crampons, the pack, the oxygen's bottle, regulator and hose, the
   * mask, the goggles, the harness, the slings and the jumar with its grip. */
  static readonly PANEL = 0x1a1a21;
  static readonly SEAM = 0x180406;
  static readonly BOOTS = 0xb0842c;
  static readonly RAND = 0x17171c;
  static readonly MITTS = 0x16171d;
  static readonly STEEL = 0xa3acc0;
  static readonly PACK = 0x262e47;
  static readonly PACK_LID = 0x313a59;
  static readonly STRAP = 0x15171f;
  static readonly BOTTLE = 0xc4652f;
  static readonly REGULATOR = 0x8b93a2;
  static readonly HOSE = 0x2b313d;
  static readonly MASK = 0x131418;
  static readonly VALVE = 0x3c404a;
  static readonly HOOD_SHADOW = 0x0c0c11;
  static readonly GOGGLES = 0x0e0f12;
  static readonly HARNESS = 0x1d2029;
  static readonly SLING = 0x2f6bd0;
  static readonly JUMAR = 0xb5bdca;
  static readonly GRIP = 0xc9332c;
  static readonly LAMP_CASE = 0x2a2d36;
  static readonly LAMP = 0xfff1b0;
  static readonly BREATH = 0xffffff;
  /** The ice tools: the axe's shaft anodised silver, the second tool's blue, the black rubber of
   * their grips, the axe's banded in the jumar's red, a grip being red; their forged steel, the
   * top of the pick catching the light; and the dark edge round them, so a tool reads on the
   * day's snow and the night's ice alike, as the rope does. */
  static readonly AXE_SHAFT = 0xb8c2d0;
  static readonly TOOL_SHAFT = 0x5c84b8;
  static readonly TOOL_GRIP = 0x1b1d24;
  static readonly TOOL_STEEL = 0xc3ccd9;
  static readonly TOOL_SHINE = 0xf6f9ff;
  static readonly TOOL_EDGE = 0x0f1218;
  /** The chips of ice a pick or a kick of the front points knocks off, tinted by the hour as the
   * snow is. */
  static readonly ICE_CHIP = 0xeef8ff;
  /** The mark over the player's climber in a crowd: white on a dark edge, in every light. */
  static readonly MARK = 0xffffff;
  static readonly MARK_EDGE = 0x15181c;
  /** The fixed line and what holds it: the one orange of the slope. */
  static readonly ROPE = 0xff6f3c;
  static readonly ROPE_SHADE = 0x6b2810;
  static readonly PICKET = 0xb5bdca;
  static readonly ANCHOR = 0x3a3f47;
  static readonly LADDER = 0xc9d3dd;
  static readonly LADDER_SHADE = 0x4a5560;
  /** The cord lashing a long ladder's sections end to end: muted, so the rope keeps its orange. */
  static readonly LASHING = 0x7d6a4f;
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
  /** Blue ice, and the inside of a crevasse at its lips, deep blue, going black as it goes down. */
  static readonly ICE = 0xa6d4f2;
  static readonly CREVASSE = 0x1f5f9f;
  /** The glacier seen from the side, by day (#184): pale just under its snow, blue a few metres
   * down, and darker as the light through the ice fades, at these depths in metres. */
  static readonly GLACIER: readonly (readonly [depth: number, colour: number])[] = [
    [1, 0xcfeaf9],
    [4, 0x9dcbec],
    [9, 0x5f97cb],
    [16, 0x33669c],
    [24, 0x214a78],
  ];
  /** The light through the ice by a crevasse's wall or a bare face, by day, at these metres
   * under its top: bright under the snow, blue, and dark where it fades. */
  static readonly LIT_ICE: readonly (readonly [depth: number, colour: number])[] = [
    [0, 0xd8f1fd],
    [1.5, 0xa9d9f4],
    [4, 0x67a5d8],
    [9, 0x25578f],
    [16, 0x0c2546],
  ];
  /** The blocks and towers of ice standing behind the route, by day: a little hazier than the
   * ice the climbers cross, their faces away from the light in shade. */
  static readonly BLOCK = 0xb4d6ee;
  static readonly BLOCK_SHADE = 0x8bb5da;
  static readonly BLOCK_EDGE = 0xe9f6fe;
  /** Bare blue ice under the boots, by day: glossy, with a wet sheen along its top (#190). */
  static readonly BLUE_ICE = 0x7fc0ea;
  static readonly ICE_SHEEN = 0xf2fbff;
  /** The icicles under a lip of snow, and the streaks down a wall's bare ice. */
  static readonly ICICLE = 0xe4f5ff;
  /** Brittle ice on a face: chalky and pale, where a pick bites poorly. */
  static readonly BRITTLE = 0xe9f0f4;
  static readonly STREAK = 0x6fa6d4;
  static readonly LOADED = 0xffffff;
  static readonly ROCK = 0x3a3d48;
  /** The moraine Base Camp stands on, rubble bare of snow: navy under the stars, darker than the
   * snow, and grey by day. */
  static readonly NIGHT_MORAINE = 0x20264f;
  static readonly DAY_MORAINE = 0x8b857d;
  /** The sky and the air at night and by day, and the glow of dawn and dusk between them. */
  static readonly NIGHT_SKY_TOP = 0x02040c;
  static readonly NIGHT_SKY_HORIZON = 0x1d2550;
  static readonly NIGHT_HAZE = 0x151b38;
  static readonly NIGHT_FACE = 0x231f45;
  static readonly NIGHT_FACE_SHADE = 0x19173a;
  static readonly NIGHT_ICE = 0x26315e;
  static readonly NIGHT_CLOUD = 0x544a7a;
  /** The top of the day's sky under all the air there is and under none: over Base Camp, about
   * half way, it's #149's blue, 0x1b4a97, and it deepens to indigo by the summit. */
  static readonly SEA_LEVEL_SKY_TOP = 0x3087fa;
  static readonly SPACE_SKY_TOP = 0x060c30;
  static readonly DAY_SKY_HORIZON = 0xa9c8ea;
  static readonly DAY_HAZE = 0xc4d6ec;
  static readonly DAY_FACE = 0xd9e6f4;
  /** Snow in the shade by day is blue: the sky lights it, not the sun. */
  static readonly DAY_FACE_SHADE = 0x9cb2d6;
  static readonly DAY_ICE = 0xc3dff2;
  static readonly DAY_CLOUD = 0xf4f7fb;
  /** The snow of the play plane: navy under the stars, blue as the sky pales before the sun, and
   * white in it, as on #125's scene; its shade, track and ice are the day's shares of it. */
  static readonly NIGHT_SNOW_TINT = 0x262f5e;
  static readonly TWILIGHT_SNOW_TINT = 0x4d62a8;
  /** The horizon and the glow before the sun is up, pink and mauve, and as it rises, orange. */
  static readonly EARLY_SKY_HORIZON = 0xb0688a;
  static readonly DAWN_SKY_HORIZON = 0xf29a66;
  static readonly EARLY_GLOW = 0xd0789a;
  static readonly GLOW = 0xff9a5c;
  /** The light on a figure's edge: the sky's cold light at night, the sun's by day. */
  static readonly NIGHT_RIM = 0x8fa3d9;
  static readonly DAY_RIM = 0xfff6e8;
  static readonly STAR = 0xffffff;
  /** The sky under cloud, at night and by day: a flat grey, its top little darker than its
   * horizon. */
  static readonly NIGHT_OVERCAST_TOP = 0x0e1120;
  static readonly NIGHT_OVERCAST_HORIZON = 0x1c2031;
  static readonly DAY_OVERCAST_TOP = 0xa3acb8;
  static readonly DAY_OVERCAST_HORIZON = 0xc8ced6;
  /** How far the air between the layers greys with the cloud. */
  private static readonly HAZE_UNDER_CLOUD = 0.7;
  /** How much of the horizon the glow colours at its strongest. */
  private static readonly GLOW_SHARE = 0.75;
  /** How much the glow lights the snow before the sun is up: the sky's light, earlier than the
   * daylight. */
  private static readonly GLOW_SKYLIGHT = 0.5;
  /** How much brighter than the snow its crest is, and how far the glow warms it. */
  private static readonly CREST_LIGHT = 0.3;
  private static readonly CREST_GLOW = 0.55;
  /** How much of the far faces' colour the flutings brighten, and the rock bands keep. */
  private static readonly FLUTING_LIGHT = 0.45;

  readonly skyTop: number;
  readonly skyHorizon: number;
  /** The air between the layers: what a far face fades into. */
  readonly haze: number;
  /** The snow faces of the far mountains, their flanks away from the sun, their flutings in the
   * light, and their rock. */
  readonly face: number;
  readonly faceShade: number;
  readonly fluting: number;
  readonly rock: number;
  /** The ice of the near seracs, and the sea of clouds in the valley. */
  readonly ice: number;
  readonly cloud: number;
  /** The glow of dawn and dusk this hour: pink before the sun is up, orange as it rises. */
  readonly glow: number;
  /** The light on a figure's edge on the sun's side: the glow at dawn and dusk. */
  readonly rim: number;
  /** The snow of the play plane: navy at night, blue at first light, white by day; its crest,
   * warmed by the glow, its shade and its track. */
  readonly snowTint: number;
  readonly snowCrest: number;
  readonly snowShade: number;
  readonly snowDeep: number;
  readonly track: number;
  /** A crevasse's inside at its lips, and the moraine's rubble, in the snow's light. */
  readonly crevasse: number;
  readonly moraine: number;

  constructor(light: DayLight, air: ThinAir, look: WeatherLook) {
    const { daylight, glow } = light;
    const { overcast } = look;
    const by = (night: number, day: number): number => Palette.mix(night, day, daylight);
    // The sky lights the snow before the sun is up: as far as the glow, at half its strength.
    const skylight = daylight + (1 - daylight) * glow * Palette.GLOW_SKYLIGHT;
    const horizon = by(Palette.NIGHT_SKY_HORIZON, Palette.DAY_SKY_HORIZON);
    const glowHorizon = by(Palette.EARLY_SKY_HORIZON, Palette.DAWN_SKY_HORIZON);
    const dayTop = Palette.mix(Palette.SEA_LEVEL_SKY_TOP, Palette.SPACE_SKY_TOP, air.share);
    const cloudHorizon = by(Palette.NIGHT_OVERCAST_HORIZON, Palette.DAY_OVERCAST_HORIZON);
    // Under cloud the glow doesn't reach the snow, or a figure's edge.
    const sunGlow = glow * (1 - overcast);
    this.skyTop = Palette.mix(
      by(Palette.NIGHT_SKY_TOP, dayTop),
      by(Palette.NIGHT_OVERCAST_TOP, Palette.DAY_OVERCAST_TOP),
      overcast,
    );
    this.skyHorizon = Palette.mix(
      Palette.mix(horizon, glowHorizon, glow * Palette.GLOW_SHARE),
      cloudHorizon,
      overcast,
    );
    this.haze = Palette.mix(
      by(Palette.NIGHT_HAZE, Palette.DAY_HAZE),
      cloudHorizon,
      overcast * Palette.HAZE_UNDER_CLOUD,
    );
    this.face = by(Palette.NIGHT_FACE, Palette.DAY_FACE);
    this.faceShade = by(Palette.NIGHT_FACE_SHADE, Palette.DAY_FACE_SHADE);
    // The flutings catch the light: faint under the stars, bright by day.
    this.fluting = Palette.mix(
      this.face,
      0xffffff,
      Palette.FLUTING_LIGHT * (0.25 + 0.75 * daylight),
    );
    this.rock = Palette.mix(Palette.ROCK, this.haze, 0.3);
    this.ice = by(Palette.NIGHT_ICE, Palette.DAY_ICE);
    this.cloud = by(Palette.NIGHT_CLOUD, Palette.DAY_CLOUD);
    this.glow = by(Palette.EARLY_GLOW, Palette.GLOW);
    this.rim = Palette.mix(by(Palette.NIGHT_RIM, Palette.DAY_RIM), this.glow, sunGlow);
    this.snowTint =
      skylight < 0.5
        ? Palette.mix(Palette.NIGHT_SNOW_TINT, Palette.TWILIGHT_SNOW_TINT, skylight * 2)
        : Palette.mix(Palette.TWILIGHT_SNOW_TINT, 0xffffff, skylight * 2 - 1);
    const warmed = Palette.mix(this.glow, 0xffffff, 0.5);
    this.snowCrest = Palette.mix(
      Palette.mix(this.snowTint, Palette.SNOW_CREST, Palette.CREST_LIGHT),
      warmed,
      sunGlow * Palette.CREST_GLOW,
    );
    this.snowShade = Palette.tinted(this.snowTint, Palette.SNOW_SHADE);
    this.snowDeep = Palette.tinted(this.snowTint, Palette.SNOW_DEEP);
    this.track = Palette.tinted(this.snowTint, Palette.TRACK);
    this.crevasse = Palette.tinted(this.snowTint, Palette.CREVASSE);
    this.moraine = Palette.mix(Palette.NIGHT_MORAINE, Palette.DAY_MORAINE, skylight);
  }

  /** The glacier's ice `depth` metres under its surface, by day: the slope tints it by the hour. */
  static glacier(depth: number): number {
    const { GLACIER } = Palette;
    const [first] = GLACIER;
    let colour = first?.[1] ?? Palette.ICE;
    for (const [index, [deeper, next]] of GLACIER.entries()) {
      const [shallower, from] = GLACIER[index - 1] ?? [deeper, next];
      if (depth >= deeper) {
        colour = next;
      } else if (depth > shallower) {
        colour = Palette.mix(from, next, (depth - shallower) / (deeper - shallower));
      }
    }
    return colour;
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

  /** A colour in a light's colour, channel by channel, as a tint shows a white drawing. */
  static tinted(colour: number, light: number): number {
    const a = Palette.channels(colour);
    const b = Palette.channels(light);
    return Palette.colour({
      red: (a.red * b.red) / 255,
      green: (a.green * b.green) / 255,
      blue: (a.blue * b.blue) / 255,
    });
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
