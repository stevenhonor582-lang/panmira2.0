import { describe, it, expect } from 'vitest';
import { SchemaValidator } from '../schema-validator.js';
import type { FieldSchema } from '../types.js';

const schema: Record<string, FieldSchema[]> = {
  'write-proposal': [
    { name: 'topic', type: 'enum', question: '主题？', options: ['A', 'B'], required: true },
    { name: 'audience', type: 'enum', question: '读者？', options: ['X', 'Y'], required: true },
  ],
  'no-fields': [],
};

describe('SchemaValidator', () => {
  const v = new SchemaValidator(schema);

  it('returns all required fields when payload empty', () => {
    const gaps = v.check('write-proposal', {});
    expect(gaps).toHaveLength(2);
    expect(gaps.map(g => g.name)).toEqual(['topic', 'audience']);
  });

  it('returns only missing fields', () => {
    const gaps = v.check('write-proposal', { topic: 'A' });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].name).toBe('audience');
  });

  it('returns empty when all required filled', () => {
    const gaps = v.check('write-proposal', { topic: 'A', audience: 'X' });
    expect(gaps).toHaveLength(0);
  });

  it('handles empty schema', () => {
    const gaps = v.check('no-fields', {});
    expect(gaps).toHaveLength(0);
  });

  it('treats null/undefined as missing', () => {
    const gaps = v.check('write-proposal', { topic: null, audience: undefined });
    expect(gaps).toHaveLength(2);
  });

  it('treats empty string as missing', () => {
    const gaps = v.check('write-proposal', { topic: '', audience: 'X' });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].name).toBe('topic');
  });

  it('throws SCHEMA_NOT_FOUND for unknown skill', () => {
    expect(() => v.check('unknown-skill', {})).toThrow('SCHEMA_NOT_FOUND');
  });
});
