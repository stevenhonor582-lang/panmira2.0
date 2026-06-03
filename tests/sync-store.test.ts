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

import { SyncStore } from '../src/sync/sync-store.js';

function createLogger() {
  return { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, child: () => createLogger() } as any;
}

describe('SyncStore', () => {
  let store: SyncStore;

  beforeEach(() => {
    getTables().clear();
    mockQuery.mockClear();
    store = new SyncStore('/tmp/test', createLogger());
  });

  // --- Config ---

  it('gets and sets config values', async () => {
    expect(await store.getConfig('foo')).toBeUndefined();
    await store.setConfig('foo', 'bar');
    expect(await store.getConfig('foo')).toBe('bar');
  });

  it('overwrites config on duplicate key', async () => {
    await store.setConfig('key', 'val1');
    await store.setConfig('key', 'val2');
    expect(await store.getConfig('key')).toBe('val2');
  });

  it('gets and sets wiki space ID', async () => {
    expect(await store.getWikiSpaceId()).toBeUndefined();
    await store.setWikiSpaceId('space_123');
    expect(await store.getWikiSpaceId()).toBe('space_123');
  });

  // --- Document mappings ---

  it('upserts and retrieves document mapping by ID', async () => {
    const mapping = {
      memoryDocId: 'doc1',
      memoryPath: '/folder/doc.md',
      feishuNodeToken: 'node_abc',
      feishuDocId: 'docx_123',
      contentHash: 'aabbccdd',
      syncedAt: '2024-01-01T00:00:00Z',
    };
    await store.upsertDocMapping(mapping);
    const result = await store.getDocMapping('doc1');
    expect(result).toEqual(mapping);
  });

  it('retrieves document mapping by path', async () => {
    await store.upsertDocMapping({
      memoryDocId: 'doc2',
      memoryPath: '/research/report.md',
      feishuNodeToken: 'node_def',
      feishuDocId: 'docx_456',
      contentHash: '11223344',
      syncedAt: '2024-01-02T00:00:00Z',
    });
    const result = await store.getDocMappingByPath('/research/report.md');
    expect(result?.memoryDocId).toBe('doc2');
  });

  it('returns undefined for missing document mapping', async () => {
    expect(await store.getDocMapping('nonexistent')).toBeUndefined();
    expect(await store.getDocMappingByPath('/nope')).toBeUndefined();
  });

  it('updates existing document mapping on upsert', async () => {
    await store.upsertDocMapping({
      memoryDocId: 'doc1',
      memoryPath: '/old-path',
      feishuNodeToken: 'node_1',
      feishuDocId: 'docx_1',
      contentHash: 'aaaa',
      syncedAt: '2024-01-01T00:00:00Z',
    });
    await store.upsertDocMapping({
      memoryDocId: 'doc1',
      memoryPath: '/new-path',
      feishuNodeToken: 'node_1',
      feishuDocId: 'docx_1',
      contentHash: 'bbbb',
      syncedAt: '2024-01-02T00:00:00Z',
    });
    const result = await store.getDocMapping('doc1');
    expect(result?.memoryPath).toBe('/new-path');
    expect(result?.contentHash).toBe('bbbb');
  });

  it('deletes document mapping', async () => {
    await store.upsertDocMapping({
      memoryDocId: 'doc1',
      memoryPath: '/path',
      feishuNodeToken: 'n1',
      feishuDocId: 'd1',
      contentHash: 'cc',
      syncedAt: '2024-01-01T00:00:00Z',
    });
    await store.deleteDocMapping('doc1');
    expect(await store.getDocMapping('doc1')).toBeUndefined();
  });

  it('lists all document mappings', async () => {
    await store.upsertDocMapping({
      memoryDocId: 'a',
      memoryPath: '/a',
      feishuNodeToken: 'n_a',
      feishuDocId: 'd_a',
      contentHash: '11',
      syncedAt: '2024-01-01',
    });
    await store.upsertDocMapping({
      memoryDocId: 'b',
      memoryPath: '/b',
      feishuNodeToken: 'n_b',
      feishuDocId: 'd_b',
      contentHash: '22',
      syncedAt: '2024-01-02',
    });
    const all = await store.getAllDocMappings();
    expect(all).toHaveLength(2);
    expect(all.map((m) => m.memoryDocId).sort()).toEqual(['a', 'b']);
  });

  // --- Folder mappings ---

  it('upserts and retrieves folder mapping', async () => {
    const mapping = {
      memoryFolderId: 'folder1',
      memoryPath: '/research',
      feishuNodeToken: 'folder_node_1',
    };
    await store.upsertFolderMapping(mapping);
    expect(await store.getFolderMapping('folder1')).toEqual(mapping);
  });

  it('updates folder mapping on upsert', async () => {
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/old', feishuNodeToken: 'n1' });
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/new', feishuNodeToken: 'n2' });
    const result = await store.getFolderMapping('f1');
    expect(result?.memoryPath).toBe('/new');
    expect(result?.feishuNodeToken).toBe('n2');
  });

  it('deletes folder mapping', async () => {
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/x', feishuNodeToken: 'n1' });
    await store.deleteFolderMapping('f1');
    expect(await store.getFolderMapping('f1')).toBeUndefined();
  });

  it('lists all folder mappings', async () => {
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/a', feishuNodeToken: 'n1' });
    await store.upsertFolderMapping({ memoryFolderId: 'f2', memoryPath: '/b', feishuNodeToken: 'n2' });
    const all = await store.getAllFolderMappings();
    expect(all).toHaveLength(2);
  });

  // --- Stats ---

  it('returns correct stats', async () => {
    await store.setWikiSpaceId('space_abc');
    await store.upsertDocMapping({
      memoryDocId: 'doc1',
      memoryPath: '/a',
      feishuNodeToken: 'n1',
      feishuDocId: 'd1',
      contentHash: '11',
      syncedAt: '2024-01-01',
    });
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/b', feishuNodeToken: 'n2' });
    const stats = await store.getStats();
    expect(stats.documentCount).toBe(1);
    expect(stats.folderCount).toBe(1);
    expect(stats.wikiSpaceId).toBe('space_abc');
  });

  // --- Clear all ---

  it('clears all mappings and config', async () => {
    await store.setWikiSpaceId('space_abc');
    await store.upsertDocMapping({
      memoryDocId: 'doc1',
      memoryPath: '/a',
      feishuNodeToken: 'n1',
      feishuDocId: 'd1',
      contentHash: '11',
      syncedAt: '2024-01-01',
    });
    await store.upsertFolderMapping({ memoryFolderId: 'f1', memoryPath: '/b', feishuNodeToken: 'n2' });
    await store.clearAll();
    expect(await store.getAllDocMappings()).toHaveLength(0);
    expect(await store.getAllFolderMappings()).toHaveLength(0);
    expect(await store.getWikiSpaceId()).toBeUndefined();
  });
});
