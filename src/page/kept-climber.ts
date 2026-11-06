import type { ClimberAnswers, Questionnaire } from "../content/questionnaire";

/**
 * The player's answers on Your climber (#145), kept on the device for the next new climb, which
 * opens on them, until the saves keep them with the settings (#60). Answers an older build kept,
 * which the questions no longer take, are as none, and a browser that keeps nothing asks afresh
 * each visit.
 */
export class KeptClimber {
  static readonly KEY = "everest.climber";

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem"> | null,
    private readonly questionnaire: Questionnaire,
  ) {}

  /** The answers kept on the device, or null for none. */
  get answers(): ClimberAnswers | null {
    try {
      const kept = this.storage?.getItem(KeptClimber.KEY) ?? null;
      return kept === null ? null : this.questionnaire.check(JSON.parse(kept));
    } catch {
      return null;
    }
  }

  keep(answers: ClimberAnswers): void {
    try {
      this.storage?.setItem(KeptClimber.KEY, JSON.stringify(answers));
    } catch {
      // A browser that keeps nothing: the answers hold for this climb.
    }
  }
}
