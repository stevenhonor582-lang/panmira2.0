import { describe, it, expect } from 'vitest';
import type { PipelineStage, PipelineContext } from '../../src/orchestrator/pipeline-stage.js';

class StubStage implements PipelineStage<string, string> {
  async execute(input: string, _ctx: PipelineContext): Promise<string> {
    return input.toUpperCase();
  }
}

describe('PipelineStage', () => {
  it('execute returns transformed output', async () => {
    const stage = new StubStage();
    const ctx: PipelineContext = { chatId: 't', botName: '得一', sceneType: 'data' };
    expect(await stage.execute('hello', ctx)).toBe('HELLO');
  });

  it('PipelineContext carries sceneType + botName + chatId', () => {
    const ctx: PipelineContext = { chatId: 'c1', botName: '得一', sceneType: 'content' };
    expect(ctx.sceneType).toBe('content');
    expect(ctx.botName).toBe('得一');
    expect(ctx.chatId).toBe('c1');
  });

  it('PipelineStage interface accepts generic Input/Output', async () => {
    const numberStage: PipelineStage<number, string> = {
      execute: async (n, _ctx) => `n=${n}`,
    };
    const ctx: PipelineContext = { chatId: 'c', botName: '得一', sceneType: 'data' };
    expect(await numberStage.execute(42, ctx)).toBe('n=42');
  });
});
