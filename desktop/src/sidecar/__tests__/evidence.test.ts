import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceCollector } from '../evidence';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'panmira-evidence-'));
});

describe('EvidenceCollector', () => {
  it('saves screenshot with metadata', async () => {
    const collector = new EvidenceCollector({ outputDir: tempDir });
    const buf = Buffer.from('fake-png');
    const path = await collector.saveScreenshot(buf, {
      action: 'browser_login',
      target: 'alibaba',
      verdict: 'PASS'
    });

    expect(existsSync(path)).toBe(true);
    const meta = JSON.parse(readFileSync(path + '.json', 'utf-8'));
    expect(meta.action).toBe('browser_login');
    expect(meta.target).toBe('alibaba');
  });
});
