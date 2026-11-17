/**
 * Words with the keys and buttons they name drawn as key caps (`kbd`), as the coach writes them
 * (#192, #233): a button's name in brackets ([Clip 1]), marked `data-button`, without them; a key's,
 * as `BRACED` reads it, in braces ({R}), or as `BARE` does, one of the climb's keys on its own (D,
 * Shift). One writer for the card's tips, its steps and gear (#247), and the arrow's words.
 */
export class KeyCaps {
  /** Keys in braces and buttons in brackets: the arrow's words, and the card's steps and gear. */
  static readonly BRACED = new KeyCaps(/(\{[^}]+\}|\[[^\]]+\])/u);
  /** The climb's keys on their own (content/controls.json), and buttons in brackets: the card's
   * tips. "A" and "I" stay words, as English uses them. */
  static readonly BARE = new KeyCaps(/(\[[^\]]+\]|\b(?:W|S|D|C|E|R|F|Q|T|Z|X|Space|Shift|Tab)\b)/u);

  private constructor(private readonly caps: RegExp) {}

  /** Writes `words` into `into`, each key and button they name as a key cap. */
  write(into: HTMLElement, words: string): void {
    const document = into.ownerDocument;
    into.replaceChildren(
      ...words.split(this.caps).map((part, index) => {
        // `split` with a group puts what it matched at the odd places.
        if (index % 2 === 0) {
          return document.createTextNode(part);
        }
        const key = document.createElement("kbd");
        if (part.startsWith("[")) {
          key.dataset.button = "";
        }
        key.textContent = /^[[{]/u.test(part) ? part.slice(1, -1) : part;
        return key;
      }),
    );
  }
}
