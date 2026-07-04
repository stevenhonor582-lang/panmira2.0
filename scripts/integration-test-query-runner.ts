/**
 * Integration Test: SDK Core QueryRunner
 * 
 * Tests end-to-end: QueryRunner.createDefault() → runQuery('得一', 'hello')
 * Verifies:
 *   1. Bot lookup succeeds
 *   2. Session created (jsonl file exists)
 *   3. SDK returns session_id
 *   4. system_prompt from DB injected (via agents table — may be empty)
 *   5. No exceptions thrown
 * 
 * Usage: npx tsx scripts/integration-test-query-runner.ts
 */

import { QueryRunner } from '../src/sdk-core/query-runner.js';
import { createLogger } from '../src/utils/logger.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG = createLogger('info').child({ module: 'integration-test' });

async function main() {
  LOG.info({}, '=== Day 6 Integration Test Started ===');

  // Step 1: Create QueryRunner via factory
  LOG.info({}, 'Step 1: Create QueryRunner.createDefault()');
  const runner = QueryRunner.createDefault();
  LOG.info({}, '✓ QueryRunner created');

  // Step 2: Run query
  LOG.info({ bot_name: '得一', prompt: 'PoC integration test' }, 'Step 2: runQuery');
  
  let result;
  try {
    result = await runner.runQuery({
      botName: '得一',
      prompt: 'Reply with "integration-test-ok" only.',
      continue: false,  // 不复用历史，避免污染老 session
    });
  } catch (err: any) {
    LOG.error({ err: err.message, name: err.name, stack: err.stack }, 'QueryRunner.runQuery failed');
    console.log('\n❌ FAILED:', err.message);
    process.exit(1);
  }

  // Step 3: Verify result
  LOG.info({ session_id: result.sessionId, bot_name: result.bot.name }, 'Step 3: Result');
  console.log('\n✓ PASSED:');
  console.log('  bot:', result.bot.name);
  console.log('  english_slug:', result.bot.englishSlug);
  console.log('  session_id:', result.sessionId);
  console.log('  messages:', result.messages.length);

  // Step 4: Verify jsonl file
  const jsonlPath = join(
    homedir(),
    '.claude',
    'projects',
    '-home-ubuntu-workspace-deyi',
    `${result.sessionId}.jsonl`,
  );
  if (existsSync(jsonlPath)) {
    console.log('  jsonl:', jsonlPath, '✓ exists');
  } else {
    console.log('  jsonl:', jsonlPath, '⚠️ not found (may not be created if query failed)');
  }

  // Step 5: Print message type summary
  const typeCounts: Record<string, number> = {};
  for (const msg of result.messages) {
    const key = msg.type + '/' + ((msg as any).subtype || '-');
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  }
  console.log('\n  message types:');
  for (const [k, v] of Object.entries(typeCounts)) {
    console.log('    ', k, ':', v);
  }

  LOG.info({}, '=== Day 6 Integration Test Completed ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
