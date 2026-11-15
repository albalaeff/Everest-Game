import type { Point } from "../physics";
import type { SeededRandom } from "../simulation";

/** A puff of blown snow as a layer draws it: its middle, in the layer's metres, how long it is
 * along its heading and how thick across it, its heading (radians from +x, y up), and how much of
 * it shows, 0 to 1. */
export interface Puff {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly thickness: number;
  readonly heading: number;
  readonly shows: number;
}

/** The wind a frame blows the snow with: the weather's, 0 to 1, as it gusts, and a gust on its
 * way that jolts the climbers (#197), 0 to 1 as it comes and goes. */
export interface SnowWind {
  readonly wind: number;
  readonly blowing: number;
}

/** Where the layer shows the slope this frame, along x, in its metres. */
export interface SnowView {
  readonly from: number;
  readonly to: number;
}

/** A value in a breeze, in a strong wind and in a gust's wave. */
interface ByWind {
  readonly breeze: number;
  readonly strong: number;
  readonly gust: number;
}

/** A puff between frames: what's drawn, its own shares of the wind's ride, size and speed, its
 * age and life in seconds, whether it streams off an edge, and the edge it streams off now. */
interface Blown {
  x: number;
  y: number;
  length: number;
  thickness: number;
  heading: number;
  shows: number;
  age: number;
  life: number;
  readonly ride: number;
  readonly size: number;
  readonly speed: number;
  readonly wisp: boolean;
  edge: Point | null;
}

/**
 * The snow the wind lifts off the ground (#223): soft puffs, see-through, so many as the
 * graphics setting allows, in the layer's metres around what the camera shows; the wind blows
 * them downwind, along +x. None in a calm. In a breeze, thin veils skim the surface ankle-high,
 * following its rises and dips, and a wisp trails off each edge: a lip, a wall's top, a serac's;
 * in a strong wind the veils ride knee-high and the wisps stream into plumes a few metres long.
 * A veil rises over a rise as steep as it can follow, dies against a wall, and over a lip goes on
 * and sinks, so the snow pours off into the crevasse. A gust on its way (#197) sends a wave of
 * snow from upwind across the view in a second or two, waist-high, which settles over a few
 * seconds once the gust has gone. Drawn by a seeded generator of the picture's own, never the
 * simulation's; the drawing is the layer's, this is where the puffs are.
 */
export class BlownSnow {
  /** The wind that starts to lift the snow, how much more it takes to show it whole, and the wind
   * that lifts all a steady wind lifts: the gust's strength, 0 to 1. */
  private static readonly CALM = 0.16;
  private static readonly SHOWING = 0.12;
  private static readonly STRONG = 0.7;
  /** A veil's middle over the ground, its thickness and its length, in metres; and how much of it
   * shows. */
  private static readonly RIDE: ByWind = { breeze: 0.07, strong: 0.25, gust: 0.7 };
  private static readonly THICK: ByWind = { breeze: 0.12, strong: 0.4, gust: 0.75 };
  private static readonly LONG: ByWind = { breeze: 1, strong: 2.6, gust: 3.6 };
  private static readonly SHOW: ByWind = { breeze: 0.35, strong: 0.65, gust: 0.85 };
  /** How fast the snow blows, in metres a second: in no wind, and this much more in the whole of
   * it. */
  private static readonly SPEED = { least: 1.5, wind: 9 };
  /** How steep a rise a veil follows, and a slope down, as their rise over their run; and how fast
   * it sinks off a lip at the least, in metres a second. */
  private static readonly CLIMBS = 0.8;
  private static readonly FOLLOWS_DOWN = 0.5;
  private static readonly SINK = 1.1;
  /** How long a veil lives, in seconds, the least and the most; how fast its heading turns to the
   * way it goes, in seconds, and how far it tilts off the wind's line at the most, in radians: the
   * wind blows it along, even where it goes up or down a slope. */
  private static readonly LIFE = { min: 1.2, max: 3.2 };
  private static readonly TURN_SECONDS = 0.15;
  private static readonly TILT = 0.45;
  /** The share of the puffs that stream off the edges, as wisps; how long one lives in a breeze
   * and in a strong wind, in seconds; how fast it lifts as it leaves the edge and sinks as it
   * goes, in metres a second; and how long and thick it grows, in metres. */
  private static readonly WISPS = 0.35;
  private static readonly WISP_LIFE = { breeze: 0.45, strong: 0.6 };
  /** How fast a wisp goes against the wind: the air's slower in an edge's lee. */
  private static readonly WISP_SPEED = 0.7;
  private static readonly WISP_RISE = 0.6;
  private static readonly WISP_SINK = 1;
  private static readonly WISP_LONG = { from: 0.25, to: 1.6 };
  private static readonly WISP_THICK = { from: 0.08, to: 0.45 };
  private static readonly WISP_SHOW = 0.8;
  /** A gust's wave: how long its front takes to cross the view, in seconds, how soft its edge is,
   * in metres, and how long it takes to settle once the gust has gone, in seconds. */
  private static readonly WAVE_SECONDS = 2.2;
  private static readonly FRONT_EDGE = 4;
  private static readonly SETTLE = 3;
  /** An edge the wind streams snow off: a corner where the ground turns down by so much, in
   * radians, standing no lower than the highest ground so near it, in metres, by more than so
   * much; and the highest of those so close along x. */
  private static readonly TURN = 0.6;
  private static readonly NEAR = 2;
  private static readonly DEPTH = 0.8;
  private static readonly APART = 1.5;

  private readonly blown: readonly Blown[];
  private readonly edges: readonly Point[];
  /** How long the gust's wave has come for, in seconds, and how strong it is as it settles. */
  private waveAge = 0;
  private surge = 0;
  private nextEdge = 0;

  constructor(
    count: number,
    edges: readonly Point[],
    private readonly random: SeededRandom,
  ) {
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    const wisps = edges.length > 0 ? Math.round(count * BlownSnow.WISPS) : 0;
    this.edges = [...edges].sort((a, b) => a.x - b.x);
    this.blown = Array.from({ length: count }, (_, index) => ({
      x: Number.NaN,
      y: 0,
      length: 0,
      thickness: 0,
      heading: 0,
      shows: 0,
      age: 0,
      life: 0,
      // From near the snow to well over it, so the veils together fill the height they ride to.
      ride: between(0.3, 1.7),
      size: between(0.7, 1.3),
      speed: between(0.75, 1.25),
      wisp: index < wisps,
      edge: null,
    }));
  }

  /** The edges the wind streams snow off along a ground's line, its x going on and never back: a
   * corner where it turns down by more than a little, a lip or the top of a wall or a block,
   * standing near the top of the ground about it, so none from a ledge down in a crevasse; the
   * highest of any so close along it. */
  static edgesOf(line: readonly Point[]): Point[] {
    const edges: Point[] = [];
    for (let index = 1; index + 1 < line.length; index += 1) {
      const [before, corner, after] = [line[index - 1], line[index], line[index + 1]];
      if (before === undefined || corner === undefined || after === undefined) {
        continue;
      }
      const into = Math.atan2(corner.y - before.y, corner.x - before.x);
      const out = Math.atan2(after.y - corner.y, after.x - corner.x);
      if (into - out <= BlownSnow.TURN) {
        continue;
      }
      const highest = Math.max(
        ...line.filter(({ x }) => Math.abs(x - corner.x) <= BlownSnow.NEAR).map(({ y }) => y),
      );
      if (corner.y < highest - BlownSnow.DEPTH) {
        continue;
      }
      const last = edges.at(-1);
      if (last !== undefined && corner.x - last.x < BlownSnow.APART) {
        if (corner.y > last.y) {
          edges[edges.length - 1] = corner;
        }
        continue;
      }
      edges.push(corner);
    }
    return edges;
  }

  get puffs(): readonly Puff[] {
    return this.blown;
  }

  /** `seconds` more of the wind over `ground`, where the layer shows the slope. */
  blow(seconds: number, wind: SnowWind, ground: (x: number) => number, view: SnowView): void {
    this.wave(seconds, wind.blowing);
    const front = view.from + (this.waveAge / BlownSnow.WAVE_SECONDS) * (view.to - view.from);
    const edges = this.edges.filter(({ x }) => x >= view.from && x <= view.to);
    // Behind the wave's front the gust blows; ahead of it, the weather's wind alone.
    const surge = (x: number): number =>
      this.surge * BlownSnow.smooth((front - x) / BlownSnow.FRONT_EDGE + 0.5);
    for (const puff of this.blown) {
      if (puff.wisp) {
        this.stream(puff, seconds, wind.wind, surge, ground, edges);
      } else {
        this.skim(puff, seconds, wind.wind, surge, ground, view);
      }
    }
  }

  /** The gust's wave: it comes while the gust does, and settles once it's gone. */
  private wave(seconds: number, blowing: number): void {
    const coming = Math.min(Math.max(blowing, 0), 1);
    this.surge =
      coming >= this.surge ? coming : Math.max(coming, this.surge - seconds / BlownSnow.SETTLE);
    this.waveAge = this.surge > 0 ? this.waveAge + seconds : 0;
  }

  /** A veil along the ground: it blows on, over the rises it can follow and off the lips, and
   * comes again somewhere in the view once its life is over, it's left the view or it's run into
   * a wall. */
  private skim(
    puff: Blown,
    seconds: number,
    wind: number,
    surgeAt: (x: number) => number,
    ground: (x: number) => number,
    view: SnowView,
  ): void {
    puff.age += seconds;
    const first = Number.isNaN(puff.x);
    const inView = puff.x >= view.from && puff.x <= view.to;
    let surge = surgeAt(puff.x);
    if (!inView || puff.age >= puff.life) {
      const { LIFE, RIDE } = BlownSnow;
      puff.x = view.from + this.random.fraction() * (view.to - view.from);
      surge = surgeAt(puff.x);
      puff.y = ground(puff.x) + puff.ride * BlownSnow.byWind(RIDE, wind, surge);
      puff.heading = BlownSnow.turned(
        0,
        Math.atan2(ground(puff.x + 0.5) - ground(puff.x - 0.5), 1),
        BlownSnow.TURN_SECONDS,
      );
      puff.life = LIFE.min + this.random.fraction() * (LIFE.max - LIFE.min);
      // The first time, somewhere in its life, so they don't all come and go together.
      puff.age = first ? this.random.fraction() * puff.life : 0;
    } else {
      const local = Math.max(wind, surge);
      const speed = puff.speed * (BlownSnow.SPEED.least + BlownSnow.SPEED.wind * local);
      const x = puff.x + speed * seconds;
      const floor = ground(x);
      const target = floor + puff.ride * BlownSnow.byWind(BlownSnow.RIDE, wind, surge);
      const climb = speed * BlownSnow.CLIMBS * seconds;
      const sink = Math.max(BlownSnow.SINK, speed * BlownSnow.FOLLOWS_DOWN) * seconds;
      const y =
        puff.y < target ? Math.min(target, puff.y + climb) : Math.max(target, puff.y - sink);
      if (y < floor) {
        // Into a wall steeper than it can follow: it's gone, and comes again elsewhere.
        puff.age = puff.life;
        puff.shows = 0;
        return;
      }
      puff.heading = BlownSnow.turned(puff.heading, Math.atan2(y - puff.y, x - puff.x), seconds);
      puff.x = x;
      puff.y = y;
    }
    const local = Math.max(wind, surge);
    puff.length = puff.size * BlownSnow.byWind(BlownSnow.LONG, wind, surge);
    puff.thickness = puff.size * BlownSnow.byWind(BlownSnow.THICK, wind, surge);
    puff.shows =
      Math.sin(Math.PI * Math.min(puff.age / puff.life, 1)) *
      BlownSnow.presence(local) *
      BlownSnow.byWind(BlownSnow.SHOW, wind, surge);
  }

  /** A wisp off an edge in the view: it leaves the edge downwind, lifting, then sinks as it
   * spreads and fades; the next comes off the next edge in the view, in turn. */
  private stream(
    puff: Blown,
    seconds: number,
    wind: number,
    surgeAt: (x: number) => number,
    ground: (x: number) => number,
    edges: readonly Point[],
  ): void {
    puff.age += seconds;
    const first = Number.isNaN(puff.x);
    const shown = puff.edge !== null && edges.includes(puff.edge);
    if (!shown || puff.age >= puff.life) {
      this.nextEdge = (this.nextEdge + 1) % Math.max(edges.length, 1);
      const edge = edges[this.nextEdge];
      puff.edge = edge ?? null;
      puff.shows = 0;
      if (edge === undefined) {
        puff.age = 0;
        puff.life = BlownSnow.LIFE.min;
        return;
      }
      const lift = BlownSnow.lift(Math.max(wind, surgeAt(edge.x)));
      const { breeze, strong } = BlownSnow.WISP_LIFE;
      puff.x = edge.x;
      puff.y = edge.y + 0.05 * this.random.fraction();
      puff.heading = 0;
      puff.life = (breeze + (strong - breeze) * lift) * (0.7 + 0.6 * this.random.fraction());
      puff.age = first ? this.random.fraction() * puff.life : 0;
      return;
    }
    const surge = surgeAt(puff.x);
    const local = Math.max(wind, surge);
    const lift = BlownSnow.lift(local);
    const share = Math.min(puff.age / puff.life, 1);
    const speed =
      BlownSnow.WISP_SPEED * puff.speed * (BlownSnow.SPEED.least + BlownSnow.SPEED.wind * local);
    const rise = BlownSnow.WISP_RISE * (1 - share) - BlownSnow.WISP_SINK * share;
    const x = puff.x + speed * seconds;
    const y = Math.max(puff.y + rise * seconds, ground(x));
    puff.heading = BlownSnow.turned(puff.heading, Math.atan2(y - puff.y, x - puff.x), seconds);
    puff.x = x;
    puff.y = y;
    const grown = (0.6 + 0.4 * lift + 0.6 * surge) * puff.size;
    const { WISP_LONG: long, WISP_THICK: thick } = BlownSnow;
    puff.length = grown * (long.from + (long.to - long.from) * share);
    puff.thickness = grown * (thick.from + (thick.to - thick.from) * share);
    const fading = Math.min(share / 0.15, 1) * (1 - share) ** 1.5;
    puff.shows = fading * BlownSnow.presence(local) * BlownSnow.WISP_SHOW;
  }

  /** A value of a puff's in the weather's wind and the gust's wave there. */
  private static byWind(value: ByWind, wind: number, surge: number): number {
    const lift = BlownSnow.lift(Math.max(wind, surge));
    return (
      value.breeze + (value.strong - value.breeze) * lift + (value.gust - value.strong) * surge
    );
  }

  /** How much of what a steady wind lifts this wind does, 0 to 1. */
  private static lift(wind: number): number {
    return BlownSnow.smooth((wind - BlownSnow.CALM) / (BlownSnow.STRONG - BlownSnow.CALM));
  }

  /** A heading turned towards the way the puff goes, over a few frames, and tilted no more than
   * a little off the wind's line. */
  private static turned(heading: number, towards: number, seconds: number): number {
    const { TILT, TURN_SECONDS } = BlownSnow;
    const way = Math.min(Math.max(towards, -TILT), TILT);
    return heading + (way - heading) * Math.min(seconds / TURN_SECONDS, 1);
  }

  /** How much of the snow shows in this wind, 0 to 1: none in a calm. */
  private static presence(wind: number): number {
    return BlownSnow.smooth((wind - BlownSnow.CALM) / BlownSnow.SHOWING);
  }

  private static smooth(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
