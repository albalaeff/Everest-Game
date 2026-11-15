/** The lowest and the highest a number can be. */
export interface KnowledgeRange {
  readonly min: number;
  readonly max: number;
}

/** A number as a record keeps it: a value, or the range it lies in. */
interface Measured {
  readonly value?: number | undefined;
  readonly range?: KnowledgeRange | undefined;
}

/** What one source says of a fact. */
export interface KnowledgeVersion extends Measured {
  readonly note?: string | undefined;
  readonly source: { readonly title: string; readonly url: string };
  readonly checked: string;
}

/** A record of content/facts/ (docs/conventions/knowledge-base.md): a fact, with a version for
 * each source; a coefficient, with its own number; or a question, with none. */
export interface KnowledgeRecord extends Measured {
  readonly id: string;
  readonly kind: string;
  readonly status?: string | undefined;
  readonly versions?: readonly KnowledgeVersion[] | undefined;
  /** An accident's day, `YYYY-MM-DD`. */
  readonly date?: string | undefined;
}

/** One file of content/facts/, as the page imports it. */
export interface KnowledgeFile {
  readonly facts: readonly KnowledgeRecord[];
}

/**
 * The knowledge base as the page reads it, to hand the rules their numbers (conventions.md → Data,
 * not literals): the records of every file, by id.
 */
export class KnowledgeBase {
  private readonly records: ReadonlyMap<string, KnowledgeRecord>;

  constructor(files: readonly KnowledgeFile[]) {
    const records = files.flatMap((file) => file.facts);
    this.records = new Map(records.map((record) => [record.id, record] as const));
  }

  /** A record's number: a coefficient's value, or the middle of its range; a fact's, or the
   * middle of the range across its sources where they disagree (knowledge-base.md → A fact). */
  number(id: string): number {
    const { min, max } = this.range(id);
    return (min + max) / 2;
  }

  /** The range a record's number lies in: from the lowest of its sources' numbers to the highest,
   * a coefficient's own range, or a single value at both ends. */
  range(id: string): KnowledgeRange {
    const record = this.records.get(id);
    if (record === undefined) {
      throw new RangeError(`The knowledge base has no record ${id}`);
    }
    const spans = (record.versions ?? [record])
      .map((measured) => KnowledgeBase.span(measured))
      .filter((span) => span !== null);
    if (spans.length === 0) {
      throw new RangeError(`The record ${id} has no number`);
    }
    return {
      min: Math.min(...spans.map(([min]) => min)),
      max: Math.max(...spans.map(([, max]) => max)),
    };
  }

  /** The year of a dated record, an accident's (#212). */
  year(id: string): number {
    const record = this.records.get(id);
    const year = Number(record?.date?.slice(0, 4));
    if (record === undefined || !Number.isInteger(year)) {
      throw new RangeError(`The knowledge base has no dated record ${id}`);
    }
    return year;
  }

  private static span(measured: Measured): readonly [min: number, max: number] | null {
    if (measured.value !== undefined) {
      return [measured.value, measured.value];
    }
    if (measured.range !== undefined) {
      return [measured.range.min, measured.range.max];
    }
    return null;
  }
}
