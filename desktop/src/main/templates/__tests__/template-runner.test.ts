import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { TemplateRunner } from '../template-runner.js';
import type { AnyTemplate } from '../types.js';
import type { Retriever } from '../../kb-search/retriever.js';
import type { BrowserActions } from '../../browser/browser-actions.js';

const buildTemplate = (overrides: Partial<AnyTemplate>): AnyTemplate => ({
  id: 't1',
  name: 'T1',
  description: '',
  category: 'analysis',
  estimatedDurationSec: 10,
  params: z.object({ x: z.string() }),
  kbRequired: false,
  prompt: vi.fn().mockReturnValue('PROMPT'),
  outputFormat: 'markdown',
  ...overrides,
});

describe('TemplateRunner', () => {
  it('validates params and throws on bad input', async () => {
    const runner = new TemplateRunner({ registry: { get: () => buildTemplate({}) } as any, retriever: {} as any, browser: {} as any, streamAgent: vi.fn() });
    await expect(runner.run({ templateId: 't1', params: { x: 123 } as any })).rejects.toThrow();
  });

  it('composes prompt without browser or KB', async () => {
    const tpl = buildTemplate({});
    const streamAgent = vi.fn().mockResolvedValue('result text');
    const runner = new TemplateRunner({
      registry: { get: () => tpl } as any,
      retriever: {} as any,
      browser: {} as any,
      streamAgent,
    });
    const result = await runner.run({ templateId: 't1', params: { x: 'hi' } });
    expect(result.output).toBe('result text');
    expect(streamAgent).toHaveBeenCalledWith('PROMPT');
  });

  it('runs browserActions if defined and passes output to prompt', async () => {
    const tpl = buildTemplate({
      browserActions: vi.fn().mockResolvedValue('browser-text'),
      prompt: vi.fn().mockReturnValue('p2'),
    });
    const browser = { click: vi.fn(), fill: vi.fn(), screenshot: vi.fn(), extract: vi.fn() } as unknown as BrowserActions;
    const runner = new TemplateRunner({
      registry: { get: () => tpl } as any,
      retriever: {} as any,
      browser,
      streamAgent: vi.fn().mockResolvedValue('ok'),
    });
    await runner.run({ templateId: 't1', params: { x: 'hi' } });
    expect(tpl.browserActions).toHaveBeenCalled();
    expect(tpl.prompt).toHaveBeenCalledWith({ x: 'hi' }, 'browser-text', undefined);
  });

  it('retrieves KB context when kbRequired and passes to prompt', async () => {
    const tpl = buildTemplate({ kbRequired: true });
    const retriever = { retrieve: vi.fn().mockResolvedValue([{ docId: 'd1', docName: 'x', position: 0, text: 'ctx', score: 0.9 }]) } as unknown as Retriever;
    const runner = new TemplateRunner({
      registry: { get: () => tpl } as any,
      retriever,
      browser: {} as any,
      streamAgent: vi.fn().mockResolvedValue('done'),
    });
    await runner.run({ templateId: 't1', params: { x: 'hi' } });
    expect(retriever.retrieve).toHaveBeenCalled();
    expect(tpl.prompt).toHaveBeenCalledWith({ x: 'hi' }, undefined, expect.stringContaining('ctx'));
  });
});
