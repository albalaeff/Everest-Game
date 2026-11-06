import questionnaire from "../../content/questionnaire.json";
import type { KnowledgeRange } from "./knowledge-base";

/** The player's answers on the Your climber screen (#145), as the device keeps them: their age,
 * height in cm and weight in kg, and by their ids in content/questionnaire.json their sex, their
 * training, their mountain experience, and the altitude illnesses and the conditions they've had. */
export interface ClimberAnswers {
  readonly age: number;
  readonly sex: string;
  readonly height: number;
  readonly weight: number;
  readonly training: string;
  readonly experience: string;
  readonly illness: readonly string[];
  readonly conditions: readonly string[];
}

/** The questions with a number for an answer, each within its limits. */
export type NumberQuestion = "age" | "height" | "weight";

/** The questions with one answer of their choices. */
export type OneQuestion = "sex" | "training" | "experience";

/** The questions with as many of their choices as apply, or none. */
export type SomeQuestion = "illness" | "conditions";

/** content/questionnaire.json, as the game reads it. */
export interface QuestionnaireData {
  readonly typical: ClimberAnswers;
  readonly limits: Readonly<Record<NumberQuestion, KnowledgeRange>>;
  readonly sex: readonly { readonly id: string; readonly share: number }[];
  readonly training: readonly { readonly id: string; readonly activity: number }[];
  readonly experience: readonly {
    readonly id: string;
    readonly technique?: string;
    readonly peak?: number;
  }[];
  readonly illness: readonly string[];
  readonly conditions: readonly string[];
  /** The shares of the typical client's VO2max where the guide's words change. */
  readonly guide: {
    readonly fitter: number;
    readonly "less-fit": number;
    readonly "much-less-fit": number;
  };
}

/**
 * The Your climber screen's questions (#145), from content/questionnaire.json: the numbers asked
 * for and their limits, the choices of each other question by id, with what each puts into the
 * estimate (a sex's share of its term, a training's point on its activity scale, an experience's
 * record of its technique and the highest peak it has summited), and the typical client's answers,
 * which a first climb starts from.
 */
export class Questionnaire {
  /** The questions answered with a number. */
  static readonly NUMBERS: readonly NumberQuestion[] = ["age", "height", "weight"];
  /** The questions answered by choosing, in the screen's order. */
  static readonly ONE: readonly OneQuestion[] = ["sex", "training", "experience"];
  static readonly SOME: readonly SomeQuestion[] = ["illness", "conditions"];

  readonly typical: ClimberAnswers;

  constructor(readonly data: QuestionnaireData = questionnaire) {
    const typical = this.check(data.typical);
    if (typical === null) {
      throw new RangeError("The typical client's answers aren't the questionnaire's");
    }
    this.typical = typical;
  }

  /** `answers` if they answer every question within its limits, by the questionnaire's ids, or
   * null: answers a device kept from an older build, say. */
  check(answers: unknown): ClimberAnswers | null {
    if (typeof answers !== "object" || answers === null) {
      return null;
    }
    const given = answers as Readonly<Record<string, unknown>>;
    const numbers = Questionnaire.NUMBERS.every((question) => {
      const { min, max } = this.data.limits[question];
      const value = given[question];
      return typeof value === "number" && value >= min && value <= max;
    });
    const choices =
      Questionnaire.ONE.every((question) => this.answers(question).includes(given[question] as string)) &&
      Questionnaire.SOME.every((question) => Questionnaire.some(given[question], this.answers(question)));
    if (!numbers || !choices) {
      return null;
    }
    const { age, sex, height, weight, training, experience, illness, conditions } =
      given as unknown as ClimberAnswers;
    return {
      age,
      sex,
      height,
      weight,
      training,
      experience,
      illness: [...illness],
      conditions: [...conditions],
    };
  }

  /** The ids of a question's choices, in the order the screen offers them. */
  answers(question: OneQuestion | SomeQuestion): readonly string[] {
    if (question === "illness" || question === "conditions") {
      return this.data[question];
    }
    const choices: readonly { readonly id: string }[] = this.data[question];
    return choices.map(({ id }) => id);
  }

  /** The share of the estimate's sex term `sex` takes: a man's whole, a woman's none, and halfway
   * for one who'd rather not say. */
  sexShare(sex: string): number {
    return Questionnaire.choice(sex, this.data.sex).share;
  }

  /** The point of the estimate's activity scale a training is. */
  activity(training: string): number {
    return Questionnaire.choice(training, this.data.training).activity;
  }

  /** The record of the share of the speed on ladders and ropes an experience gives, or null for
   * the typical client's own. */
  technique(experience: string): string | null {
    return Questionnaire.choice(experience, this.data.experience).technique ?? null;
  }

  /** The height in metres of the highest peak a climber with this experience has summited, or
   * null for none. */
  peak(experience: string): number | null {
    return Questionnaire.choice(experience, this.data.experience).peak ?? null;
  }

  private static choice<Choice extends { readonly id: string }>(
    id: string,
    choices: readonly Choice[],
  ): Choice {
    const found = choices.find((choice) => choice.id === id);
    if (found === undefined) {
      throw new RangeError(`${id} isn't one of the questionnaire's answers`);
    }
    return found;
  }

  private static some(answer: unknown, choices: readonly string[]): boolean {
    return (
      Array.isArray(answer) &&
      new Set(answer).size === answer.length &&
      answer.every((id) => choices.includes(id as string))
    );
  }
}
