import { describe, it, expect } from 'vitest';
import { generateOpaqueToken, hashToken } from '../tokens.ts';

describe('tokens (utils)', () => {
  it('generates 43-char base64url tokens', () => {
    const t = generateOpaqueToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashToken is deterministic and 64-char hex', () => {
    const h1 = hashToken('hello');
    const h2 = hashToken('hello');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[a-f0-9]+$/);
  });

  it('different tokens produce different hashes', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('UUID v7 monotonic', async () => {
    const { uuidv7 } = await import('../ids.ts');
    const a = uuidv7();
    await new Promise(r => setTimeout(r, 5));
    const b = uuidv7();
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('deviceUserCode is 8-char uppercase alphanumeric', async () => {
    const { deviceUserCode } = await import('../ids.ts');
    const code = deviceUserCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/); // 排除 0/O/1/I
  });
});
