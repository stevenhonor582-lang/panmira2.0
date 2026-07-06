import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../../db/crypto.ts';

describe('crypto (AES-256-GCM)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('round-trips plaintext', () => {
    const plain = 'sk-cp-智谱-API-key-12345';
    const cipher = encrypt(plain);
    expect(cipher).not.toContain(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  it('produces different ciphertexts for same plaintext (随机 IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
  });

  it('throws when ENCRYPTION_KEY missing', () => {
    const old = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = old;
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encrypt('hello');
    const tampered = cipher.slice(0, -2) + 'AA';
    expect(() => decrypt(tampered)).toThrow();
  });
});
