import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery, getTables } = vi.hoisted(() => {
  const tables = new Map<string, any[]>();
  function getTable(name: string) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }
  function parseRow(sql: string, params?: any[]) {
    const colsMatch = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES/i);
    const cols = colsMatch?.[1]?.split(',').map((c) => c.trim()) || [];
    const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    const vals = valsMatch?.[1]?.split(',').map((v) => v.trim()) || [];
    const row: any = {};
    cols.forEach((c, i) => {
      const v = vals[i];
      if (v?.startsWith('$')) {
        const idx = parseInt(v.substring(1)) - 1;
        if (params?.[idx] !== undefined) row[c] = params[idx];
      } else row[c] = v?.toUpperCase() === 'NULL' ? null : isNaN(Number(v)) ? v : Number(v);
    });
    return row;
  }
  const mockQuery = vi.fn();
  const mq = async (sql: string, params?: any[]) => {
    const s = sql.trim();
    const tm = s.match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)|DELETE\s+FROM\s+(\w+)/i);
    const table = (tm?.[1] || tm?.[2] || tm?.[3] || tm?.[4] || '').toLowerCase();
    if (/^SELECT/i.test(s)) {
      if (/COUNT\s*\(/i.test(s)) return { rows: [{ count: getTable(table).length }] };
      let rows = [...getTable(table)];
      if (params?.length) {
        const w = s.match(/WHERE\s+(\w+)\s*=\s*\$(\d+)/i);
        if (w) rows = rows.filter((r) => r[w[1]] === params[parseInt(w[2]) - 1]);
      }
      return { rows };
    }
    if (/^INSERT.*ON CONFLICT/is.test(s)) {
      const tbl = getTable(table);
      const cc = s.match(/ON CONFLICT\s*\((\w+)\)/i)?.[1] || '';
      const row = parseRow(s, params);
      const idx = tbl.findIndex((r) => r[cc] === row[cc]);
      if (idx >= 0) tbl[idx] = { ...tbl[idx], ...row };
      else tbl.push(row);
      return { rows: [] };
    }
    if (/^INSERT/i.test(s)) {
      getTable(table).push(parseRow(s, params));
      return { rows: [] };
    }
    if (/^UPDATE/i.test(s)) {
      const tbl = getTable(table);
      const sets = [...s.matchAll(/(\w+)\s*=\s*\$(\d+)/gi)];
      const wm = s.match(/WHERE\s+(\w+)\s*=\s*\$(\d+)/i);
      if (wm) {
        const row = tbl.find((r) => r[wm[1]] === params?.[parseInt(wm[2]) - 1]);
        if (row)
          sets.forEach((m) => {
            if (m[1] !== wm[1]) {
              const pi = parseInt(m[2]) - 1;
              if (params?.[pi] !== undefined) row[m[1]] = params[pi];
            }
          });
      }
      return { rows: [] };
    }
    if (/^DELETE/i.test(s)) {
      let deleted = 0;
      if (params?.length) {
        const w = s.match(/WHERE\s+(\w+)\s*=\s*\$(\d+)/i);
        if (w) {
          const tbl = getTable(table);
          const i = tbl.findIndex((r) => r[w[1]] === params[parseInt(w[2]) - 1]);
          if (i >= 0) {
            tbl.splice(i, 1);
            deleted = 1;
          }
        }
      } else {
        deleted = getTable(table).length;
        tables.set(table, []);
      }
      return { rows: [], rowCount: deleted };
    }
    return { rows: [] };
  };
  mockQuery.mockImplementation(mq);
  return { mockQuery, getTables: () => tables };
});

vi.mock('../src/db/index.js', () => ({
  pool: { query: mockQuery, on: vi.fn() },
  db: {},
  query: mockQuery,
}));

import { SkillHubStore } from '../src/api/skill-hub-store.js';

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => createLogger() } as any;
}

const SAMPLE_SKILL = `---
name: test-skill
description: "A test skill for unit testing"
tags: test, demo
user-invocable: true
context: fork
allowed-tools: Read, Bash
---

# Test Skill

This is a test skill.
`;

describe('SkillHubStore', () => {
  let store: SkillHubStore;

  beforeEach(() => {
    getTables().clear();
    mockQuery.mockClear();
    store = new SkillHubStore('/tmp/test', createLogger());
  });

  it('publishes and retrieves a skill', async () => {
    const record = await store.publish({ name: 'test-skill', skillMd: SAMPLE_SKILL, author: 'test-bot' });
    expect(record.name).toBe('test-skill');
    expect(record.description).toBe('A test skill for unit testing');
    expect(record.version).toBe(1);
    expect(record.author).toBe('test-bot');
    expect(record.tags).toEqual(['test', 'demo']);

    const retrieved = await store.get('test-skill');
    expect(retrieved).toBeDefined();
    expect(retrieved!.skillMd).toBe(SAMPLE_SKILL);
  });

  it('bumps version on re-publish', async () => {
    await store.publish({ name: 'test-skill', skillMd: SAMPLE_SKILL, author: 'bot-a' });
    const v2 = await store.publish({ name: 'test-skill', skillMd: SAMPLE_SKILL, author: 'bot-b' });
    expect(v2.version).toBe(2);
    expect(v2.author).toBe('bot-b');
  });

  it('lists all skills', async () => {
    await store.publish({ name: 'skill-a', skillMd: '---\nname: skill-a\n---\nA', author: 'bot' });
    await store.publish({ name: 'skill-b', skillMd: '---\nname: skill-b\n---\nB', author: 'bot' });
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(['skill-a', 'skill-b']);
  });

  it('searches skills by keyword', async () => {
    await store.publish({
      name: 'calendar-tool',
      skillMd: '---\nname: calendar-tool\ndescription: Manage calendars\n---\n# Calendar',
      author: 'bot',
    });
    await store.publish({
      name: 'data-viz',
      skillMd: '---\nname: data-viz\ndescription: Data visualization\n---\n# Charts',
      author: 'bot',
    });
    const results = await store.search('calendar');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('calendar-tool');
  });

  it('removes a skill', async () => {
    await store.publish({ name: 'to-remove', skillMd: '---\nname: to-remove\n---\nX', author: 'bot' });
    expect(await store.get('to-remove')).toBeDefined();
    const removed = await store.remove('to-remove');
    expect(removed).toBe(true);
    expect(await store.get('to-remove')).toBeUndefined();
  });

  it('returns false when removing non-existent skill', async () => {
    expect(await store.remove('nonexistent')).toBe(false);
  });

  it('handles skill without frontmatter', async () => {
    const record = await store.publish({
      name: 'bare-skill',
      skillMd: '# Just markdown\nNo frontmatter here.',
      author: 'test',
    });
    expect(record.name).toBe('bare-skill');
    expect(record.description).toBe('');
    expect(record.tags).toEqual([]);
  });

  it('getContent returns skillMd and referencesTar', async () => {
    const tar = Buffer.from('fake-tar-data');
    await store.publish({
      name: 'with-refs',
      skillMd: '---\nname: with-refs\n---\n# Refs',
      referencesTar: tar,
      author: 'bot',
    });
    const content = await store.getContent('with-refs');
    expect(content).toBeDefined();
    expect(content!.skillMd).toContain('with-refs');
    expect(content!.referencesTar).toEqual(tar);
  });
});
