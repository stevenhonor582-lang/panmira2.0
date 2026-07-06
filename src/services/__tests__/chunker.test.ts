import { describe, it, expect } from 'vitest';
import { chunkText, makeChunkId } from '../chunker.ts';

describe('chunker', () => {
  it('empty text returns no chunks', () => {
    expect(chunkText('', { chunkSize: 512, chunkOverlap: 64 })).toEqual([]);
  });

  it('single short paragraph → 1 chunk', () => {
    const chunks = chunkText('Hello world.', { chunkSize: 512, chunkOverlap: 64 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toBe('Hello world.');
    expect(chunks[0]!.index).toBe(0);
  });

  it('4 paragraphs with chunkSize 50 → multiple chunks', () => {
    const text = 'Para 1 lorem ipsum dolor sit amet.\n\nPara 2 consectetur adipiscing elit.\n\nPara 3 sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nPara 4 ut enim ad minim veniam.';
    const chunks = chunkText(text, { chunkSize: 50, chunkOverlap: 10 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('extracts heading from first line', () => {
    const text = '# Introduction\n\nThis is the body content for the intro section that goes on for a while to make a chunk.';
    const chunks = chunkText(text, { chunkSize: 30, chunkOverlap: 5 });
    expect(chunks[0]!.heading).toBe('# Introduction');
  });

  it('tokenCount 粗略估算 (chars / 4)', () => {
    const chunks = chunkText('Hello world, this is a test of token counting.', { chunkSize: 512, chunkOverlap: 64 });
    expect(chunks[0]!.tokenCount).toBe(Math.ceil(chunks[0]!.content.length / 4));
  });

  it('makeChunkId format', () => {
    expect(makeChunkId('doc-1', 0)).toBe('doc-1::chunk::0');
    expect(makeChunkId('doc-abc', 7)).toBe('doc-abc::chunk::7');
  });
});
