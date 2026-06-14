import { decrypt } from '../src/db/crypto.ts';
import { pool } from '../src/db/index.ts';

async function main() {
  const rows = await pool.query('SELECT name, type, base_url, api_key_encrypted, model, is_default FROM provider_configs ORDER BY type, is_default DESC');
  for (const r of rows.rows as any[]) {
    try {
      const key = decrypt(r.api_key_encrypted);
      const masked = key.length > 12 ? key.slice(0, 8) + '...' + key.slice(-4) + ' (len=' + key.length + ')' : '(short) ' + key;
      console.log('[' + (r.is_default ? '*' : ' ') + '] ' + (r.name||'').padEnd(20) + ' ' + (r.type||'').padEnd(10) + ' ' + (r.model||'').padEnd(20) + ' key=' + masked);
    } catch (e: any) {
      console.log('[!] ' + r.name + ': DECRYPT FAILED: ' + e.message);
    }
  }
  process.exit(0);
}
main();
