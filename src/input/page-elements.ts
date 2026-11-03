/** The elements of index.html the code is built around: a missing one is a bug, said at once. */
export class PageElements {
  constructor(private readonly document: Document) {}

  find(selector: string): HTMLElement {
    const found = this.document.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new RangeError(`No ${selector} on the page`);
    }
    return found;
  }
}
