/** The tent a climber goes into: where its door's end is on the ground, across the slope, and
 * the way its body lies from there. */
export interface Doorway {
  readonly x: number;
  readonly lies: 1 | -1;
}

/**
 * A climber on their way into a tent or out of it, as the picture draws them this frame: how far
 * along the ground from where the physics has them they're drawn; how far down on their hands and
 * knees they are, 0 on their feet to 1 crawling; the way they face, into the tent going in and
 * out of it coming out, or as they are; how much of them shows, 1 outside to 0 inside; how far
 * the tent's door is open, 0 to 1; whether they're inside, nothing of them to draw; whether
 * they're on their way through the door, and which way.
 */
export interface EntryLook {
  readonly shift: number;
  readonly down: number;
  readonly facing: 1 | -1 | null;
  readonly shown: number;
  readonly open: number;
  readonly inside: boolean;
  readonly passing: boolean;
  readonly way: "in" | "out" | null;
}

/**
 * The way into a tent and out of it, in the picture's own seconds (#258): the simulation takes a
 * climber in at once (`ClimberView.sheltered`), and the picture shows how. Going in, they step to
 * the door as its flap opens, go down on their hands and knees, crawl in through it and are gone,
 * and the flap falls behind them; coming out, the flap opens, they crawl out, get up and step
 * back to where they stand. One already inside when the picture first sees them is inside.
 */
export class TentEntry {
  /** How long the way in takes, and the way out. */
  static readonly SECONDS = { in: 2.6, out: 2.4 };
  /** How far before the door's end they go down, and how far past it they crawl, in metres. */
  static readonly BEFORE = 0.4;
  static readonly PAST = 0.85;
  /** The way in's parts, as shares of it: to the door by, down by, crawling in until, gone by. */
  private static readonly IN = { step: 0.2, down: 0.4, crawl: 0.9, fade: 0.68 };
  /** The way out's: the flap open by, crawling out until, up by. */
  private static readonly OUT = { open: 0.1, crawl: 0.55, up: 0.78, show: 0.3 };
  private static readonly OUTSIDE: EntryLook = {
    shift: 0,
    down: 0,
    facing: null,
    shown: 1,
    open: 0,
    inside: false,
    passing: false,
    way: null,
  };

  private sheltered: boolean | null = null;
  /** How far through the way in or out they are, 0 to 1: 1 once it's done. */
  private through = 1;
  private doorway: Doorway | null = null;
  /** How far from the door's end they stood as they set out for it, once that's known. */
  private from = 0;
  private placed = false;

  /** The look `seconds` after the last, for a climber drawn at `x` across the slope, `sheltered`
   * or not, whose tent is `doorway`: none where there's no tent to show them at. */
  advance(seconds: number, sheltered: boolean, x: number, doorway: Doorway | null): EntryLook {
    if (this.sheltered === null) {
      // First seen: where they are, with no way in or out to show.
      this.sheltered = sheltered;
      this.through = 1;
    } else if (sheltered !== this.sheltered) {
      this.sheltered = sheltered;
      this.through = 0;
    }
    if (doorway !== null) {
      this.doorway = doorway;
    }
    const door = this.doorway;
    if (door === null) {
      return sheltered ? { ...TentEntry.OUTSIDE, shown: 0, inside: true } : TentEntry.OUTSIDE;
    }
    if (this.through === 0 || !this.placed) {
      this.from = x - door.x;
      this.placed = true;
    }
    const whole = sheltered ? TentEntry.SECONDS.in : TentEntry.SECONDS.out;
    this.through = Math.min(1, this.through + Math.max(seconds, 0) / whole);
    return sheltered ? this.goingIn(door) : this.comingOut(door);
  }

  private goingIn(door: Doorway): EntryLook {
    const t = this.through;
    const kneelAt = -door.lies * TentEntry.BEFORE;
    const reach = TentEntry.BEFORE + TentEntry.PAST;
    if (t >= 1) {
      // Inside, where they crawled to: the camera stays on the tent.
      const shift = kneelAt + door.lies * reach - this.from;
      return { ...TentEntry.OUTSIDE, shift, down: 1, shown: 0, inside: true, facing: door.lies };
    }
    const { step, down, crawl, fade } = TentEntry.IN;
    const stepped = TentEntry.ease(t / step);
    const crawled = TentEntry.ease((t - down) / (crawl - down));
    // From where they stood to before the door, then in through it.
    const at = this.from + (kneelAt - this.from) * stepped + door.lies * reach * crawled;
    return {
      shift: at - this.from,
      down: TentEntry.ease((t - step) / (down - step)),
      facing: door.lies,
      shown: 1 - TentEntry.ease((t - fade) / (crawl - fade)),
      open: Math.min(TentEntry.ease(t / step), 1 - TentEntry.ease((t - crawl) / (1 - crawl))),
      inside: t >= crawl,
      passing: true,
      way: "in",
    };
  }

  private comingOut(door: Doorway): EntryLook {
    const t = this.through;
    if (t >= 1) {
      return TentEntry.OUTSIDE;
    }
    const { open, crawl, up, show } = TentEntry.OUT;
    const way = door.lies === 1 ? -1 : 1;
    const kneelAt = -door.lies * TentEntry.BEFORE;
    const reach = TentEntry.BEFORE + TentEntry.PAST;
    const crawled = TentEntry.ease((t - open) / (crawl - open));
    const stepped = TentEntry.ease((t - up) / (1 - up));
    const inside = kneelAt + door.lies * reach;
    const at = inside + (kneelAt - inside) * crawled + (this.from - kneelAt) * stepped;
    return {
      shift: at - this.from,
      down: 1 - TentEntry.ease((t - crawl) / (up - crawl)),
      facing: way,
      shown: TentEntry.ease((t - open) / (show - open)),
      open: Math.min(TentEntry.ease(t / open), 1 - TentEntry.ease((t - up) / (1 - up))),
      inside: false,
      passing: true,
      way: "out",
    };
  }

  /** 0 to 1 with an easy start and end. */
  private static ease(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
