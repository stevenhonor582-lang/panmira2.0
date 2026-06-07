// @ts-nocheck
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
// @ts-nocheck
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { SessionStore } from '../session-store.js';
import type { FieldGap } from '../types.js';

function getTestDbUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  // Fall back to .env DATABASE_URL (test runs without manual env export)
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?/);
    if (match) return match[1];
  }
  return 'postgresql://localhost/panmira_test';
}

const TEST_DB = getTestDbUrl();

describe('SessionStore', () => {
  let pool: Pool;
  let store: SessionStore;

  beforeEach(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query("DELETE FROM clarification_sessions WHERE bot_id = $1", ['test-bot']);
    store = new SessionStore(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates and retrieves a session', async () => {
    const gaps: FieldGap[] = [
      { name: 'topic', type: 'string', required: true, question: 'Q' },
    ];
    const session = await store.create('user-1', 'test-bot', 'write-proposal', gaps);

    expect(session.userId).toBe('user-1');
    expect(session.targetSkill).toBe('write-proposal');
    expect(session.missingFields).toHaveLength(1);

    const fetched = await store.get('user-1', 'test-bot', 'write-proposal');
    expect(fetched?.id).toBe(session.id);
  });

  it('updates payload and missing fields', async () => {
    await store.create('user-2', 'test-bot', 'write-proposal', [
      { name: 'topic', type: 'string', required: true, question: 'Q' },
      { name: 'audience', type: 'string', required: true, question: 'Q2' },
    ]);

    const updated = await store.updatePayload(
      'user-2', 'test-bot', 'write-proposal',
      { topic: 'A' },
      [{ name: 'audience', type: 'string', required: true, question: 'Q2' }]
    );

    expect(updated.payload.topic).toBe('A');
    expect(updated.missingFields).toHaveLength(1);
  });

  it('marks session as completed', async () => {
    await store.create('user-3', 'test-bot', 'write-proposal', []);
    const completed = await store.markCompleted('user-3', 'test-bot', 'write-proposal');
    expect(completed.status).toBe('completed');
  });

  it('marks session as abandoned', async () => {
    await store.create('user-4', 'test-bot', 'write-proposal', []);
    const abandoned = await store.markAbandoned('user-4', 'test-bot', 'write-proposal');
    expect(abandoned.status).toBe('abandoned');
  });

  it('returns null for non-existent session', async () => {
    const result = await store.get('nope', 'test-bot', 'write-proposal');
    expect(result).toBeNull();
  });

  it('deletes expired sessions', async () => {
    await pool.query(
      `INSERT INTO clarification_sessions
       (user_id, bot_id, target_skill, status, expires_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour')`,
      ['old-user', 'test-bot', 'old-skill', 'pending']
    );
    const deleted = await store.deleteExpired();
    expect(deleted).toBeGreaterThanOrEqual(1);
  });
});
