import type { PointerPress } from "./pointer-source";
import { Steering } from "./steering";

/** The finger on the joystick, from where it landed. */
export class Thumb {
  /** As wide as `#joystick` in style.css, from its middle to its edge. */
  private static readonly REACH_PIXELS = 60;
  private static readonly LONGEST_TAP_MILLISECONDS = 250;

  private pushed = false;

  constructor(private readonly landing: PointerPress) {}

  get pointerId(): number {
    return this.landing.pointerId;
  }

  /** How far the stick is pushed, as shares of its reach: the knob stays on the ring. */
  stick(event: PointerPress): readonly [number, number] {
    const x = (event.clientX - this.landing.clientX) / Thumb.REACH_PIXELS;
    const y = (event.clientY - this.landing.clientY) / Thumb.REACH_PIXELS;
    const push = Math.max(Math.hypot(x, y), 1);
    return [x / push, y / push];
  }

  steering(event: PointerPress): Steering {
    const [x, y] = this.stick(event);
    const steering = Steering.ofStick(x, y);
    this.pushed ||= steering !== Steering.STOPPED;
    return steering;
  }

  /** Whether it only tapped the slope: quick, and it never pushed the stick. */
  tappedAt(lift: PointerPress): boolean {
    return !this.pushed && lift.timeStamp - this.landing.timeStamp < Thumb.LONGEST_TAP_MILLISECONDS;
  }
}
