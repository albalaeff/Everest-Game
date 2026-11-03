/** Which build this is: whoever opens the preview can tell which merge they're looking at, and
 * a room checks that every player runs the one it does (#28). */
export class Build {
  /** The version of a build on a developer's machine, where no commit is told. */
  static readonly LOCAL = "local";
  private static readonly SHORT_COMMIT = 7;

  /** The build's version, whole: the commit it was built from, or `local`. */
  readonly version: string;

  constructor(commit: string | undefined) {
    this.version = commit ?? Build.LOCAL;
  }

  label(): string {
    return `build ${this.version.slice(0, Build.SHORT_COMMIT)}`;
  }
}
