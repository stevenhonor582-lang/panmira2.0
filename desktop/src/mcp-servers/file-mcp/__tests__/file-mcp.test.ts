import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleFileRead, handleFileWrite } from '../tools';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'panmira-file-mcp-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe('file-mcp', () => {
  it('reads existing file', async () => {
    const path = join(tempDir, 'test.txt');
    writeFileSync(path, 'hello');
    const result = await handleFileRead({ path });
    expect(result.content).toBe('hello');
  });

  it('writes file', async () => {
    const path = join(tempDir, 'out.txt');
    const result = await handleFileWrite({ path, content: 'world' });
    expect(result.bytes).toBe(5);
  });

  it('rejects path outside allowed dir', async () => {
    await expect(handleFileRead({ path: '/etc/passwd' })).rejects.toThrow(/denied/);
  });
});
