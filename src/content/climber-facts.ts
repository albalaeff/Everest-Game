import type { KnowledgeBase } from "./knowledge-base";
import type { ClimberAnswers, Questionnaire } from "./questionnaire";

/** What the player's answers make of their climber as they set off: their own mass in kg, their
 * fitness for the body (`BodyStart.fitness`) and their technique for the physics
 * (`ClimberLayout.technique`). */
export interface ClimberStart {
  readonly mass: number;
  readonly fitness: number;
  readonly technique: number;
}

/**
 * What a climber's answers mean on the mountain, by the knowledge base (#145): their VO2max at
 * sea level, as Jackson et al. estimate it from their sex, age, BMI and training
 * (`body.vo2max-estimate-*`), no lower than the VO2max of independence, where the estimate's
 * straight lines run on into nonsense; their fitness, that VO2max as a share of the typical
 * client's, whom the body's numbers are fitted to; and their technique, the share of the speed
 * their experience gives them on ladders and ropes.
 */
export class ClimberFacts {
  private static readonly CM_A_METRE = 100;

  private readonly estimate: {
    readonly base: number;
    readonly activity: number;
    readonly age: number;
    readonly bmi: number;
    readonly sex: number;
  };
  private readonly least: number;
  private readonly typical: number;

  constructor(
    private readonly knowledge: KnowledgeBase,
    private readonly questionnaire: Questionnaire,
  ) {
    const number = (name: string): number => knowledge.number(`body.vo2max-estimate-${name}`);
    this.estimate = {
      base: number("base"),
      activity: number("activity"),
      age: number("age"),
      bmi: number("bmi"),
      sex: number("sex"),
    };
    this.least = knowledge.number("body.independence-vo2max");
    this.typical = this.vo2max(questionnaire.typical);
  }

  /** Their BMI: their weight over the square of their height in metres. */
  static bmi(answers: ClimberAnswers): number {
    return answers.weight / (answers.height / ClimberFacts.CM_A_METRE) ** 2;
  }

  /** Their VO2max at sea level, in mL O₂/kg/min, as Jackson et al. estimate it, and no lower
   * than the VO2max of independence. */
  vo2max(answers: ClimberAnswers): number {
    const { estimate, questionnaire } = this;
    const estimated =
      estimate.base +
      estimate.activity * questionnaire.activity(answers.training) -
      estimate.age * answers.age -
      estimate.bmi * ClimberFacts.bmi(answers) +
      estimate.sex * questionnaire.sexShare(answers.sex);
    return Math.max(estimated, this.least);
  }

  /** Their climber as they set off: their weight, their VO2max as a share of the typical
   * client's, and the share of the speed their experience gives them on ladders and ropes. */
  climber(answers: ClimberAnswers): ClimberStart {
    const technique = this.questionnaire.technique(answers.experience);
    return {
      mass: answers.weight,
      fitness: this.vo2max(answers) / this.typical,
      technique: technique === null ? 1 : this.knowledge.number(technique),
    };
  }
}
