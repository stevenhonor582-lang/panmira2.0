import { describe, it, expect } from 'vitest';
import * as schema from '../db/schema.js';

describe('plan-B2 schema: knowledge_bases + 加列', () => {
  it('knowledge_bases 表导出', () => {
    expect(schema.knowledgeBases).toBeDefined();
  });

  it('agent_knowledge_refs 表导出', () => {
    expect(schema.agentKnowledgeRefs).toBeDefined();
  });

  it('knowledge_bases 含 16 字段', () => {
    const cols = Object.keys((schema.knowledgeBases as any));
    // Drizzle pgTable 的列定义都在第一层 + symbol
    const fieldNames = cols.filter(k => !k.startsWith('_') && !['Symbol(drizzle:Name)', 'Symbol(drizzle:ExtraConfig)', 'Symbol(drizzle:OriginalName)'].includes(k));
    expect(fieldNames.length).toBeGreaterThanOrEqual(15);
    for (const f of ['id', 'tenantId', 'teamId', 'ownerUserId', 'type', 'name', 'description',
                     'visibility', 'embeddingProviderId', 'chunkSize', 'chunkOverlap',
                     'indexStatus', 'documentCount', 'chunkCount', 'createdBy',
                     'createdAt', 'updatedAt']) {
      expect(fieldNames).toContain(f);
    }
  });

  it('documents 加 5 列 (kbId/kbType/visibility/version/ownerUserId)', () => {
    const docs = schema.documents as any;
    const names = Object.keys(docs);
    for (const f of ['kbId', 'kbType', 'visibility', 'version', 'ownerUserId']) {
      expect(names).toContain(f);
    }
  });

  it('document_chunks 加 chunkTokenCount 列', () => {
    const chunks = schema.documentChunks as any;
    const names = Object.keys(chunks);
    expect(names).toContain('chunkTokenCount');
  });

  it('2 张 plan-B2 新表都在 schema 模块', () => {
    const all = Object.keys(schema);
    for (const t of ['knowledgeBases', 'agentKnowledgeRefs']) {
      expect(all).toContain(t);
    }
  });
});
