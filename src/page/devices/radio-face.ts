import type { ActionSink } from "../../input/player-action";
import type { BaseCamp, CallScene } from "../../interface/base-camp";
import { RADIO_PHRASES } from "../../interface/device-texts";
import type { DeviceTextName, RadioPhrase } from "../../interface/device-texts";
import type { Texts } from "../../interface/texts";
import type { ClimberId } from "../../simulation";
import type { DeviceReadings } from "../device-readings";
import { DeviceFace } from "./device-face";
import { RadioDrawing } from "./radio-drawing";
import { SegmentDigits } from "./segment-digits";

/** An answer of Base Camp's on its way: the line it fills, its words, whether it's heard or only
 * static, and the seconds left. */
type Answer = {
  readonly line: HTMLElement;
  readonly words: string;
  readonly heard: boolean;
  left: number;
};

/**
 * The handheld radio on the card (#284): drawn as the thing itself, its screen the channel, the
 * signal's bars and the battery, and TX or RX as it sends or hears; the light on its top red as
 * it sends and green as it hears. Beside it, what the climber can say, a phrase a button, and the
 * log of what was said: a phrase presses the push-to-talk and holds it while it's said, and Base
 * Camp's answer comes a moment later, from the mountain as it was when the phrase was said. The
 * radio's last lines are the screen's alone: the climb keeps the calls.
 */
export class RadioFace extends DeviceFace {
  /** The seconds of play the push-to-talk is held for a phrase, Base Camp takes to answer, and
   * its answer is heard; and the lines the log keeps. The screen's numbers, not the mountain's. */
  private static readonly TALK_SECONDS = 1;
  private static readonly ANSWER_SECONDS = 1.2;
  private static readonly HEARD_SECONDS = 2.4;
  private static readonly LOG_LINES = 6;

  /** The phrases said and not yet heard back, the calls answered so far, and the answers on
   * their way. */
  private readonly asked: { readonly phrase: string; readonly scene: CallScene }[] = [];
  private answered: number;
  private readonly answers: Answer[] = [];
  /** The seconds the radio still sends, and still hears. */
  private talking = 0;
  private hearing = 0;
  private readonly log: HTMLElement;

  constructor(
    face: HTMLElement,
    texts: Texts<DeviceTextName>,
    private readonly climb: DeviceReadings,
    private readonly baseCamp: BaseCamp,
    private readonly sink: ActionSink,
    private readonly player: ClimberId,
  ) {
    super("radio", face, new RadioDrawing(), texts);
    this.answered = climb.calls.length;
    this.log = this.find(".radio__log");
    this.log.dataset.empty = texts.say("radio.empty");
    const channel = this.find("[data-read='channel']");
    channel.innerHTML = new SegmentDigits(1, 10).svg("1");
    const name = face.ownerDocument.createElement("span");
    name.className = "device__unseen";
    name.textContent = texts.say("radio.channel-label");
    channel.append(name);
    const phrases = this.find(".radio__phrases");
    for (const phrase of RADIO_PHRASES) {
      const button = face.ownerDocument.createElement("button");
      button.type = "button";
      button.dataset.phrase = phrase;
      button.textContent = texts.say(`phrase.${phrase}`);
      button.addEventListener("click", () => {
        this.say(phrase);
      });
      phrases.append(button);
    }
  }

  /** The calls the game has heard since the last frame get Base Camp's answer, a moment later:
   * from the mountain as it was when the phrase was said. Whether or not the card is open. */
  hear(seconds: number): void {
    const calls = this.climb.calls;
    for (; this.answered < calls.length; this.answered += 1) {
      const call = calls[this.answered];
      if (call === undefined) {
        break;
      }
      const at = this.asked.findIndex(({ phrase }) => phrase === call.phrase);
      const scene = at === -1 ? this.climb.scene : this.asked.splice(at, 1)[0]?.scene;
      const words = this.baseCamp.answer(call, scene ?? this.climb.scene).join(" ");
      const line = this.line(call.heard ? "base-camp" : "static", this.texts.say("radio.waiting"));
      this.answers.push({ line, words, heard: call.heard, left: RadioFace.ANSWER_SECONDS });
    }
    this.talking = Math.max(0, this.talking - seconds);
    this.hearing = Math.max(0, this.hearing - seconds);
    if (this.talking === 0) {
      this.letGo("ptt");
    }
    for (const answer of this.answers) {
      answer.left -= seconds;
      if (answer.left <= 0) {
        answer.line.textContent = answer.words;
        answer.line.dataset.said = "yes";
        this.log.scrollTop = this.log.scrollHeight;
        // Static opens no squelch: only a voice lights the receive light.
        if (answer.heard) {
          this.hearing = RadioFace.HEARD_SECONDS;
          this.lightUp();
        }
      }
    }
    for (let at = this.answers.length - 1; at >= 0; at -= 1) {
      if ((this.answers[at]?.left ?? 0) <= 0) {
        this.answers.splice(at, 1);
      }
    }
  }

  draw(seconds: number, daylight: number): void {
    this.light(seconds, daylight);
    const contact = this.climb.radio.contact;
    DeviceFace.mark(this.screen, "contact", contact ? "yes" : "no");
    const air = this.talking > 0 ? "tx" : this.hearing > 0 ? "rx" : "idle";
    DeviceFace.mark(this.body, "air", air);
    this.set("air", air === "idle" ? "" : this.texts.say(`radio.${air}`));
    this.set("contact", this.texts.say(contact ? "radio.contact" : "radio.no-contact"));
  }

  /** The radio has no button of its own to press here: its phrases say what's said. */
  protected pressed(): void {
    return;
  }

  /** A ready phrase into the radio: the push-to-talk held while it's said, the climber's words
   * in the log, and the call to the game. */
  private say(phrase: RadioPhrase): void {
    const scene = this.climb.scene;
    this.talking = RadioFace.TALK_SECONDS;
    this.hearing = 0;
    this.hold("ptt");
    this.lightUp();
    this.line("you", this.baseCamp.said(phrase, scene));
    this.asked.push({ phrase, scene });
    this.sink.send({ kind: "radio", climber: this.player, channel: "base-camp", phrase });
  }

  /** A line of the radio's log, the latest last, and its words' element. */
  private line(who: "you" | "base-camp" | "static", words: string): HTMLElement {
    const document = this.face.ownerDocument;
    const item = document.createElement("li");
    item.dataset.who = who;
    if (who !== "static") {
      const name = document.createElement("strong");
      name.textContent = this.texts.say(`who.${who}`);
      item.append(name, " ");
    }
    const said = document.createElement("span");
    said.textContent = words;
    item.append(said);
    this.log.append(item);
    while (this.log.children.length > RadioFace.LOG_LINES) {
      this.log.firstElementChild?.remove();
    }
    this.log.scrollTop = this.log.scrollHeight;
    return said;
  }
}
