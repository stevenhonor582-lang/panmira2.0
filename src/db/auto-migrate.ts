/**
 * auto-migrate.ts — Startup schema sync
 * Reads schema.ts Drizzle table definitions and adds missing tables/columns.
 * Safe: only ADDs, never drops or alters existing columns.
 */
import type { Logger } from '../utils/logger.js';
import { pool } from './index.js';

interface ColDef {
  name: string;
  sqlType: string;
  nullable: boolean;
  defaultVal: string | null;
  primaryKey: boolean;
}

interface TableDef {
  name: string;
  columns: ColDef[];
}

// Drizzle columnType → PostgreSQL type
function drizzleToSql(col: any): string {
  const ct: string = col.columnType ?? '';

  if (ct === 'PgUUID') return 'uuid';
  if (ct === 'PgVarchar') {
    const len = col.config?.length;
    return len ? `varchar(${len})` : 'varchar';
  }
  if (ct === 'PgText') return 'text';
  if (ct === 'PgBoolean') return 'boolean';
  if (ct === 'PgInteger') return 'integer';
  if (ct === 'PgSerial') return 'serial';
  if (ct === 'PgBigInt53') return 'bigint';
  if (ct === 'PgReal') return 'real';
  if (ct === 'PgNumeric') return 'numeric';
  if (ct === 'PgTimestamp') return 'timestamptz';
  if (ct === 'PgDateString') return 'date';
  if (ct === 'PgJsonb') return 'jsonb';
  if (ct === 'PgEnumColumn') return 'text';
  // Custom (vector, bytea, etc.) and Array — use getSQLType()
  if (typeof col.getSQLType === 'function') return col.getSQLType();

  return 'text';
}

function drizzleDefault(col: any): string | null {
  if (!col.hasDefault) return null;
  const def = col.default;
  if (def === undefined || def === null) return null;

  // SQL function default (gen_random_uuid, now, etc.)
  if (def?.queryChunks) {
    const raw: string = def.queryChunks
      .map((c: any) => (c?.value ? c.value.join('') : String(c)))
      .join('');
    if (raw.toLowerCase().includes('gen_random_uuid')) return 'gen_random_uuid()';
    if (raw.toLowerCase().includes('now()')) return 'now()';
    return null;
  }

  if (typeof def === 'boolean') return def ? 'true' : 'false';
  if (typeof def === 'number') return String(def);
  if (typeof def === 'string') return `'${def.replace(/'/g, "''")}'`;

  // jsonb defaults — plain JS arrays / objects
  if (Array.isArray(def)) return def.length === 0 ? "'[]'::jsonb" : null;
  if (typeof def === 'object') {
    const keys = Object.keys(def as Record<string, unknown>);
    return keys.length === 0 ? "'{}'::jsonb" : null;
  }

  return null;
}

function extractTables(schema: Record<string, any>): TableDef[] {
  const tables: TableDef[] = [];

  for (const [, val] of Object.entries(schema)) {
    if (!val || typeof val !== 'object') continue;

    const syms = Object.getOwnPropertySymbols(val);
    const nameSym = syms.find(s => s.description === 'drizzle:Name');
    if (!nameSym) continue;

    const tableName: string = val[nameSym];
    if (typeof tableName !== 'string') continue;

    const colsSym = syms.find(s => s.description === 'drizzle:Columns');
    if (!colsSym) continue;

    const colsObj = val[colsSym];
    if (!colsObj || typeof colsObj !== 'object') continue;

    const cols: ColDef[] = [];
    for (const [, col] of Object.entries(colsObj)) {
      const c = col as any;
      if (!c?.name) continue;
      cols.push({
        name: c.name,
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
  const schema = await import('./schema.js');
  const tables = extractTables(schema);
  if (tables.length === 0) {
    logger.warn('auto-migrate: no tables found in schema.ts');
    return;
  }

  let tablesCreated = 0;
  let columnsAdded = 0;

  for (const table of tables) {
    const { rows: tableCheck } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
      [table.name],
    );

    if (!tableCheck[0].exists) {
      const colDefs = table.columns.map(c => {
        let def = `"${c.name}" ${c.sqlType}`;
        if (c.primaryKey) def += ' PRIMARY KEY';
        if (c.defaultVal) def += ` DEFAULT ${c.defaultVal}`;
        return def;
      });
      await pool.query(`CREATE TABLE IF NOT EXISTS "${table.name}" (${colDefs.join(', ')})`);
      tablesCreated++;
      logger.info({ table: table.name, columns: table.columns.length }, 'auto-migrate: created table');
      continue;
    }

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
