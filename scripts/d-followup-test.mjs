// D-followup test v2 (no TypeScript syntax)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { pool } = await import('../dist/db/index.js');
const { MemoryWriter } = await import('../dist/bridge/memory-writer.js');

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const mockMemoryClient = { searchInFolders: async () => [], ensureFolder: async () => 'id' };
const mockExtractor = { extract: async () => [] };
const mockNormalizer = { normalize: async (text) => ({ canonical: text, confidence: 0.9 }) };

console.log('=== D-followup: tenant_id derivation test ===\n');

const testCases = [
  {
    name: 'Test 1: p2p chat with real user',
    metadata: { chatId: 'oc_test_001', chatType: 'p2p', userId: 'ou_test_user_abc' },
    expectedTenant: 'user:ou_test_user_abc'
  },
  {
    name: 'Test 2: group chat',
    metadata: { chatId: 'oc_test_group_xyz', chatType: 'group', userId: 'ou_member_123' },
    expectedTenant: 'group:oc_test_group_xyz'
  },
  {
    name: 'Test 3: no userId (fallback)',
    metadata: { chatId: 'oc_test_003', chatType: 'p2p' },
    expectedTenant: 'tenant:legacy'
  }
];

let allPass = true;
for (const tc of testCases) {
  const writer = new MemoryWriter(mockMemoryClient, mockLogger, mockExtractor, mockNormalizer);
  const deriveTenant = writer.deriveTenant.bind(writer);
  const result = deriveTenant(tc.metadata);
  const ok = result === tc.expectedTenant;
  console.log(tc.name);
  console.log('  metadata:', JSON.stringify(tc.metadata));
  console.log('  expected:', tc.expectedTenant);
  console.log('  actual:  ', result);
  console.log('  result:', ok ? 'PASS' : 'FAIL');
  if (!ok) allPass = false;
}

console.log('\n=== Live INSERT (user tenant) ===');
try {
  const r = await pool.query(
    `INSERT INTO memories (id, content, layer, user_id, tenant_id, type, bot_id, subject_normalized)
     VALUES ('d-followup-test-1', 'test content from bot', 2, 'ou_d_followup_test', 'user:ou_d_followup_test', 'fact',
             (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1),
             'd.followup.test.user')
     RETURNING id, tenant_id`,
    ['得一']
  );
  console.log('INSERT OK:', r.rows[0]);
  await pool.query("DELETE FROM memories WHERE id = 'd-followup-test-1'");
  console.log('Cleanup OK');
} catch (e) {
  console.log('INSERT FAIL:', e.message);
  allPass = false;
}

console.log('\n=== CHECK constraint blocks default tenant ===');
try {
  await pool.query(
    `INSERT INTO memories (id, content, layer, user_id, tenant_id, type, bot_id, subject_normalized)
     VALUES ('d-followup-test-2', 'should fail', 1, 'test', 'default', 'event',
             (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1),
             'd.followup.should.fail')`,
    ['得一']
  );
  console.log('UNEXPECTED: INSERT succeeded');
  allPass = false;
} catch (e) {
  if (e.message.includes('check constraint')) {
    console.log('OK: CHECK rejected default:', e.message.split('\n')[0]);
  } else {
    console.log('Unexpected:', e.message);
    allPass = false;
  }
}

await pool.end();
console.log('\n' + (allPass ? 'ALL PASS' : 'SOME FAILED'));
process.exit(allPass ? 0 : 1);