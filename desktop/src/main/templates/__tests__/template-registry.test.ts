import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TemplateRegistry } from '../template-registry.js';
import type { AnyTemplate } from '../types.js';

const makeTemplate = (id: string): AnyTemplate => ({
  id,
  name: id,
  description: 'test',
  category: 'analysis',
  estimatedDurationSec: 30,
  params: z.object({}),
  kbRequired: false,
  prompt: () => '',
  outputFormat: 'markdown',
});

describe('TemplateRegistry', () => {
  it('registers and lists templates', () => {
    const reg = new TemplateRegistry();
    reg.register([makeTemplate('a'), makeTemplate('b')]);
    expect(reg.list().map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('get returns a specific template', () => {
    const reg = new TemplateRegistry();
    reg.register([makeTemplate('a'), makeTemplate('b')]);
    expect(reg.get('a')?.id).toBe('a');
    expect(reg.get('missing')).toBeUndefined();
  });
});
