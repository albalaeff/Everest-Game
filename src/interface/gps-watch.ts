/** The route a GPS watch has loaded: its real length in metres, the length of its ground as the
 * game draws it, the altitudes of its foot and its top, and its parts, each a stretch of that
 * ground. */
export interface GpsRoute {
  readonly length: number;
  readonly ground: number;
  readonly foot: number;
  readonly top: number;
  readonly parts: readonly { readonly id: string; readonly from: number; readonly to: number }[];
}

/** Where the watch's wearer is: how far along the drawn ground, their altitude, whether the
 * watch sees the sky, the mountain's seconds since they set off, and its time of day. */
export interface GpsPlace {
  readonly along: number;
  readonly altitude: number;
  readonly sky: boolean;
  readonly elapsed: number;
  readonly timeOfDay: number;
}

/** What the watch shows: whether it has a fix; the share of the route done; the metres done and
 * left along it, and climbed and left to climb; the rate of climb so far, in metres an hour; the
 * time of day it would reach the top at the pace so far, in seconds; and the part it's on. The
 * rate and the arrival are null until there's enough of a track to tell. */
export interface GpsFix {
  readonly fix: boolean;
  readonly share: number;
  readonly done: number;
  readonly left: number;
  readonly climbed: number;
  readonly toClimb: number;
  readonly rate: number | null;
  readonly arrival: number | null;
  readonly part: string;
}

/**
 * A GPS watch on the wrist (#260), as climbers wear on Everest (gear.watch-altimeter): where its
 * wearer is on the route it has loaded, how far and how high they've come and have left, how fast
 * they climb, and when they'd be at the top at the pace so far, which is what tells them whether
 * they'll be out of the Icefall before the sun is on it. It needs a clear view of the sky
 * (gear.gps-limits): with none, it has no fix. It keeps nothing: the track is the mountain's
 * clock and the place.
 */
export class GpsWatch {
  /** The mountain's seconds of track, and the metres of route, before the watch gives a pace:
   * the screen's own patience, not the mountain's. */
  private static readonly ENOUGH_SECONDS = 300;
  private static readonly ENOUGH_METRES = 20;
  private static readonly SECONDS_AN_HOUR = 3600;

  constructor(private readonly route: GpsRoute) {
    const { length, ground, parts } = route;
    if (!(length > 0 && ground > 0 && parts.length > 0)) {
      throw new RangeError("A GPS watch needs a route with a length and its parts");
    }
  }

  /** The watch's reading at a place. */
  reading(place: GpsPlace): GpsFix {
    const { length, ground, foot, top } = this.route;
    const share = Math.min(1, Math.max(0, place.along / ground));
    const done = share * length;
    const left = length - done;
    const climbed = place.altitude - foot;
    const tracked =
      place.elapsed >= GpsWatch.ENOUGH_SECONDS && done >= GpsWatch.ENOUGH_METRES && left > 0;
    return {
      fix: place.sky,
      share,
      done,
      left,
      climbed,
      toClimb: Math.max(0, top - place.altitude),
      rate: tracked ? (climbed / place.elapsed) * GpsWatch.SECONDS_AN_HOUR : null,
      arrival: tracked ? place.timeOfDay + left / (done / place.elapsed) : null,
      part: this.partAt(place.along),
    };
  }

  /** The part of the route a place along the ground is on: the last, past the top. */
  private partAt(along: number): string {
    const { parts } = this.route;
    const part = parts.find(({ to }) => along < to) ?? parts[parts.length - 1];
    if (part === undefined) {
      throw new RangeError("The route has no parts");
    }
    return part.id;
  }
}
