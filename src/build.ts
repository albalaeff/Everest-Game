/** Which build this is: whoever opens the preview can tell which merge they're looking at. */
export class Build {
  private static readonly SHORT_COMMIT = 7;

  private readonly commit: string | undefined;

  constructor(commit: string | undefined) {
    this.commit = commit;
  }

  label(): string {
    return `build ${this.commit?.slice(0, Build.SHORT_COMMIT) ?? "local"}`;
  }
}
