import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DocSync, type DocSyncConfig, type FullDocument } from '../src/sync/doc-sync.js';
import type { FolderTreeNode } from '../src/memory/memory-client.js';

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn(() => createLogger()) } as any;
}

// Mock Feishu wiki/docx API responses
function createMockLarkClient() {
  let nodeCounter = 0;
  return {
    wiki: {
      v2: {
        space: {
          get: vi.fn().mockResolvedValue({ data: { space: { space_id: 'space_123' } } }),
          list: vi.fn().mockResolvedValue({ data: { items: [{ space_id: 'space_123', name: 'MetaMemory' }] } }),
          create: vi.fn().mockResolvedValue({ data: { space: { space_id: 'space_new' } } }),
        },
        spaceNode: {
          create: vi.fn().mockImplementation(() => {
            nodeCounter++;
            return Promise.resolve({
              data: { node: { node_token: `node_${nodeCounter}`, obj_token: `doc_${nodeCounter}` } },
            });
          }),
        },
      },
    },
    docx: {
      v1: {
        documentBlockChildren: {
          create: vi.fn().mockResolvedValue({ data: {} }),
          get: vi.fn().mockResolvedValue({ data: { items: [] } }),
          batchDelete: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    },
  };
}

function createMockMemoryClient(docs: FullDocument[] = [], tree?: FolderTreeNode) {
  const defaultTree: FolderTreeNode = {
    id: 'root',
    name: 'Root',
    path: '/',
    children: [],
    document_count: docs.length,
  };
  return {
    baseUrl: 'http://localhost:8100',
    secret: 'test-secret',
    listFolderTree: vi.fn().mockResolvedValue(tree || defaultTree),
    listDocuments: vi
      .fn()
      .mockResolvedValue(
        docs.map((d) => ({
          id: d.id,
          title: d.title,
          path: d.path,
          folder_id: d.folder_id,
          tags: d.tags,
          created_at: d.created_at,
          updated_at: d.updated_at,
        })),
      ),
  } as any;
}

function makeSampleDoc(overrides: Partial<FullDocument> = {}): FullDocument {
  return {
    id: 'doc1',
    title: 'Test Doc',
    folder_id: 'root',
    path: '/Test Doc',
    content: '# Hello\n\nWorld',
    tags: ['test'],
    created_by: 'user',
    created_at: '2024-01-01',
    updated_at: '2024-01-02',
    ...overrides,
  };
}

describe('DocSync', () => {
  let tmpDir: string;
  let docSync: DocSync;
  let mockClient: ReturnType<typeof createMockLarkClient>;
  let mockMemory: ReturnType<typeof createMockMemoryClient>;

  beforeEach(() => {
    getTables().clear();
    mockQuery.mockClear();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-sync-test-'));
  });

  afterEach(() => {
    if (docSync) docSync.destroy();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setup(docs: FullDocument[] = [], tree?: FolderTreeNode) {
    mockClient = createMockLarkClient();
    mockMemory = createMockMemoryClient(docs, tree);

    const config: DocSyncConfig = {
      feishuAppId: 'test_id',
      feishuAppSecret: 'test_secret',
      databaseDir: tmpDir,
      wikiSpaceName: 'MetaMemory',
      throttleMs: 0, // no delay in tests
    };

    docSync = new DocSync(config, mockMemory, createLogger());

    // Replace internal Lark client with mock
    (docSync as any).client = mockClient;

    // Mock fetchDocument to return from our docs array
    vi.spyOn(docSync as any, 'fetchDocument').mockImplementation(async (docId: string) => {
      return docs.find((d) => d.id === docId) || null;
    });
  }

  it('reports not syncing initially', () => {
    setup();
    expect(docSync.isSyncing()).toBe(false);
  });

  it('returns empty stats when no docs synced', async () => {
    setup();
    const stats = await docSync.getStats();
    expect(stats.documentCount).toBe(0);
    expect(stats.folderCount).toBe(0);
  });

  it('returns error if sync is already in progress', async () => {
    setup();
    // Simulate syncing state
    (docSync as any).syncing = true;
    const result = await docSync.syncAll();
    expect(result.errors).toContain('Sync already in progress');
    (docSync as any).syncing = false;
  });

  it('syncs a single document successfully', async () => {
    const doc = makeSampleDoc();
    setup([doc]);

    const result = await docSync.syncAll();
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(docSync.isSyncing()).toBe(false);
  });

  it('skips unchanged documents on second sync', async () => {
    const doc = makeSampleDoc();
    setup([doc]);

    // First sync
    await docSync.syncAll();

    // Second sync — same content
    const result = await docSync.syncAll();
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });

  it('updates documents when content changes', async () => {
    const doc = makeSampleDoc();
    setup([doc]);

    // First sync
    await docSync.syncAll();

    // Change the document content
    doc.content = '# Updated\n\nNew content';

    const result = await docSync.syncAll();
    expect(result.updated).toBe(1);
  });

  it('syncs folder structure', async () => {
    const tree: FolderTreeNode = {
      id: 'root',
      name: 'Root',
      path: '/',
      children: [
        {
          id: 'f1',
          name: 'Research',
          path: '/Research',
          children: [],
          document_count: 0,
        },
      ],
      document_count: 0,
    };

    setup([], tree);
    await docSync.syncAll();

    const stats = await docSync.getStats();
    expect(stats.folderCount).toBe(1);
  });

  it('detects and cleans up deleted documents', async () => {
    const doc = makeSampleDoc();
    setup([doc]);

    // First sync creates the doc mapping
    await docSync.syncAll();

    // Now remove the doc from MetaMemory
    (docSync as any).fetchDocument = vi.fn().mockResolvedValue(null);
    mockMemory.listDocuments.mockResolvedValue([]);

    const result = await docSync.syncAll();
    expect(result.deleted).toBe(1);
  });

  it('finds existing wiki space by name', async () => {
    setup();
    const spaceId = await (docSync as any).ensureWikiSpace();
    expect(spaceId).toBe('space_123');
    // Verify space.list was called
    expect(mockClient.wiki.v2.space.list).toHaveBeenCalled();
  });

  it('creates wiki space when none exists', async () => {
    setup();
    // Override list to return empty
    mockClient.wiki.v2.space.list.mockResolvedValueOnce({ data: { items: [] } });
    // Override get to fail (stored space invalid)
    mockClient.wiki.v2.space.get.mockRejectedValueOnce(new Error('not found'));

    const spaceId = await (docSync as any).ensureWikiSpace();
    expect(spaceId).toBe('space_new');
    expect(mockClient.wiki.v2.space.create).toHaveBeenCalled();
  });

  it('syncDocument syncs a single doc by ID', async () => {
    const doc = makeSampleDoc();
    setup([doc]);

    const result = await docSync.syncDocument('doc1');
    expect(result.success).toBe(true);
  });

  it('syncDocument returns error for missing doc', async () => {
    setup([]);
    const result = await docSync.syncDocument('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('destroy closes the store', () => {
    setup();
    // Should not throw
    docSync.destroy();
    docSync = undefined as any; // prevent double-destroy in afterEach
  });
});
