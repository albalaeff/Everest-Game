/** A record of content/facts/, as far as its review goes: a question has no status, and is open. */
export interface ReviewedRecord {
  readonly status?: string;
}

/** One file of content/facts/. */
export interface FactsFile {
  readonly facts: readonly ReviewedRecord[];
}

/**
 * Whether an expert has reviewed the whole knowledge base: until then the game says it's a beta
 * (spec.md → Realism and accuracy principles), and the mark comes off by itself, never early.
 */
export class ExpertReview {
  private static readonly REVIEWED = "expert-reviewed";

  constructor(private readonly files: readonly FactsFile[]) {}

  done(): boolean {
    return this.files.every((file) =>
      file.facts.every((record) => record.status === ExpertReview.REVIEWED),
    );
  }
}
