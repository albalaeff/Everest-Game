import type { Atmosphere } from "../../rendering/atmosphere";
import type { TentSizes } from "../../rendering/camp-signs";
import { Palette } from "../../rendering/palette";
import { DwellerDrawing } from "./dweller-drawing";
import type { Act, DwellerLook, Held } from "./dweller-pose";
import { TentArt } from "./tent-art";

/** What's in the tent to see: the litres in the bottles and how many they hold, the camp's meals
 * and grams of gas (`null` for what never runs out) and the grams a full canister holds, the
 * oxygen bottles, the second tool and the jumar in the pack, what's left in the camp of those,
 * and whether there's a guitar. */
export interface TentStock {
  readonly water: number;
  readonly bottles: number;
  readonly meals: number | null;
  readonly gas: number | null;
  readonly canister: number;
  readonly oxygen: number;
  readonly tool: boolean;
  readonly jumar: boolean;
  readonly left: { readonly tool: boolean; readonly jumar: boolean };
  readonly guitar: boolean;
}

/**
 * The tent's inside on the page (#258): `TentArt`'s drawing written into the tent's stage as SVG,
 * with the person (`DwellerDrawing`) in it. Each frame it sets the person's parts to their pose
 * and the stove's flame, the door and the bag to what they're doing; it shows the bottles, meals,
 * gas, oxygen and gear there are; it colours the sky, the peaks and the ground by the hour and
 * the weather (`Atmosphere`), darkens the tent at night and lights it by its lamp, out while they
 * sleep; and it frames the picture for the stage's shape, following what they do where the whole
 * tent doesn't fit. What moves by itself, the flame, the steam, the notes, the snow, is the style
 * sheet's. It keeps no game state: it draws what it's handed.
 */
export class TentPicture {
  private static readonly SVG = "http://www.w3.org/2000/svg";
  /** The least and the most of the picture's height a stage shows, and how far under the floor
   * the frame ends. */
  private static readonly FRAME = { least: 560, most: 640, under: 96 };
  /** How fast the frame follows what the person does, as a share a second. */
  private static readonly FOLLOW = 2.4;
  /** How far the walls lean on a gust, in degrees, and how fast they shiver. */
  private static readonly SHIVER = { degrees: 0.9, speed: 9 };
  /** The most of each thing the drawing has. */
  private static readonly MOST = { bottles: 3, meals: 4, gas: 3, oxygen: 3 };

  private readonly svg: SVGSVGElement;
  private readonly art: TentArt;
  private readonly seat: { readonly x: number; readonly y: number };
  private readonly dweller: DwellerDrawing;
  private readonly parts = new Map<string, SVGElement>();
  private readonly held: readonly SVGElement[];
  private readonly lids: readonly SVGElement[];
  private readonly mouth: SVGElement | null;
  private readonly wind: SVGElement | null;
  private readonly sleeper: SVGElement | null;
  private readonly emptyBag: SVGElement | null;
  private readonly guitarAtRest: SVGElement | null;
  private centre: number | null = null;
  private guitar = false;
  private hasGuitar = false;

  constructor(stage: HTMLElement, sizes: TentSizes) {
    const document = stage.ownerDocument;
    this.art = new TentArt(sizes);
    this.seat = {
      x: this.art.room.from + TentArt.SEAT_IN,
      y: TentArt.FLOOR - TentArt.SEAT - 22,
    };
    this.dweller = new DwellerDrawing(this.seat);
    const svg = document.createElementNS(TentPicture.SVG, "svg");
    svg.setAttribute("class", "tent-picture");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = this.art.markup();
    const dweller = svg.querySelector(".tent-dweller");
    if (dweller !== null) {
      dweller.innerHTML = this.dweller.markup();
    }
    for (const part of svg.querySelectorAll<SVGElement>("[data-part]")) {
      this.parts.set(part.dataset.part ?? "", part);
    }
    this.held = [...svg.querySelectorAll<SVGElement>(".dw-held")];
    this.lids = [...svg.querySelectorAll<SVGElement>(".tent-dweller .dw-lid")];
    this.mouth = svg.querySelector<SVGElement>(".tent-dweller .dw-mouth-open");
    this.wind = svg.querySelector<SVGElement>(".tent-wind");
    this.sleeper = svg.querySelector<SVGElement>(".tent-sleeper");
    this.emptyBag = svg.querySelector<SVGElement>(".tent-bag-empty");
    this.guitarAtRest = svg.querySelector<SVGElement>(".tent-guitar-rest");
    // Whoever's in the bag has their eyes shut.
    for (const lid of svg.querySelectorAll(".tent-sleeper .dw-lid")) {
      lid.setAttribute("ry", "5.4");
      lid.setAttribute("cy", "-0.2");
    }
    this.svg = svg;
    stage.replaceChildren(svg);
  }

  /** The camp it's pitched in: on Base Camp's rubble, with the duffel that came up on a yak, or
   * on the snow above. */
  pitch(rubble: boolean): void {
    this.svg.dataset.ground = rubble ? "rubble" : "snow";
  }

  /** The person as `look` has them, in the middle of `act`, `seconds` of the picture's own time
   * on, the wind outside gusting so hard, 0 to 1. */
  pose(look: DwellerLook, act: Act, seconds: number, gust: number): void {
    const frame = this.dweller.frame(look);
    const set = (part: string, name: string, value: string): void => {
      this.parts.get(part)?.setAttribute(name, value);
    };
    set("all", "transform", frame.all);
    set("all", "opacity", frame.shown.toFixed(3));
    set("torso", "transform", frame.torso);
    set("head", "transform", frame.head);
    for (const side of [0, 1] as const) {
      set(`leg${side}`, "d", frame.legs[side]);
      set(`foot${side}`, "d", frame.feet[side]);
      set(`arm${side}`, "d", frame.arms[side]);
      set(`quilt${side}`, "d", frame.arms[side]);
      set(`hand${side}`, "transform", frame.hands[side]);
    }
    set("stream", "d", frame.stream);
    const holds: readonly Held[] = frame.holds;
    for (const held of this.held) {
      const shown = holds.includes((held.dataset.held ?? "nothing") as Held);
      TentPicture.show(held, shown);
    }
    for (const lid of this.lids) {
      lid.setAttribute("ry", frame.lids.toFixed(2));
      lid.setAttribute("cy", (-5.6 + frame.lids).toFixed(2));
    }
    this.mouth?.setAttribute("ry", frame.mouth.toFixed(2));
    const lap = this.parts.get("guitar");
    if (lap !== undefined) {
      TentPicture.show(lap, frame.guitar);
    }
    this.guitar = frame.guitar;
    if (this.guitarAtRest !== null) {
      TentPicture.show(this.guitarAtRest, this.hasGuitar && !frame.guitar);
    }
    this.sleeper?.setAttribute("opacity", look.lying.toFixed(3));
    this.emptyBag?.setAttribute("opacity", (1 - look.lying).toFixed(3));
    const { dataset, style } = this.svg;
    if (dataset.act !== act) {
      dataset.act = act;
    }
    const flame = look.flame > 0.02 ? "on" : "off";
    if (dataset.flame !== flame) {
      dataset.flame = flame;
    }
    style.setProperty("--flame", look.flame.toFixed(3));
    const playing = frame.guitar ? "yes" : "no";
    if (dataset.playing !== playing) {
      dataset.playing = playing;
    }
    const asleep = look.lying > 0.5 ? "yes" : "no";
    if (dataset.asleep !== asleep) {
      dataset.asleep = asleep;
    }
    // The door's open while the stove burns, for the fumes, and on the way in and out.
    const door = look.flame > 0.02 || look.shift < -40 ? "open" : "shut";
    if (dataset.door !== door) {
      dataset.door = door;
    }
    const { degrees, speed } = TentPicture.SHIVER;
    const lean = degrees * gust * Math.sin(seconds * speed) * (0.6 + 0.4 * Math.sin(seconds * 2.3));
    this.wind?.setAttribute(
      "transform",
      `translate(0 ${TentArt.FLOOR}) skewX(${lean.toFixed(3)}) translate(0 ${-TentArt.FLOOR})`,
    );
  }

  /** What there is in the tent, shown: so many bottles and how full, meals, canisters, oxygen
   * bottles, the gear in the pack and what's left beside it, and the guitar. */
  stock(stock: TentStock): void {
    const { MOST } = TentPicture;
    const each = (selector: string, shown: (index: number, element: SVGElement) => boolean) => {
      for (const element of this.svg.querySelectorAll<SVGElement>(selector)) {
        const [index = "0"] = Object.values(element.dataset);
        TentPicture.show(element, shown(Number(index), element));
      }
    };
    each(".tent-props .tent-bottle", (index, bottle) => {
      const share = Math.min(1, Math.max(0, stock.water - index));
      const water = bottle.querySelector(".tent-water");
      water?.setAttribute("height", (64 * share).toFixed(1));
      water?.setAttribute("y", (-4 - 64 * share).toFixed(1));
      return index < Math.min(MOST.bottles, Math.ceil(stock.bottles));
    });
    each(".tent-meal", (index) => index < Math.min(MOST.meals, stock.meals ?? MOST.meals));
    const canisters = stock.gas === null ? MOST.gas : Math.ceil(stock.gas / stock.canister - 1e-6);
    // One canister is under the stove's burner; the rest stand in the vestibule behind.
    each(".tent-gas", (index) => index < Math.min(MOST.gas, canisters - 1));
    each(".tent-oxygen", (index) => index < Math.min(MOST.oxygen, stock.oxygen));
    for (const [selector, shown] of [
      [".tent-pack-tool", stock.tool],
      [".tent-pack-jumar", stock.jumar],
      [".tent-left-tool", stock.left.tool],
      [".tent-left-jumar", stock.left.jumar],
    ] as const) {
      const element = this.svg.querySelector<SVGElement>(selector);
      if (element !== null) {
        TentPicture.show(element, shown);
      }
    }
    this.hasGuitar = stock.guitar;
    if (this.guitarAtRest !== null) {
      TentPicture.show(this.guitarAtRest, stock.guitar && !this.guitar);
    }
  }

  /** The hour's light and the weather outside, and the lamp inside, on or out. */
  light(atmosphere: Atmosphere, lamp: boolean): void {
    const { palette, light, look } = atmosphere;
    const { style } = this.svg;
    const dark = 1 - light.daylight;
    const colours: Readonly<Record<string, number>> = {
      "--sky-top": palette.skyTop,
      "--sky-low": palette.skyHorizon,
      "--peak-far": palette.faded(palette.faceShade, 0.35 + 0.4 * look.haze),
      "--peak-snow": palette.faded(palette.fluting, 0.25 + 0.4 * look.haze),
      "--peak-near": palette.faded(palette.rock, 0.2 + 0.3 * look.haze),
      "--ground": palette.moraine,
      "--snow": palette.snowTint,
      "--snow-shade": palette.snowShade,
      "--section": Palette.shaded(palette.moraine, 0.45),
      "--section-snow": palette.snowDeep,
    };
    for (const [name, colour] of Object.entries(colours)) {
      style.setProperty(name, Palette.css(colour));
    }
    style.setProperty("--day", light.daylight.toFixed(3));
    style.setProperty("--stars", (light.stars * (1 - look.overcast)).toFixed(3));
    style.setProperty("--snowfall", look.snowfall.toFixed(3));
    style.setProperty("--dusk", (dark * (lamp ? 0.82 : 1)).toFixed(3));
    style.setProperty("--night", (dark * (lamp ? 0 : 0.62)).toFixed(3));
    style.setProperty("--lamp", (lamp ? 0.25 + 0.75 * dark : 0).toFixed(3));
    const lit = lamp ? "on" : "off";
    if (this.svg.dataset.lamp !== lit) {
      this.svg.dataset.lamp = lit;
    }
  }

  /** Frames the picture for a stage so wide and high, in CSS pixels: the whole tent where it
   * fits, and otherwise the part round `focus` of the floor, which the frame follows over
   * `seconds`. */
  frame(width: number, height: number, focus: number, seconds: number): void {
    if (!(width > 0 && height > 0)) {
      return;
    }
    const { FRAME, FOLLOW } = TentPicture;
    const { width: whole } = TentArt.VIEW;
    const aspect = width / height;
    const tall = Math.min(FRAME.most, Math.max(FRAME.least, whole / aspect));
    const wide = aspect * tall;
    const from = TentArt.FROM - 60;
    const to = this.art.end + 60;
    const middle = (from + to) / 2;
    const target =
      wide >= to - from ? middle : Math.min(to - wide / 2, Math.max(from + wide / 2, focus));
    const share = Math.min(1, Math.max(0, seconds) * FOLLOW);
    this.centre = this.centre === null ? target : this.centre + (target - this.centre) * share;
    const top = TentArt.FLOOR + FRAME.under - tall;
    const box = `${(this.centre - wide / 2).toFixed(1)} ${top.toFixed(1)} ${wide.toFixed(1)} ${tall.toFixed(1)}`;
    if (this.svg.getAttribute("viewBox") !== box) {
      this.svg.setAttribute("viewBox", box);
    }
  }

  /** Where along the floor the picture looks for someone at `shift` from their seat. */
  focus(shift: number, lying: number): number {
    const bed = this.art.room.from + TentArt.BAG_IN + 260;
    return this.seat.x + shift - 60 + (bed - this.seat.x + 60) * lying;
  }

  private static show(element: SVGElement, shown: boolean): void {
    const display = shown ? "" : "none";
    if (element.style.display !== display) {
      element.style.display = display;
    }
  }
}
