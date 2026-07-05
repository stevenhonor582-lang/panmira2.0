import { describe, it, expect } from 'vitest';
import { HooksGate } from '../../src/orchestrator/hooks-gate.js';

describe('HooksGate', () => {
  it('passes quality output (length > 10)', async () => {
    const gate = new HooksGate({
      hooks: [{ name: 'minLength', validate: (o: string) => o.length > 10 || 'too short' }],
    });
    await expect(gate.runAfterStage('produce', 'this is long enough', {} as any)).resolves.not.toThrow();
  });

  it('rejects short output with hook failure message', async () => {
    const gate = new HooksGate({
      hooks: [{ name: 'minLength', validate: (o: string) => o.length > 10 || 'too short' }],
    });
    await expect(gate.runAfterStage('produce', 'short', {} as any)).rejects.toThrow('[produce] hook "minLength" failed: too short');
  });

  it('runs all hooks sequentially (multiple gates)', async () => {
    const gate = new HooksGate({
      hooks: [
        { name: 'minLength', validate: (o: string) => o.length > 5 || 'too short' },
        { name: 'hasSummary', validate: (o: string) => o.includes('summary') || 'missing summary' },
      ],
    });
    await expect(gate.runAfterStage('collect', 'summary: collected', {} as any)).resolves.not.toThrow();
    await expect(gate.runAfterStage('collect', 'no markers anywhere', {} as any)).rejects.toThrow('missing summary');
  });

  it('empty hooks array always passes', async () => {
    const gate = new HooksGate({ hooks: [] });
    await expect(gate.runAfterStage('review', '', {} as any)).resolves.not.toThrow();
  });
});
