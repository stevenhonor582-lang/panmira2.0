import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('password (bcryptjs)', () => {
  it('hashes are different for same input (随机 salt)', async () => {
    const a = await hashPassword('hello');
    const b = await hashPassword('hello');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$2[aby]\$/); // bcrypt 格式
  });

  it('verifies correct password', async () => {
    const hash = await hashPassword('my-secret-pwd');
    expect(await verifyPassword('my-secret-pwd', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('my-secret-pwd');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
