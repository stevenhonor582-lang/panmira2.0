import { db } from '../../db/index.js';
import { memories } from '../../db/schema.js';
import { eq, and, inArray, desc, sql, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Memory, MemoryResult } from '../../core/types.js';
import { MemoryLayer } from '../../core/constants.js';
import type { StorageBackend } from './types.js';

export class PostgresStore implements StorageBackend {
  async store(memory: Memory): Promise<string> {
    const id = memory.id ?? randomUUID();
    await db
      .insert(memories)
      .values({
        id,
        content: memory.content,
        layer: memory.layer,
        userId: memory.userId,
        agentId: memory.agentId,
        tenantId: memory.tenantId,
        importance: memory.importance,
        embedding: memory.embedding ? sql`${JSON.stringify(memory.embedding)}::vector` : undefined,
        metadataJson: memory.metadata,
      })
      .onConflictDoUpdate({
        target: memories.id,
        set: { content: memory.content, importance: memory.importance },
      });
    return id;
  }

  async retrieve(
    query: string,
    userId: string,
    options?: { layers?: number[]; limit?: number; threshold?: number },
  ): Promise<MemoryResult[]> {
    const limit = options?.limit ?? 5;
    const layers = options?.layers ?? [MemoryLayer.USER];
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return this.fallbackSearch(userId, layers, limit);
    }

    const ilikeConditions = keywords.map((kw) => sql`${memories.content} ILIKE ${'%' + kw + '%'}`);
    const rows = await db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), inArray(memories.layer, layers), or(...ilikeConditions)))
      .orderBy(desc(memories.importance))
      .limit(limit * 3);

    const scored = rows
      .map((row: any) => {
        const content = row.content.toLowerCase();
        let matchCount = 0;
        for (const kw of keywords) {
          if (content.includes(kw.toLowerCase())) matchCount++;
        }
        return { row, matchCount };
      })
      .sort((a: any, b: any) => b.matchCount - a.matchCount || (b.row.importance ?? 0) - (a.row.importance ?? 0));

    return scored.slice(0, limit).map((item: any, i: any) => ({
      memory: this.rowToMemory(item.row),
      similarity: Math.min(item.matchCount / keywords.length, 1),
      rank: i + 1,
    }));
  }

  async retrieveVector(
    embedding: number[],
    userId: string,
    options?: { layers?: number[]; limit?: number; threshold?: number },
  ): Promise<MemoryResult[]> {
    const limit = options?.limit ?? 5;
    const layers = options?.layers ?? [MemoryLayer.USER];
    const threshold = options?.threshold ?? 0.5;

    const rows = await db
      .select({
        id: memories.id,
        content: memories.content,
        layer: memories.layer,
        userId: memories.userId,
        agentId: memories.agentId,
        tenantId: memories.tenantId,
        importance: memories.importance,
        accessCount: memories.accessCount,
        lastAccessed: memories.lastAccessed,
        metadataJson: memories.metadataJson,
        createdAt: memories.createdAt,
        distance: sql<number>`(${sql.raw(JSON.stringify(embedding))}::vector <=> ${memories.embedding})`,
      })
      .from(memories)
      .where(and(eq(memories.userId, userId), inArray(memories.layer, layers), sql`${memories.embedding} IS NOT NULL`))
      .orderBy(sql`(${sql.raw(JSON.stringify(embedding))}::vector <=> ${memories.embedding})`)
      .limit(limit);

    return rows
      .filter((row: any) => row.distance !== null && 1 - row.distance >= threshold)
      .map((row: any, i: number) => ({
        memory: this.rowToMemory(row),
        similarity: 1 - (row.distance ?? 1),
        rank: i + 1,
      }));
  }

  async updateAccess(id: string): Promise<void> {
    await db
      .update(memories)
      .set({ accessCount: sql`${memories.accessCount} + 1`, lastAccessed: new Date() })
      .where(eq(memories.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(memories).where(eq(memories.id, id));
  }

  async deleteByUser(userId: string): Promise<number> {
    const result = await db.delete(memories).where(eq(memories.userId, userId)).returning({ id: memories.id });
    return result.length;
  }

  private extractKeywords(query: string): string[] {
    const stopChars = new Set([
      '的',
      '了',
      '在',
      '是',
      '我',
      '有',
      '和',
      '就',
      '不',
      '都',
      '一',
      '上',
      '也',
      '很',
      '到',
      '要',
      '去',
      '你',
      '会',
      '着',
      '看',
      '好',
      '这',
      '吗',
      '呢',
      '吧',
      '啊',
      '把',
      '被',
      '让',
      '给',
      '对',
      '从',
      '向',
      '与',
      '以',
      '及',
      '或',
      '但',
      '而',
      '且',
      '所',
      '其',
      '之',
      '中',
      '下',
    ]);
    const keywords: string[] = [];
    const cleaned = query.replace(/[\s,，。！？、；：""''（）【】\[\](){}0-9a-zA-Z]+/g, '');
    for (let i = 0; i < cleaned.length - 1; i++) {
      const bigram = cleaned.substring(i, i + 2);
      if (!stopChars.has(bigram[0]) && !stopChars.has(bigram[1])) {
        keywords.push(bigram);
      }
    }
    return [...new Set(keywords)];
  }

  private async fallbackSearch(userId: string, layers: number[], limit: number): Promise<MemoryResult[]> {
    const rows = await db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), inArray(memories.layer, layers)))
      .orderBy(desc(memories.importance))
      .limit(limit);

    return rows.map((row: any, i: any) => ({
      memory: this.rowToMemory(row),
      similarity: 0.5,
      rank: i + 1,
    }));
  }

  private rowToMemory(row: typeof memories.$inferSelect): Memory {
    return {
      id: row.id,
      content: row.content,
      layer: row.layer as MemoryLayer,
      userId: row.userId,
      agentId: row.agentId ?? undefined,
      tenantId: row.tenantId,
      importance: row.importance ?? 0.5,
      accessCount: row.accessCount ?? 0,
      lastAccessed: row.lastAccessed ?? undefined,
      embedding: row.embedding ?? undefined,
      metadata: (row.metadataJson as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    };
  }
}
