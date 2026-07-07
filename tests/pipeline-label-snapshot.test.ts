import { describe, it, expect } from 'vitest';
import { pipelineRuns } from '../src/db/schema.js';

describe('pipelineRuns.labelSnapshot', () => {
  it('exports labelSnapshot column with correct shape', () => {
    const col = (pipelineRuns as unknown as { labelSnapshot: unknown }).labelSnapshot;
    expect(col).toBeDefined();
    const c = col as { columnType: string; name: string; notNull: boolean };
    expect(c.columnType).toBe('PgJsonb');
    expect(c.name).toBe('label_snapshot');
    // Nullable for backward compat with pre-L11 runs.
    expect(c.notNull).toBe(false);
  });
});
