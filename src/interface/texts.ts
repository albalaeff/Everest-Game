/** What fills a text's `{names}`: a word, or a number written as it is. */
export type TextFills = Readonly<Record<string, string | number>>;

/**
 * The words of one screen in one language of a file in content/: each text by its name, with
 * whatever it says in braces, `{code}` or `{hours}`, filled in when it's said, a number as the
 * language writes it: English until the language switch (#89), as `Readings` does. The texts are
 * written by people (docs/conventions.md → Modules); the code only fills them in.
 */
export class Texts<Name extends string = string> {
  private static readonly LANGUAGE = "en";

  constructor(private readonly texts: Readonly<Record<Name, string>>) {}

  /** The text called `name`, with each `{fill}` in it replaced by the fill's value. */
  say(name: Name, fills: TextFills = {}): string {
    if (!Object.hasOwn(this.texts, name)) {
      throw new RangeError(`No text is called ${name}`);
    }
    return Object.entries(fills).reduce(
      (said, [fill, value]) =>
        said.replaceAll(
          `{${fill}}`,
          typeof value === "number" ? value.toLocaleString(Texts.LANGUAGE) : value,
        ),
      this.texts[name],
    );
  }
}
