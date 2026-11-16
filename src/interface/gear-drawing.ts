/**
 * One of index.html's drawings of the gear, `#art-<thing>`, as an element of the page: an `svg` of
 * the drawings' size, using the symbol. The pack's tiles draw the gear with it, and the coach's
 * card the jumar and the carabiner (#247), so a thing looks the same wherever the player meets it.
 */
export class GearDrawing {
  private static readonly SVG = "http://www.w3.org/2000/svg";
  /** The drawings' own square, in their units. */
  private static readonly VIEW_BOX = "0 0 64 64";

  readonly svg: SVGSVGElement;
  /** The symbol in use, which a pack's tile marks packed or left behind. */
  readonly use: SVGUseElement;

  constructor(document: Document, thing: string) {
    this.svg = document.createElementNS(GearDrawing.SVG, "svg");
    this.svg.setAttribute("viewBox", GearDrawing.VIEW_BOX);
    this.use = document.createElementNS(GearDrawing.SVG, "use");
    this.use.setAttribute("href", `#art-${thing}`);
    this.svg.append(this.use);
  }
}
