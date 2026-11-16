import type { KnowledgeBase } from "../../content/knowledge-base";
import { Readings } from "../../interface/readings";
import type { Point } from "../../physics";
import { Palette } from "../../rendering/palette";
import { Elevation } from "./elevation";
import type { Shape } from "./face";
import { MenuFlags } from "./menu-flags";
import { MenuLights } from "./menu-lights";
import { MenuMountains } from "./menu-mountains";
import type { Coat } from "./menu-mountains";
import { MenuSky } from "./menu-sky";
import type { MenuTextName, MenuTexts } from "./menu-texts";
import { RouteMap } from "./route-map";
import type { RoutePlace } from "./route-map";

/** Where a place's name is written by its mark: so far across and down from it, to which side,
 * its altitude beside the name or `stacked` under it, with a line from the mark to it or none. */
interface LabelPlace {
  readonly across: number;
  readonly down: number;
  readonly side: "start" | "end";
  readonly stacked?: true;
  readonly leader?: readonly [number, number, number, number];
}

/**
 * The start's picture on the page: Everest before dawn, from above Kala Patthar, with the South
 * Col route drawn on it. It writes what the pure classes of this folder work out into the
 * start's stage as SVG: the stars, the mountains (`MenuMountains`), the plume and the mist
 * (`MenuSky`), the camps' tents and the climbers' headlamps (`MenuLights`), the rope with each
 * place's mark, name and altitude (`RouteMap`; the altitudes as the altimeter reads them,
 * `Readings`), and the prayer flags in front (`MenuFlags`). What moves is the style sheet's,
 * which stops it with reduced motion; the headlamps alone are moved from here, along the rope,
 * and stay unlit with reduced motion. The rope draws itself once, and each place shows as the
 * rope reaches it.
 */
export class MenuPicture {
  private static readonly SVG = "http://www.w3.org/2000/svg";
  /** When the rope starts drawing itself, and how long it takes, in seconds. */
  private static readonly DRAW = { after: 1.8, seconds: 7 };
  /** How long after the rope reaches a place its name shows, in seconds. */
  private static readonly NAMED_AFTER = 0.25;
  /** The fill of what's soft, and how much further than a hard-edged shape it has to reach. */
  private static readonly SOFT = "url(#menu-soft)";
  private static readonly SOFT_REACH = { across: 1.35, down: 1.7 };
  private static readonly NIGHT = 0x04071a;
  private static readonly NEAR = 0x06091a;
  private static readonly NEAR_EDGE = 0x1b2250;
  private static readonly LABELS: Readonly<Record<string, LabelPlace>> = {
    "base-camp": { across: -14, down: -3, side: "end", stacked: true },
    "camp-1": { across: 14, down: 13, side: "start" },
    "camp-2": { across: -14, down: 2, side: "end" },
    "camp-3": { across: 15, down: 5, side: "start" },
    "south-col": { across: 6, down: -52, side: "start", stacked: true, leader: [3, -9, 12, -30] },
    balcony: { across: 18, down: -21, side: "start", leader: [3, -6, 15, -20] },
    "south-summit": { across: 25, down: -17, side: "start", leader: [4, -5, 22, -17] },
    "hillary-step": { across: 25, down: -34, side: "start", leader: [2, -6, 22, -33] },
    summit: { across: 16, down: -55, side: "start", leader: [1, -8, 12, -52] },
  };
  /** The part of a place's name a small screen leaves out: the camp that stands there. */
  private static readonly MORE: Readonly<Record<string, MenuTextName>> = {
    "south-col": "south-col-camp",
  };

  private readonly document: Document;
  private readonly route: RouteMap;
  private readonly mountains: MenuMountains;
  private readonly sky = new MenuSky();
  private readonly lights: MenuLights;
  private readonly flags = new MenuFlags();
  private readonly readings = new Readings();

  constructor(
    private readonly window: Window,
    knowledge: KnowledgeBase,
    private readonly texts: MenuTexts,
  ) {
    this.document = window.document;
    const elevation = new Elevation(knowledge.number("route.summit-altitude"));
    this.route = new RouteMap(knowledge, elevation);
    this.mountains = new MenuMountains(this.route, elevation);
    this.lights = new MenuLights(this.route);
  }

  /** Draws the picture into the start's stage. */
  show(stage: HTMLElement): void {
    const layer = (name: string): HTMLElement => {
      const made = this.document.createElement("div");
      made.className = `menu-layer ${name}`;
      return made;
    };
    stage.replaceChildren(layer("menu-night"), this.stars(), layer("menu-dawn"), this.land());
    stage.dataset.places = this.route.places.map(({ id }) => id).join(" ");
  }

  private stars(): SVGElement {
    const svg = this.canvas("menu-layer menu-stars");
    svg.setAttribute("aria-hidden", "true");
    for (const star of this.sky.bright) {
      this.dot(svg, star.at, 5, "menu-halo");
    }
    for (const star of this.sky.stars) {
      const dot = this.dot(
        svg,
        star.at,
        star.size,
        star.twinkle && `menu-twinkle--${star.twinkle}`,
      );
      dot.setAttribute("fill", Palette.css(star.colour));
      dot.setAttribute("opacity", MenuPicture.said(star.light));
      MenuPicture.clock(dot, star.seconds, -star.delay);
    }
    return svg;
  }

  private land(): SVGElement {
    const svg = this.canvas("menu-layer menu-land");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", this.texts.say("picture"));
    const { faces, lines } = this.mountains;
    const clips = this.make("defs", {}, svg);
    this.softness(clips);
    for (const face of faces.all) {
      const clip = this.make("clipPath", { id: MenuPicture.clip(face.id) }, clips);
      this.make("path", { d: face.path }, clip);
    }
    this.coats(svg, this.mountains.behind);
    this.plume(svg, lines.summit);
    this.coats(svg, this.mountains.front);
    const veil = this.make("g", { class: "menu-veil", fill: Palette.css(MenuPicture.NIGHT) }, svg);
    for (const face of faces.all.filter((face) => face !== faces.near)) {
      this.make("path", { d: face.path }, veil);
    }
    const mist = this.make("g", { class: "menu-mist", fill: MenuPicture.SOFT }, svg);
    for (const { at, across, deep, light, slow } of this.sky.mists) {
      this.make(
        "ellipse",
        {
          class: slow ? "menu-drift menu-drift--slow" : "menu-drift",
          cx: at.x,
          cy: at.y,
          rx: across * MenuPicture.SOFT_REACH.across,
          ry: deep * MenuPicture.SOFT_REACH.down,
          opacity: light,
        },
        mist,
      );
    }
    this.tents(svg);
    this.rope(svg);
    this.lamps(svg);
    this.near(svg);
    const snow = this.make("g", { class: "menu-snow" }, svg);
    for (const flake of this.sky.flakes) {
      const dot = this.dot(snow, flake.at, flake.size, "menu-flake");
      dot.setAttribute("opacity", MenuPicture.said(flake.light));
      MenuPicture.clock(dot, flake.seconds, -flake.delay);
    }
    return svg;
  }

  private coats(svg: SVGElement, coats: readonly Coat[]): void {
    for (const { face, dawn, shapes } of coats) {
      const group = this.make("g", dawn ? { class: "menu-warm" } : {}, svg);
      if (face !== null) {
        group.setAttribute("clip-path", `url(#${MenuPicture.clip(face.id)})`);
      }
      for (const shape of shapes) {
        this.shape(group, shape);
      }
    }
  }

  private shape(parent: SVGElement, { path, fill, stroke, width, opacity }: Shape): void {
    if (path === "") {
      return;
    }
    const drawn = this.make("path", { d: path }, parent);
    if (stroke === undefined) {
      drawn.setAttribute("fill", Palette.css(fill ?? MenuPicture.NIGHT));
    } else {
      drawn.setAttribute("class", "menu-line");
      drawn.setAttribute("stroke", Palette.css(stroke));
      drawn.setAttribute("stroke-width", String(width ?? 1));
    }
    if (opacity !== undefined) {
      drawn.setAttribute("opacity", MenuPicture.said(opacity));
    }
  }

  private plume(svg: SVGElement, summit: Point): void {
    const plume = this.make("g", { class: "menu-plume" }, svg);
    const { banner, core } = this.sky.plume(summit);
    this.make(
      "path",
      { class: "menu-plume__banner", d: banner, filter: "url(#menu-blur-wide)" },
      plume,
    );
    this.make(
      "path",
      { class: "menu-plume__core", d: core, filter: "url(#menu-blur-fine)" },
      plume,
    );
    for (const puff of this.sky.puffs) {
      const drawn = this.make(
        "ellipse",
        {
          class: "menu-puff",
          cx: summit.x - 4,
          cy: summit.y - 3,
          rx: puff.at.x * MenuPicture.SOFT_REACH.across,
          ry: puff.at.y * MenuPicture.SOFT_REACH.down,
          fill: MenuPicture.SOFT,
        },
        plume,
      );
      MenuPicture.clock(drawn, puff.seconds, -puff.delay);
    }
  }

  private tents(svg: SVGElement): void {
    const tents = this.make("g", { class: "menu-lights" }, svg);
    for (const { at, size, delay } of this.lights.tents) {
      this.dot(tents, at, size * 3.2, "menu-tent-glow");
      this.dot(tents, at, size, "menu-tent").style.animationDelay = `${-delay}s`;
    }
  }

  /** The rope, which draws itself, and each place's mark, name and altitude, which show as it
   * reaches them. */
  private rope(svg: SVGElement): void {
    const route = this.make("g", { class: "menu-route" }, svg);
    const { after, seconds } = MenuPicture.DRAW;
    for (const name of ["menu-rope-edge", "menu-rope", "menu-rope-glint"]) {
      const rope = this.make("path", { class: name, d: this.route.path, pathLength: 1 }, route);
      if (name !== "menu-rope-glint") {
        MenuPicture.clock(rope, seconds, after);
      }
    }
    for (const [index, place] of this.route.places.entries()) {
      const reached = index === 0 ? after / 2 : after + seconds * place.share;
      this.mark(route, place, reached);
      this.label(route, place, reached + MenuPicture.NAMED_AFTER);
    }
  }

  private mark(route: SVGElement, { id, kind, at }: RoutePlace, reached: number): void {
    const mark = this.make("g", { class: `menu-mark menu-mark--${kind}`, "data-place": id }, route);
    mark.style.animationDelay = `${reached}s`;
    if (kind === "summit") {
      this.dot(mark, at, 6, "menu-pulse");
      this.dot(mark, at, 6, "menu-pulse menu-pulse--late");
    }
    this.dot(mark, at, kind === "camp" ? 7.4 : kind === "summit" ? 5.4 : 4.1, "menu-mark__edge");
    if (kind === "camp") {
      this.dot(mark, at, 5.6, "menu-mark__ring");
    }
    this.dot(mark, at, kind === "camp" ? 1.9 : kind === "summit" ? 3.6 : 2.6, "menu-mark__core");
  }

  private label(route: SVGElement, { id, kind, at, altitude }: RoutePlace, shown: number): void {
    const where = MenuPicture.LABELS[id];
    if (where === undefined) {
      return;
    }
    const x = at.x + where.across;
    const y = at.y + where.down;
    const classes = `menu-label menu-label--${kind} menu-label--${where.side}`;
    if (where.leader !== undefined) {
      const [fromX, fromY, toX, toY] = where.leader;
      const leader = this.make(
        "path",
        {
          class: `menu-leader menu-leader--${kind}`,
          d: `M${at.x + fromX} ${at.y + fromY}L${at.x + toX} ${at.y + toY}`,
        },
        route,
      );
      leader.style.animationDelay = `${shown}s`;
    }
    const name = this.make("text", { class: classes, x, y, "data-place": id }, route);
    name.style.animationDelay = `${shown}s`;
    name.append(this.texts.say(id as MenuTextName));
    const more = MenuPicture.MORE[id];
    if (more !== undefined) {
      this.make("tspan", { class: "menu-label__more", dx: 6 }, name).append(this.texts.say(more));
    }
    const reading = this.readings.altitude(altitude);
    if (where.stacked === true) {
      const under = this.make(
        "text",
        { class: `${classes} menu-label__altitude menu-label--under`, x, y: y + 15 },
        route,
      );
      under.style.animationDelay = `${shown}s`;
      under.append(reading);
    } else {
      this.make("tspan", { class: "menu-label__altitude", dx: 8 }, name).append(reading);
    }
  }

  /** The climbers' headlamps, each going up its stretch of the rope again and again; none with
   * motion reduced. */
  private lamps(svg: SVGElement): void {
    if (this.window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const lamps = this.make("g", { class: "menu-lights" }, svg);
    for (const { id, way, seconds, ahead } of this.lights.chains) {
      const shares = way.shares();
      const steps = way.points.map(({ x, y }, index) => ({
        transform: `translate(${x}px, ${y}px)`,
        offset: shares[index] ?? 0,
      }));
      for (const start of ahead) {
        const lamp = this.make("g", { class: `menu-lamp menu-lamp--${id}` }, lamps);
        this.make("circle", { class: "menu-lamp__halo", r: 4.4 }, lamp);
        this.make("circle", { class: "menu-lamp__light", r: 1.2 }, lamp);
        const clock = { duration: seconds * 1000, delay: -start * 1000, iterations: Infinity };
        lamp.animate(steps, clock);
        lamp.animate({ opacity: [0, 1, 1, 0], offset: [0, 0.04, 0.96, 1] }, clock);
      }
    }
  }

  /** The ridge the viewer stands on, with its cairn and its prayer flags. */
  private near(svg: SVGElement): void {
    const { faces, lines } = this.mountains;
    this.shape(svg, { path: faces.near.path, fill: MenuPicture.NEAR });
    this.shape(svg, {
      path: lines.nearSky.lowered(1.2).path(),
      stroke: MenuPicture.NEAR_EDGE,
      width: 1.3,
      opacity: 0.8,
    });
    for (const stone of this.flags.cairn) {
      this.shape(svg, stone);
    }
    this.make("path", { class: "menu-pole", d: this.flags.pole }, svg);
    const flags = this.make("g", { class: "menu-flags" }, svg);
    for (const string of this.flags.strings) {
      this.make("path", { class: "menu-flag-string", d: string.path }, flags);
      for (const flag of string.flags) {
        const hung = this.make(
          "g",
          { transform: `translate(${flag.at.x} ${flag.at.y}) rotate(${flag.tilt})` },
          flags,
        );
        const cloth = this.make(
          "path",
          { class: "menu-flag", d: MenuFlags.FLAG, fill: Palette.css(flag.colour) },
          hung,
        );
        MenuPicture.clock(cloth, flag.seconds, -flag.delay);
      }
    }
  }

  /** What makes the plume and the mist soft: two blurs for the plume's still shapes, and for what
   * drifts a fill that fades to nothing at its edge, which costs a phone no blur each frame. */
  private softness(defs: SVGElement): void {
    for (const [id, blur] of [
      ["menu-blur-wide", 6],
      ["menu-blur-fine", 2.5],
    ] as const) {
      const filter = this.make(
        "filter",
        { id, x: "-20%", y: "-80%", width: "140%", height: "260%" },
        defs,
      );
      this.make("feGaussianBlur", { stdDeviation: blur }, filter);
    }
    const soft = this.make("radialGradient", { id: "menu-soft" }, defs);
    for (const [offset, opacity] of [
      [0, 1],
      [0.55, 0.5],
      [1, 0],
    ] as const) {
      this.make("stop", { offset, "stop-color": "currentColor", "stop-opacity": opacity }, soft);
    }
  }

  private canvas(name: string): SVGElement {
    const { LEFT, RIGHT, HEIGHT } = Elevation;
    return this.make("svg", { class: name, viewBox: `${LEFT} 0 ${RIGHT - LEFT} ${HEIGHT}` });
  }

  private dot(parent: SVGElement, at: Point, size: number, name: string | null): SVGElement {
    const dot = this.make("circle", { cx: at.x, cy: at.y, r: size }, parent);
    if (name !== null) {
      dot.setAttribute("class", name);
    }
    return dot;
  }

  private make(
    name: string,
    attributes: Readonly<Record<string, string | number>>,
    parent?: SVGElement,
  ): SVGElement {
    const made = this.document.createElementNS(MenuPicture.SVG, name);
    for (const [attribute, value] of Object.entries(attributes)) {
      made.setAttribute(attribute, typeof value === "number" ? MenuPicture.said(value) : value);
    }
    parent?.append(made);
    return made;
  }

  /** Sets an animation of the style sheet's to `seconds` long, starting `after` seconds. */
  private static clock(drawn: SVGElement, seconds: number, after: number): void {
    drawn.style.animationDuration = `${MenuPicture.said(seconds)}s`;
    drawn.style.animationDelay = `${MenuPicture.said(after)}s`;
  }

  private static clip(face: string): string {
    return `menu-clip-${face}`;
  }

  private static said(value: number): string {
    return String(Math.round(value * 100) / 100);
  }
}
