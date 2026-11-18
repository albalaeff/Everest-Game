import { Palette } from "../../rendering/palette";

/** A climber's colours: the suit, its dark yoke, the skin, the hair, the eyes, the hat, the down
 * booties and the base layer under the suit. */
export interface Colours {
  readonly suit: number;
  readonly yoke: number;
  readonly skin: number;
  readonly hair: number;
  readonly eyes: number;
  readonly hat: number;
  readonly booties: number;
  readonly baseLayer: number;
}

/**
 * How the person in the tent looks (#264): their colours, as the picture's variables. Each of the
 * suit's, the yoke's, the booties' and the hat's is shaded as the slope paints the kit, dark on its
 * shaded side and bright on its lit one (`Palette.KIT_TONES`); the skin has a lit tone, a shaded
 * one and a deep one, and the lips are the skin flushed. The climber's own look, when they can
 * choose one, is another set of colours.
 */
export class Appearance {
  /** The player's climber: the slope's suit and yoke, a tanned face, dark hair, brown eyes, a
   * charcoal fleece hat, slate booties and a grey base layer. */
  static readonly CLIMBER = new Appearance({
    suit: Palette.PLAYER_SUIT,
    yoke: Palette.PANEL,
    skin: 0xc68a63,
    hair: 0x2e2018,
    eyes: 0x5a4330,
    hat: 0x30353f,
    booties: 0x3a4660,
    baseLayer: 0x3b414c,
  });
  /** The skin's tones, as shares of it, and how much of the lips' colour is the flush. */
  private static readonly SKIN = { light: 1.16, shade: 0.74, deep: 0.46 };
  private static readonly FLUSH = { colour: 0xb2453a, share: 0.38 };

  constructor(readonly colours: Colours) {}

  /** The picture's variables, by their names. */
  variables(): Readonly<Record<string, string>> {
    const { suit, yoke, skin, hair, eyes, hat, booties, baseLayer } = this.colours;
    const { dark, light } = Palette.KIT_TONES;
    const css = (colour: number): string => Palette.css(colour);
    const kit = (name: string, colour: number): Record<string, string> => ({
      [`--${name}`]: css(colour),
      [`--${name}-dark`]: css(Palette.toned(colour, dark)),
      [`--${name}-light`]: css(Palette.toned(colour, light)),
    });
    const lips = Palette.mix(skin, Appearance.FLUSH.colour, Appearance.FLUSH.share);
    return {
      ...kit("suit", suit),
      ...kit("yoke", yoke),
      ...kit("booties", booties),
      ...kit("hat", hat),
      ...kit("base-layer", baseLayer),
      "--cuff": css(Palette.shaded(suit, 0.45)),
      "--skin": css(skin),
      "--skin-light": css(Palette.toned(skin, Appearance.SKIN.light)),
      "--skin-shade": css(Palette.toned(skin, Appearance.SKIN.shade)),
      "--skin-deep": css(Palette.toned(skin, Appearance.SKIN.deep)),
      "--lips": css(lips),
      "--lips-shade": css(Palette.toned(lips, 0.72)),
      "--hair": css(hair),
      "--eyes": css(eyes),
    };
  }
}
