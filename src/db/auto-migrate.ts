/**
 * auto-migrate.ts — Startup schema sync
 * Reads schema.ts table definitions and adds missing tables/columns.
 * Safe: only ADDs, never drops or alters existing columns.
 */
import type { Logger } from '../utils/logger.js';
import { pool } from './index.js';

// Drizzle column type → SQL type mapping
function drizzleToSql(col: any): string {
  const type = col.columnType ?? col.dataType ?? '';
  if (type.includes('uuid')) return 'uuid';
  if (type.includes('varchar') || type.includes('text')) {
    const len = col?.config?.length;
    return len ? `varchar(${len})` : 'text';
  }
  if (type.includes('integer') || type.includes('serial')) return 'integer';
  if (type.includes('bigint')) return 'bigint';
  if (type.includes('real') || type.includes('numeric')) return 'real';
  if (type.includes('boolean')) return 'boolean';
  if (type.includes('timestamp')) return 'timestamptz';
  if (type.includes('date')) return 'date';
  if (type.includes('jsonb')) return 'jsonb';
  if (type.includes('vector')) return 'vector(1024)';
  if (type.includes('bytea')) return 'bytea';
  return 'text'; // fallback
}

function drizzleDefault(col: any): string | null {
  const type = col.columnType ?? col.dataType ?? '';
  // Check for .default() values
  if (col.defaultFn !== undefined || col.default !== undefined) {
    const def = col.defaultFn ?? col.default;
    if (typeof def === 'function') return null; // runtime function like gen_random_uuid
    if (def === true) return 'true';
    if (def === false) return 'false';
    if (typeof def === 'number') return String(def);
    if (typeof def === 'string') return `'${def}'`;
    if (Array.isArray(def)) return def.length === 0 ? "'[]'::jsonb" : null;
    if (typeof def === 'object' && def !== null) {
      const keys = Object.keys(def);
      return keys.length === 0 ? "'{}'::jsonb" : null;
    }
  }
  return null;
}

interface TableDef {
  name: string;
  columns: { name: string; sqlType: string; nullable: boolean; defaultVal: string | null; primaryKey: boolean }[];
}

// Build table definitions from raw drizzle schema export
function extractTables(schema: Record<string, any>): TableDef[] {
  const tables: TableDef[] = [];
  for (const [, val] of Object.entries(schema)) {
    if (!val || typeof val !== 'object' || !val._.name) continue;
    const tableName: string = val._.name;
    const cols: TableDef['columns'] = [];
    // Drizzle stores columns in _.cols or directly on the symbol
    const colEntries = val._.cols ?? {};
    for (const [colName, colDef] of Object.entries(colEntries)) {
      const c = colDef as any;
      cols.push({
        name: colName,
        sqlType: drizzleToSql(c),
        nullable: !c.notNull,
        defaultVal: drizzleDefault(c),
        primaryKey: !!c.primary,
      });
    }
    if (cols.length > 0) {
      tables.push({ name: tableName, columns: cols });
    }
  }
  return tables;
}

export async function runAutoMigrate(logger: Logger): Promise<void> {
  // Import schema dynamically to get all table definitions
  const schema = await import('./schema.js');
  const tables = extractTables(schema);
  if (tables.length === 0) {
    logger.warn('auto-migrate: no tables found in schema.ts');
    return;
  }

  let tablesCreated = 0;
  let columnsAdded = 0;

  for (const table of tables) {
    // Check if table exists
    const { rows: tableCheck } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
      [table.name],
    );

    if (!tableCheck[0].exists) {
      // Create table with all columns
      const colDefs = table.columns.map(c => {
        let def = `"${c.name}" ${c.sqlType}`;
        if (c.defaultVal) def += ` DEFAULT ${c.defaultVal}`;
        return def;
      });
      await pool.query(`CREATE TABLE IF NOT EXISTS "${table.name}" (${colDefs.join(', ')})`);
      tablesCreated++;
      logger.info({ table: table.name, columns: table.columns.length }, 'auto-migrate: created table');
      continue;
    }

    // Table exists — check for missing columns
    const { rows: existingCols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table.name],
    );
    const existingSet = new Set(existingCols.map((r: any) => r.column_name));

    for (const col of table.columns) {
      if (existingSet.has(col.name)) continue;
      let sql = `ALTER TABLE "${table.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.sqlType}`;
      if (col.defaultVal) sql += ` DEFAULT ${col.defaultVal}`;
      await pool.query(sql);
      columnsAdded++;
    }
  }

  if (tablesCreated > 0 || columnsAdded > 0) {
    logger.info({ tablesCreated, columnsAdded }, 'auto-migrate: schema updated');
  } else {
    logger.debug({ tables: tables.length }, 'auto-migrate: schema up to date');
  }
}
