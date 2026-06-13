import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunker.js';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('', 100, 10)).toEqual([]);
  });

  it('returns single chunk if text fits in one window', () => {
    const text = 'hello world';
    expect(chunkText(text, 100, 10)).toEqual([{ position: 0, text: 'hello world' }]);
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'a'.repeat(250);
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
    // overlap: chunk 1 starts at 80, chunk 0 ends at 100
    expect(chunks[0].text.length).toBe(100);
    expect(chunks[1].text.length).toBe(100);
  });

  it('preserves paragraph boundaries when possible', () => {
    const text = 'first paragraph here.\n\nsecond paragraph here.';
    const chunks = chunkText(text, 100, 10);
    expect(chunks[0].text).toBe('first paragraph here.');
    expect(chunks[1].text).toBe('second paragraph here.');
  });

  it('handles unicode (Chinese) correctly', () => {
    const text = '中文测试'.repeat(50); // 200 chars
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text).toMatch(/[一-龥]/);
    }
  });
});
