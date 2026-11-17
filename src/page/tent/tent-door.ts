import type { ActionSink } from "../../input/player-action";
import { SlopePin } from "../../interface/slope-pin";
import type { ScreenPlace } from "../../interface/sherpa-bubble";
import type { Texts } from "../../interface/texts";
import type { Point } from "../../physics";
import type { ClimberId, TentDoor } from "../../simulation";
import type { Passage } from "./tent-screen";
import type { TentTextName } from "./tent-readout";

/**
 * The way into a tent, on the slope (#258): while the player's climber stands at a tent's door,
 * on their feet, a button is pinned over that tent, [Enter the tent], with the tent's key on it
 * where there's a keyboard. A click or a tap on it is the tent's key: the same action of the
 * game's, so a room and a replay see it. It hides once they're on their way in, away from every
 * door, and where the page draws no picture, where the controls' own button stays.
 */
export class TentDoorPin {
  private readonly pin: SlopePin;
  private door: string | null = null;

  constructor(
    window: Window,
    texts: Texts<TentTextName>,
    private readonly tents: { door(id: ClimberId): TentDoor | null },
    private readonly player: ClimberId,
    sink: ActionSink,
    place: ScreenPlace,
    /** Where a tent of a camp is on the slope, over its door: none before the picture draws. */
    private readonly over: (camp: string, tent: number) => Point | null,
    private readonly passage: () => Passage,
  ) {
    const button = window.document.querySelector<HTMLButtonElement>("#tent-door");
    const words = button?.querySelector<HTMLElement>("[data-text='enter']") ?? null;
    if (button === null || words === null) {
      throw new RangeError("No #tent-door on the page");
    }
    words.textContent = texts.say("enter");
    button.addEventListener("click", () => {
      sink.send({ kind: "tent", climber: player, go: "in" });
    });
    this.pin = new SlopePin(window, button, place);
  }

  /** Each frame: over the door the player stands at, or hidden. */
  update(): void {
    const door = this.passage() === "outside" ? this.tents.door(this.player) : null;
    this.door = door === null ? null : `${door.camp}/${door.tent}`;
    this.pin.at(door === null ? null : this.over(door.camp, door.tent));
  }

  /** The door the button is for, as `camp/tent`: for the stories. */
  get at(): string | null {
    return this.door;
  }
}
