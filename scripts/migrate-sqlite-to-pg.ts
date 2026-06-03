/**
 * One-time migration script: SQLite -> PostgreSQL
 * Run with: npx tsx scripts/migrate-sqlite-to-pg.ts
 */
import Database from 'better-sqlite3';
import pg from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
const SESSION_DIR = process.env.SESSION_STORE_DIR || path.join(os.homedir(), '.metabot');
const DATA_DIR = process.env.MEMORY_DATABASE_DIR || path.join(process.cwd(), 'data');

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function query(sql: string, params?: any[]) {
  return pool.query(sql, params);
}

async function migrateTable(sqlitePath: string, tableName: string, columns: string[]) {
  if (!fs.existsSync(sqlitePath)) {
    console.log(`  SKIP ${tableName}: ${sqlitePath} not found`);
    return;
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const count = (sqlite.prepare(`SELECT count(*) as c FROM "${tableName}"`).get() as any).c;

  if (count === 0) {
    console.log(`  SKIP ${tableName}: 0 rows`);
    sqlite.close();
    return;
  }

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colList = columns.join(', ');
  const insertSql = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all() as any[];
  let inserted = 0;

  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      if (typeof val === 'boolean') return val ? true : false;
      return val ?? null;
    });
    try {
      await query(insertSql, values);
      inserted++;
    } catch (err: any) {
      console.error(`    ERROR ${tableName} row: ${err.message.slice(0, 100)}`);
    }
  }

  console.log(`  OK ${tableName}: ${inserted}/${count} rows`);
  sqlite.close();
}

async function migrateSkills() {
  const dbPath = path.join(DATA_DIR, 'skill-hub.db');
  if (!fs.existsSync(dbPath)) {
    console.log('  SKIP skills: not found');
    return;
  }

  const sqlite = new Database(dbPath, { readonly: true });
  const rows = sqlite.prepare('SELECT * FROM skills').all() as any[];

  if (rows.length === 0) {
    console.log('  SKIP skills: 0 rows');
    sqlite.close();
    return;
  }

  const cols = [
    'id',
    'name',
    'description',
    'version',
    'author',
    'tags',
    'user_invocable',
    'context',
    'allowed_tools',
    'skill_md',
    'references_tar',
    'published_at',
    'updated_at',
  ];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO skills (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  for (const row of rows) {
    const values = cols.map((col) => {
      const val = row[col];
      if (col === 'tags') return typeof val === 'string' ? val : JSON.stringify(val ?? []);
      if (col === 'user_invocable') return val ? true : false;
      if (col === 'references_tar' && val) return Buffer.from(val);
      return val ?? null;
    });
    try {
      await query(insertSql, values);
      inserted++;
    } catch (err: any) {
      console.error(`    ERROR skill ${row.name}: ${err.message.slice(0, 100)}`);
    }
  }

  console.log(`  OK skills: ${inserted}/${rows.length} rows`);
  sqlite.close();
}

async function migrateMemory() {
  const dbPath = path.join(DATA_DIR, 'metamemory.db');
  if (!fs.existsSync(dbPath)) {
    console.log('  SKIP memory: not found');
    return;
  }

  const sqlite = new Database(dbPath, { readonly: true });

  // Folders
  const folders = sqlite.prepare('SELECT * FROM folders').all() as any[];
  if (folders.length > 0) {
    const cols = ['id', 'name', 'parent_id', 'path', 'visibility', 'created_at', 'updated_at'];
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO folders (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT DO NOTHING`;
    let n = 0;
    for (const row of folders) {
      try {
        await query(
          sql,
          cols.map((c) => row[c] ?? null),
        );
        n++;
      } catch (err: any) {
        console.error(`    ERROR folder: ${err.message.slice(0, 80)}`);
      }
    }
    console.log(`  OK folders: ${n}/${folders.length} rows`);
  }

  // Documents
  const docs = sqlite.prepare('SELECT * FROM documents').all() as any[];
  if (docs.length > 0) {
    const cols = ['id', 'title', 'folder_id', 'path', 'content', 'tags', 'created_by', 'created_at', 'updated_at'];
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO documents (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT DO NOTHING`;
    let n = 0;
    for (const row of docs) {
      const values = cols.map((col) => {
        const val = row[col];
        if (col === 'tags') return typeof val === 'string' ? val : JSON.stringify(val ?? []);
        return val ?? null;
      });
      try {
        await query(sql, values);
        n++;
      } catch (err: any) {
        console.error(`    ERROR doc ${row.id}: ${err.message.slice(0, 80)}`);
      }
    }
    console.log(`  OK documents: ${n}/${docs.length} rows`);
  }

  sqlite.close();
}

async function main() {
  console.log('=== SQLite -> PostgreSQL Migration ===\n');

  try {
    console.log('[1/6] Sessions...');
    const sp = path.join(SESSION_DIR, 'sessions.db');
    await migrateTable(sp, 'sessions', [
      'id',
      'bot_name',
      'claude_session_id',
      'working_directory',
      'title',
      'platform',
      'chat_id',
      'created_at',
      'updated_at',
    ]);
    await migrateTable(sp, 'session_links', ['session_id', 'chat_id', 'platform', 'linked_at']);
    await migrateTable(sp, 'session_messages', [
      'id',
      'session_id',
      'role',
      'text',
      'platform',
      'cost_usd',
      'duration_ms',
      'timestamp',
    ]);

    console.log('[2/6] Activity...');
    await migrateTable(path.join(SESSION_DIR, 'activity.db'), 'activity_events', [
      'id',
      'type',
      'bot_name',
      'chat_id',
      'user_id',
      'prompt',
      'response_preview',
      'cost_usd',
      'duration_ms',
      'error_message',
      'timestamp',
    ]);

    console.log('[3/6] Teams...');
    await migrateTable(path.join(SESSION_DIR, 'teams.db'), 'teams', [
      'id',
      'name',
      'members',
      'roles',
      'budget_daily_usd',
      'created_at',
      'updated_at',
    ]);
    await migrateTable(path.join(SESSION_DIR, 'teams.db'), 'group_memberships', ['group_id', 'bot_name', 'joined_at']);

    console.log('[4/6] Skills...');
    await migrateSkills();

    console.log('[5/6] Memory...');
    await migrateMemory();

    console.log('[6/6] Sync mappings...');
    const syncPath = path.join(DATA_DIR, 'sync-mapping.db');
    await migrateTable(syncPath, 'sync_config', ['key', 'value']);
    await migrateTable(syncPath, 'document_mappings', [
      'memory_doc_id',
      'memory_path',
      'feishu_node_token',
      'feishu_doc_id',
      'content_hash',
      'synced_at',
    ]);
    await migrateTable(syncPath, 'folder_mappings', ['memory_folder_id', 'memory_path', 'feishu_node_token']);

    console.log('\n=== Done! ===');
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
