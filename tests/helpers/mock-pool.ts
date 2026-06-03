import { vi } from 'vitest';

type Row = Record<string, any>;

function createMockPool() {
  const tables = new Map<string, Row[]>();

  function getTable(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  const pool = {
    query: vi.fn(async (sql: string, params?: any[]) => {
      const fromMatch = sql.match(/FROM\s+(\w+)/i) || sql.match(/INTO\s+(\w+)/i) || sql.match(/DELETE\s+FROM\s+(\w+)/i);
      const table = fromMatch?.[1]?.toLowerCase() || '';

      if (/^SELECT/i.test(sql.trim())) {
        let rows = getTable(table);
        if (params && params.length > 0) {
          const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\$1/i);
          if (whereMatch) {
            const col = whereMatch[1];
            rows = rows.filter((r) => r[col] === params[0]);
          }
        }
        return { rows };
      }

      if (/^INSERT/i.test(sql.trim()) && /ON CONFLICT/i.test(sql)) {
        const tbl = getTable(table);
        const colMatch = sql.match(/ON CONFLICT\s*\((\w+)\)/i);
        const conflictCol = colMatch?.[1] || '';
        const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        const cols = colsMatch?.[1]?.split(',').map((c) => c.trim()) || [];
        const row: Row = {};
        cols.forEach((c, i) => {
          if (params?.[i] !== undefined) row[c] = params[i];
        });
        const existing = tbl.findIndex((r) => r[conflictCol] === row[conflictCol]);
        if (existing >= 0) {
          tbl[existing] = { ...tbl[existing], ...row };
        } else {
          tbl.push(row);
        }
        return { rows: [] };
      }

      if (/^INSERT/i.test(sql.trim())) {
        const tbl = getTable(table);
        const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        const cols = colsMatch?.[1]?.split(',').map((c) => c.trim()) || [];
        const row: Row = {};
        cols.forEach((c, i) => {
          if (params?.[i] !== undefined) row[c] = params[i];
        });
        tbl.push(row);
        return { rows: [] };
      }

      if (/^DELETE/i.test(sql.trim())) {
        const tbl = getTable(table);
        if (params && params.length > 0) {
          const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\$1/i);
          if (whereMatch) {
            const col = whereMatch[1];
            const idx = tbl.findIndex((r) => r[col] === params[0]);
            if (idx >= 0) tbl.splice(idx, 1);
          }
        } else {
          tables.set(table, []);
        }
        return { rows: [] };
      }

      return { rows: [] };
    }),
    on: vi.fn(),
  };

  return { pool, tables };
}

export function mockDbIndex() {
  const { pool } = createMockPool();
  vi.mock('../src/db/index.js', () => ({
    pool,
    db: {},
    query: pool.query,
  }));
  return pool;
}
