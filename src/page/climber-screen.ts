import type { GuideAdvice } from "../content/guide-advice";
import { Questionnaire } from "../content/questionnaire";
import type {
  ClimberAnswers,
  NumberQuestion,
  OneQuestion,
  SomeQuestion,
} from "../content/questionnaire";
import { PageElements } from "../input/page-elements";
import type { Texts } from "../interface/texts";

/**
 * Your climber (#145): before every new climb alone, the player says who is climbing, and their
 * guide says in plain words what that means on the mountain, again as each answer changes. The
 * answers kept from the last climb open as a summary, with [Keep these answers] and [Edit
 * climber]; the first time, and on [Edit climber], the questions open filled in, with the typical
 * client's answers the first time, and [Climb] sets off. The questions and their choices are the
 * questionnaire's, the words content/climber.json's, and the guide's lines `GuideAdvice`'s.
 */
export class ClimberScreen {
  /** The screen's own words, by their names in content/climber.json and index.html. */
  static readonly TEXTS = [
    "title",
    "intro",
    "age",
    "height",
    "weight",
    "cm",
    "kg",
    "sex",
    "training",
    "experience",
    "illness",
    "conditions",
    "conditions-legend",
    "guide",
    "climb",
    "keep",
    "edit",
  ] as const;

  private readonly elements: PageElements;
  private readonly dialog: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly summary: HTMLElement;
  private readonly advice: HTMLElement;
  private readonly climb: HTMLElement;
  private readonly keep: HTMLElement;
  private readonly edit: HTMLElement;

  constructor(
    private readonly window: Window,
    private readonly texts: Texts,
    private readonly questionnaire: Questionnaire,
    private readonly guide: GuideAdvice,
  ) {
    this.elements = new PageElements(window.document);
    for (const text of ClimberScreen.TEXTS) {
      this.find(`[data-text="${text}"]`).textContent = texts.say(text);
    }
    this.dialog = this.find("");
    this.form = this.find("form") as HTMLFormElement;
    this.summary = this.find("dl");
    this.advice = this.find(".guide ul");
    this.climb = this.find('[data-text="climb"]');
    this.keep = this.find('[data-text="keep"]');
    this.edit = this.find('[data-text="edit"]');
    for (const question of Questionnaire.NUMBERS) {
      const { min, max } = questionnaire.data.limits[question];
      Object.assign(this.input(question), { min: String(min), max: String(max) });
    }
    for (const question of Questionnaire.ONE) {
      this.offer(question, "radio");
    }
    for (const question of Questionnaire.SOME) {
      this.offer(question, "checkbox");
    }
  }

  /** Shows it on the answers `kept` from the last climb, or on the questions when there are
   * none, and starts the climb once the player has answered. */
  show(kept: ClimberAnswers | null, then: (answers: ClimberAnswers) => void): void {
    const climb = (answers: ClimberAnswers): void => {
      if (this.dialog.hidden) {
        return;
      }
      // An answer that keeps the keys, hidden, keeps them from the climb: the controls leave keys
      // typed into a field alone.
      this.dialog.querySelector<HTMLElement>(":focus")?.blur();
      this.dialog.hidden = true;
      then(answers);
    };
    this.keep.addEventListener("click", () => {
      if (kept !== null) {
        climb(kept);
      }
    });
    this.edit.addEventListener("click", () => {
      this.ask(kept ?? this.questionnaire.typical);
    });
    this.form.addEventListener("input", () => {
      const answers = this.answered();
      if (answers !== null) {
        this.advise(answers);
      }
    });
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const answers = this.answered();
      if (answers !== null) {
        climb(answers);
      }
    });
    this.dialog.hidden = false;
    if (kept === null) {
      this.ask(this.questionnaire.typical);
    } else {
      this.recap(kept);
    }
  }

  /** The answers kept, question by question, and what the guide says of them. */
  private recap(answers: ClimberAnswers): void {
    this.view(true);
    this.summary.replaceChildren(...this.rows(answers));
    this.advise(answers);
    this.keep.focus();
  }

  /** The questions, filled in with `answers`, from the top. On a PC the first answer takes the
   * keys; a phone would open its keyboard over the questions, so [Climb] does. */
  private ask(answers: ClimberAnswers): void {
    this.view(false);
    this.fill(answers);
    this.advise(answers);
    this.dialog.scrollTop = 0;
    if (this.window.matchMedia("(pointer: fine)").matches) {
      this.input("age").focus();
    } else {
      this.climb.focus({ preventScroll: true });
    }
  }

  /** The summary and its buttons, or the questions and [Climb]. */
  private view(summary: boolean): void {
    this.summary.hidden = !summary;
    this.keep.hidden = !summary;
    this.edit.hidden = !summary;
    this.form.hidden = summary;
    this.climb.hidden = summary;
  }

  private advise(answers: ClimberAnswers): void {
    this.advice.replaceChildren(
      ...this.guide
        .lines(answers)
        .map(({ name, fills }) => this.written("li", this.texts.say(name, fills))),
    );
  }

  /** The answers as the questions have them, if they answer every one within its limits. */
  private answered(): ClimberAnswers | null {
    const chosen = new FormData(this.form);
    return this.questionnaire.check({
      ...Object.fromEntries(
        Questionnaire.NUMBERS.map((question) => [question, this.input(question).valueAsNumber]),
      ),
      ...Object.fromEntries(Questionnaire.ONE.map((question) => [question, chosen.get(question)])),
      ...Object.fromEntries(
        Questionnaire.SOME.map((question) => [question, chosen.getAll(question)]),
      ),
    });
  }

  private fill(answers: ClimberAnswers): void {
    for (const question of Questionnaire.NUMBERS) {
      this.input(question).value = String(answers[question]);
    }
    const choices = this.form.querySelectorAll<HTMLInputElement>("fieldset input");
    for (const input of choices) {
      const answer = answers[input.name as OneQuestion | SomeQuestion];
      input.checked =
        typeof answer === "string" ? answer === input.value : answer.includes(input.value);
    }
    (this.find("details") as HTMLDetailsElement).open = answers.conditions.length > 0;
  }

  /** The summary's rows: each question answered, and its answers. */
  private rows(answers: ClimberAnswers): HTMLElement[] {
    const { texts } = this;
    const rows: (readonly [string, readonly string[]])[] = [
      ["age", [String(answers.age)]],
      ["height", [texts.say("height-value", { height: answers.height })]],
      ["weight", [texts.say("weight-value", { weight: answers.weight })]],
      ...Questionnaire.ONE.map(
        (question) => [question, [texts.say(`${question}-${answers[question]}`)]] as const,
      ),
      ...Questionnaire.SOME.map(
        (question) =>
          [question, answers[question].map((id) => texts.say(`${question}-${id}`))] as const,
      ),
    ];
    return rows
      .filter(([, said]) => said.length > 0)
      .flatMap(([question, said]) => [
        this.written("dt", texts.say(question)),
        ...said.map((answer) => this.written("dd", answer)),
      ]);
  }

  /** A question's choices, each a radio button for one answer of them, or a box for some. */
  private offer(question: OneQuestion | SomeQuestion, type: "radio" | "checkbox"): void {
    const { document } = this.window;
    const fieldset = this.find(`[data-question="${question}"]`);
    for (const id of this.questionnaire.answers(question)) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      Object.assign(input, { type, name: question, value: id });
      label.append(input, this.written("span", this.texts.say(`${question}-${id}`)));
      fieldset.append(label);
    }
  }

  private input(question: NumberQuestion): HTMLInputElement {
    return this.find(`input[name="${question}"]`) as HTMLInputElement;
  }

  private written(tag: "dt" | "dd" | "li" | "span", text: string): HTMLElement {
    const element = this.window.document.createElement(tag);
    element.textContent = text;
    return element;
  }

  private find(selector: string): HTMLElement {
    return this.elements.find(`#climber ${selector}`.trim());
  }
}
