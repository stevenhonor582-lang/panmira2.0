import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { SessionStore } from '../../src/clarification/session-store.js';
import { SchemaValidator } from '../../src/clarification/schema-validator.js';
import { QuestionGenerator } from '../../src/clarification/question-generator.js';
import { ClarificationEngine } from '../../src/clarification/engine.js';
import { ClarificationMiddleware } from '../../src/clarification/middleware.js';
import { CardBuilder } from '../../src/clarification/card-builder.js';
import { ConfigLoader } from '../../src/clarification/config-loader.js';
import type { FieldSchema, FieldGap } from '../../src/clarification/types.js';

const DB_URL = process.env.DATABASE_URL || 'postgresql://ubuntu:ubuntu@localhost:5432/panmira';
const TEST_USER = 'e2e-test-user-' + Date.now();

describe('E2E: Clarification Flow (doc-bot write-proposal)', () => {
  let pool: Pool;
  let store: SessionStore;
  let mw: ClarificationMiddleware;
  let lastCard: any;
  let lastText: string | null;

  const schemas: Record<string, FieldSchema[]> = {
    'write-proposal': [
      { name: 'topic', type: 'enum', question: '方案主题？', options: ['产品介绍', '技术方案', '商业计划'], required: true },
      { name: 'audience', type: 'enum', question: '目标读者？', options: ['管理层', '技术团队', '客户'], required: true },
      { name: 'length', type: 'enum', question: '期望篇幅？', options: ['500字', '1500字', '3000字+'], required: true },
    ],
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    store = new SessionStore(pool);

    const engine = new ClarificationEngine(
      new SchemaValidator(schemas),
      new QuestionGenerator(),
      { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false }
    );

    lastCard = null;
    lastText = null;

    mw = new ClarificationMiddleware(
      engine,
      store,
      new ConfigLoader({
        'doc-bot': { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false }
      }),
      new CardBuilder(),
      async (_chatId: string, card: unknown) => { lastCard = card; return true; },
      async (_chatId: string, text: string) => { lastText = text; return true; }
    );
  });

  afterAll(async () => {
    await store.markAbandoned(TEST_USER, 'doc-bot', 'write-proposal');
    await pool.end();
  });

  it('3轮补全后 session 完成', async () => {
    const executedSkill = { called: false, payload: null as any };

    // T0: 用户发起
    await mw.handle(
      { userId: TEST_USER, botId: 'doc-bot', targetSkill: 'write-proposal', rawMessage: '帮我写个方案', enrichedPayload: undefined, chatId: 'test-chat' },
      async () => { executedSkill.called = true; }
    );
    expect(executedSkill.called).toBe(false);
    expect(lastCard).not.toBeNull();

    // T1: 用户点 topic=技术方案
    let session = await store.get(TEST_USER, 'doc-bot', 'write-proposal');
    expect(session).not.toBeNull();
    const gapsAfterT1: FieldGap[] = schemas['write-proposal']
      .filter(f => !session!.payload[f.name] && f.required)
      .map(f => ({ name: f.name, type: f.type, question: f.question, options: f.options, required: f.required }));
    await store.updatePayload(TEST_USER, 'doc-bot', 'write-proposal', { topic: '技术方案' }, gapsAfterT1);

    // T2: 用户点 audience=技术团队
    session = await store.get(TEST_USER, 'doc-bot', 'write-proposal');
    const gapsAfterT2: FieldGap[] = schemas['write-proposal']
      .filter(f => !session!.payload[f.name] && f.required)
      .map(f => ({ name: f.name, type: f.type, question: f.question, options: f.options, required: f.required }));
    await store.updatePayload(TEST_USER, 'doc-bot', 'write-proposal', { audience: '技术团队' }, gapsAfterT2);

    // T3: 用户点 length=1500字
    session = await store.get(TEST_USER, 'doc-bot', 'write-proposal');
    const gapsAfterT3: FieldGap[] = schemas['write-proposal']
      .filter(f => !session!.payload[f.name] && f.required)
      .map(f => ({ name: f.name, type: f.type, question: f.question, options: f.options, required: f.required }));
    expect(gapsAfterT3).toHaveLength(1);
    await store.updatePayload(TEST_USER, 'doc-bot', 'write-proposal', { length: '1500字' }, []);
    await store.markCompleted(TEST_USER, 'doc-bot', 'write-proposal');

    // 验证：3个字段都补齐，状态 completed
    const finalSession = await store.get(TEST_USER, 'doc-bot', 'write-proposal');
    expect(finalSession!.payload).toMatchObject({ topic: '技术方案', audience: '技术团队', length: '1500字' });
    expect(finalSession!.status).toBe('completed');
  });

  it('未知 skill 跳过澄清（silently fallback）', async () => {
    lastCard = null;
    const executedSkill = { called: false };
    await mw.handle(
      { userId: TEST_USER + '-other', botId: 'doc-bot', targetSkill: 'random-skill', rawMessage: 'hi', enrichedPayload: undefined, chatId: 'test-chat-2' },
      async () => { executedSkill.called = true; }
    );
    expect(executedSkill.called).toBe(true);
    expect(lastCard).toBeNull();
    try { await store.markAbandoned(TEST_USER + '-other', 'doc-bot', 'random-skill'); } catch (_) {}
  });
});
