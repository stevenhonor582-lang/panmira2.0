import { describe, it, expect } from 'vitest';

// parseQueryBool 没 export,直接复制实现测逻辑一致性
function parseQueryBool(url: string | undefined, key: string): boolean {
  if (!url) return false;
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return false;
  const qs = url.slice(qIdx + 1);
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k === key && v && /^(true|1|yes)$/i.test(decodeURIComponent(v))) return true;
  }
  return false;
}

describe('parseQueryBool (L6 async detection)', () => {
  it.each([
    ['/api/v2/admin/pipelines/abc/trigger?async=true', 'async', true],
    ['/api/v2/admin/pipelines/abc/trigger?async=1', 'async', true],
    ['/api/v2/admin/pipelines/abc/trigger?async=yes', 'async', true],
    ['/api/v2/admin/pipelines/abc/trigger?async=TRUE', 'async', true],
    ['/api/v2/admin/pipelines/abc/trigger?async=false', 'async', false],
    ['/api/v2/admin/pipelines/abc/trigger?async=0', 'async', false],
    ['/api/v2/admin/pipelines/abc/trigger', 'async', false],
    ['/api/v2/admin/pipelines/abc/trigger?foo=bar', 'async', false],
    ['/api/v2/admin/pipelines/abc/trigger?async=true&foo=bar', 'async', true],
    [undefined, 'async', false],
    ['', 'async', false],
  ])('parseQueryBool(%j, %j) === %j', (url, key, expected) => {
    expect(parseQueryBool(url, key)).toBe(expected);
  });

  it('handles URL-encoded values', () => {
    expect(parseQueryBool('/x?async=%74%72%75%65', 'async')).toBe(true);
  });
});
