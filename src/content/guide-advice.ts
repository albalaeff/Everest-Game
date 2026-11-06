import { ClimberFacts } from "./climber-facts";
import type { ClimberStart } from "./climber-facts";
import type { KnowledgeBase } from "./knowledge-base";
import type { ClimberAnswers, Questionnaire } from "./questionnaire";

/** A line the guide says: its name in content/climber.json, and the numbers it's filled with. */
export interface GuideLine {
  readonly name: string;
  readonly fills: Readonly<Record<string, number>>;
}

/**
 * What the guide says of a climber's answers on Your climber (#145), in plain words, with no
 * number of the model (docs/guidelines/interface.md → The HUD): how fit they are against the
 * typical client, by the questionnaire's bands; what their age means on Everest
 * (body.summits-by-age, body.older-climbers), and a BMI of class 3 obesity (body.severe-obesity);
 * what their experience means on the ladders and ropes, and Nepal's 7,000 m peak to one who hasn't
 * summited one (rules.7000-m-peak); and what the altitude illness they've had and their conditions
 * mean up high (medicine.illness-history, medicine.conditions-and-risk, medicine.see-a-doctor).
 * The illnesses and the conditions change nothing in the body until #37 models them.
 */
export class GuideAdvice {
  /** The lines it may say of any climber, besides one for each illness and condition. */
  private static readonly LINES = [
    "guide-fitter",
    "guide-as-fit",
    "guide-less-fit",
    "guide-much-less-fit",
    "guide-summits-by-age",
    "guide-older",
    "guide-severe-obesity",
    "guide-novice",
    "guide-veteran",
    "guide-peak",
  ];

  private readonly climbers: ClimberFacts;
  private readonly fewerSummits: number;
  private readonly older: number;
  private readonly severeObesity: number;
  private readonly peak: number;

  constructor(
    knowledge: KnowledgeBase,
    private readonly questionnaire: Questionnaire,
  ) {
    this.climbers = new ClimberFacts(knowledge, questionnaire);
    this.fewerSummits = knowledge.number("body.summits-by-age");
    this.older = knowledge.number("body.older-climbers");
    this.severeObesity = knowledge.number("body.severe-obesity");
    this.peak = knowledge.number("rules.7000-m-peak");
  }

  /** Every line it may say, by name. */
  get names(): readonly string[] {
    const { illness, conditions } = this.questionnaire.data;
    return [...GuideAdvice.LINES, ...[...illness, ...conditions].map((id) => `guide-${id}`)];
  }

  /** What it says of `answers`, in order: their fitness, their age, their weight, their
   * experience, and each illness and condition they've had. */
  lines(answers: ClimberAnswers): readonly GuideLine[] {
    const climber = this.climbers.climber(answers);
    return [
      this.fitness(climber),
      ...this.age(answers),
      ...this.weight(answers),
      ...this.experience(answers, climber),
      ...this.health(answers),
    ];
  }

  private fitness({ fitness }: ClimberStart): GuideLine {
    const bands = this.questionnaire.data.guide;
    if (fitness >= bands.fitter) {
      return GuideAdvice.line("guide-fitter");
    }
    if (fitness < bands["much-less-fit"]) {
      return GuideAdvice.line("guide-much-less-fit");
    }
    return GuideAdvice.line(fitness < bands["less-fit"] ? "guide-less-fit" : "guide-as-fit");
  }

  private age({ age }: ClimberAnswers): readonly GuideLine[] {
    if (age > this.older) {
      return [GuideAdvice.line("guide-older", { age: this.older })];
    }
    if (age > this.fewerSummits) {
      return [GuideAdvice.line("guide-summits-by-age", { age: this.fewerSummits })];
    }
    return [];
  }

  private weight(answers: ClimberAnswers): readonly GuideLine[] {
    return ClimberFacts.bmi(answers) >= this.severeObesity
      ? [GuideAdvice.line("guide-severe-obesity")]
      : [];
  }

  private experience(
    { experience }: ClimberAnswers,
    { technique }: ClimberStart,
  ): readonly GuideLine[] {
    const summited = this.questionnaire.peak(experience) ?? 0;
    return [
      ...(technique < 1 ? [GuideAdvice.line("guide-novice")] : []),
      ...(technique > 1 ? [GuideAdvice.line("guide-veteran")] : []),
      ...(summited < this.peak ? [GuideAdvice.line("guide-peak", { peak: this.peak })] : []),
    ];
  }

  private health({ illness, conditions }: ClimberAnswers): readonly GuideLine[] {
    const { data } = this.questionnaire;
    return [
      ...data.illness.filter((id) => illness.includes(id)),
      ...data.conditions.filter((id) => conditions.includes(id)),
    ].map((id) => GuideAdvice.line(`guide-${id}`));
  }

  private static line(name: string, fills: Readonly<Record<string, number>> = {}): GuideLine {
    return { name, fills };
  }
}
