import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}
function expandUserPath(value: string): string {
  if (value.startsWith('~')) return path.join(os.homedir(), value.slice(1));
  return value;
}
function ensureIsolatedWorkspace(botName: string, configuredDir: string): string {
  const expanded = expandUserPath(configuredDir);
  const workspaceRoot = path.join(os.homedir(), 'workspace');
  const expectedDir = path.join(workspaceRoot, botName);
  const legacyPattern = new RegExp(`^${escapeRegex(path.join(os.homedir(), 'workspace-'))}([^/]+)$`);
  if (expanded === expectedDir) return expanded;
  if (expanded === workspaceRoot) {
    try { require('node:fs').mkdirSync(expectedDir, { recursive: true }); } catch {}
    return expectedDir;
  }
  const legacyMatch = expanded.match(legacyPattern);
  if (legacyMatch) {
    try { require('node:fs').mkdirSync(expectedDir, { recursive: true }); } catch {}
    return expectedDir;
  }
  if (expanded.startsWith(workspaceRoot + path.sep)) return expanded;
  return expanded;
}

describe('ensureIsolatedWorkspace (canonical layout)', () => {
  const HOME = os.homedir();
  const WS = path.join(HOME, 'workspace');
  it('keeps canonical ~/workspace/{botName}', () => {
    expect(ensureIsolatedWorkspace('海联测试', `${WS}/海联测试`)).toBe(`${WS}/海联测试`);
  });
  it('redirects generic ~/workspace to own subdirectory', () => {
    expect(ensureIsolatedWorkspace('sales-1', WS)).toBe(`${WS}/sales-1`);
  });
  it('redirects legacy ~/workspace-{botName} to canonical', () => {
    expect(ensureIsolatedWorkspace('海联测试', `${HOME}/workspace-海联测试`)).toBe(`${WS}/海联测试`);
  });
  it('redirects legacy ~/workspace-{otherBot} to own', () => {
    expect(ensureIsolatedWorkspace('bar', `${HOME}/workspace-foo`)).toBe(`${WS}/bar`);
  });
  it('keeps non-canonical subdirectory under ~/workspace/', () => {
    expect(ensureIsolatedWorkspace('sales-1', `${WS}/custom/path`)).toBe(`${WS}/custom/path`);
  });
  it('keeps fully custom path', () => {
    expect(ensureIsolatedWorkspace('sales-1', '/opt/some/other/path')).toBe('/opt/some/other/path');
  });
  it('expands ~ to home', () => {
    expect(ensureIsolatedWorkspace('海联测试', '~/workspace/海联测试')).toBe(`${WS}/海联测试`);
  });
  it('expands ~ in legacy form and redirects', () => {
    expect(ensureIsolatedWorkspace('海联测试', '~/workspace-海联测试')).toBe(`${WS}/海联测试`);
  });
  it('handles ASCII bot names', () => {
    expect(ensureIsolatedWorkspace('ops-engineer', `${WS}/ops-engineer`)).toBe(`${WS}/ops-engineer`);
  });
  it('handles bot names with hyphens', () => {
    expect(ensureIsolatedWorkspace('sales-bot-1', `${HOME}/workspace-sales-bot-1`)).toBe(`${WS}/sales-bot-1`);
  });
});
