import { describe, expect, it } from 'vitest';

import { Build } from './build';

describe('Build', () => {
  it('names its commit in short', () => {
    expect(new Build('1a2b3c4d5e6f').label()).toBe('build 1a2b3c4');
  });

  it('says local when no commit was given', () => {
    expect(new Build(undefined).label()).toBe('build local');
  });
});
