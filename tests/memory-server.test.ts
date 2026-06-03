import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => {
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
  return { mockQuery };
});

vi.mock('../src/db/index.js', () => ({
  pool: { query: mockQuery, on: vi.fn() },
  db: {},
  query: mockQuery,
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { startMemoryServer } from '../src/memory/memory-server.js';

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() } as any;
}

describe('MetaMemory server request limits', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      cleanup?.();
    }
  });

  async function startTestServer() {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metamemory-test-'));
    cleanups.push(() => fs.rmSync(databaseDir, { recursive: true, force: true }));

    const { server, storage } = startMemoryServer({
      port: 0,
      databaseDir,
      logger: createLogger(),
    });

    cleanups.push(() => storage.close());
    cleanups.push(() => server.close());

    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;

    return {
      url: `http://127.0.0.1:${address.port}`,
    };
  }

  async function startAuthenticatedTestServer() {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metamemory-auth-test-'));
    cleanups.push(() => fs.rmSync(databaseDir, { recursive: true, force: true }));

    const { server, storage } = startMemoryServer({
      port: 0,
      databaseDir,
      secret: 'test-secret',
      logger: createLogger(),
    });

    cleanups.push(() => storage.close());
    cleanups.push(() => server.close());

    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;

    return {
      url: `http://127.0.0.1:${address.port}`,
    };
  }

  it('returns 400 for invalid JSON bodies', async () => {
    const { url } = await startTestServer();

    const response = await fetch(`${url}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: 'Invalid JSON in request body',
    });
  });

  it('returns 413 for oversized JSON bodies', async () => {
    const { url } = await startTestServer();
    const oversizedPayload = JSON.stringify({
      name: 'x',
      description: 'a'.repeat(10 * 1024 * 1024),
    });

    const response = await fetch(`${url}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedPayload,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      detail: 'Request body too large (max 10 MB)',
    });
  });

  it('allows unauthenticated health checks while keeping other API routes protected', async () => {
    const { url } = await startAuthenticatedTestServer();

    const healthResponse = await fetch(`${url}/api/health`);
    expect(healthResponse.status).toBe(200);

    const foldersResponse = await fetch(`${url}/api/folders`);
    expect(foldersResponse.status).toBe(401);
    await expect(foldersResponse.json()).resolves.toEqual({
      detail: 'Unauthorized',
    });
  });
});
