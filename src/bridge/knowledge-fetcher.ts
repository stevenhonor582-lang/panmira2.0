import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import { MemoryClient } from '../memory/memory-client.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import { pool } from '../db/index.js';
import { DocEmbedder } from '../memory/doc-embedder.js';

const MEMORY_VECTOR_THRESHOLD = 0.6;

export interface KnowledgeFetcherDeps {
  config: BotConfigBase;
  logger: Logger;
  memoryClient: MemoryClient;
  workspaceManager?: WorkspaceManager;
}

export interface KnowledgeResult {
  systemPromptOverride?: string;
  knowledgeContext: string | null;
  agentBoundSkills: string[];
}

export async function fetchKnowledgeContext(
  deps: KnowledgeFetcherDeps,
  text: string,
  chatId: string,
): Promise<KnowledgeResult> {
  let systemPromptOverride: string | undefined;
  let knowledgeFolders: string[] = deps.config.knowledgeFolders || [];
  let agentBoundSkills: string[] = [];

  if (deps.config.agentId) {
    try {
      const result = await pool.query('SELECT system_prompt, knowledge_folders, skills FROM agents WHERE id = $1', [
        deps.config.agentId,
      ]);
      deps.logger.info(
        {
          botName: deps.config.name,
          agentId: deps.config.agentId,
          found: result.rows.length > 0,
          hasPrompt: !!result.rows[0]?.system_prompt,
        },
        'Agent template resolved',
      );
      if (result.rows[0]?.system_prompt) {
        systemPromptOverride = result.rows[0].system_prompt;
      }
      if (Array.isArray(result.rows[0]?.knowledge_folders) && result.rows[0].knowledge_folders.length > 0) {
        knowledgeFolders = result.rows[0].knowledge_folders;
      }
      if (Array.isArray(result.rows[0]?.skills)) {
        agentBoundSkills = result.rows[0].skills;
      }
    } catch (err: any) {
      deps.logger.debug({ err: err?.message }, 'Agent lookup failed, using config systemPrompt');
    }
  }

  if (knowledgeFolders.length === 0 || !text) {
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  // Skip knowledge search for short continuation messages (续接、确认、闲聊)
  const trimmed = text.trim();
  if (trimmed.length < 15) {
    const contPat = /^(继续|检查|排查|修一下|怎么样|好了吗|完成了吗|接着|看看|查一下|测一下|试一下|好的|ok|嗯|哦|知道了|收到|明白|懂了|对|可以|行|好|谢谢|再见)$/i;
    if (contPat.test(trimmed)) {
      return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
    }
  }

  let searchQuery = text.slice(0, 200);
  if (text.length > 200) {
    const lastSentence = text.slice(200).match(/[。！？.!?\n][^。！？.!?\n]*$/);
    if (lastSentence) searchQuery += lastSentence[0].slice(0, 100);
  }

  // Resolve knowledge folder names to actual folder UUIDs
  let folderUuids: string[] = [];
  if (deps.workspaceManager) {
    try {
      const botFolderIds = await deps.workspaceManager.getBotFolderIds(deps.config.name);
      folderUuids = botFolderIds;
    } catch {}
  }
  // Resolve by name: bot workspace tree + organization public area
  // v22.3 fixed: knowledge_folders supports both personal + org folder names.
  // Agent template defines the list: ["知识沉淀","专业文档","R4-技术库",...]
  // If knowledge_folders is empty → default to 4 personal folders only.
  // Public area folders are searched ONLY if explicitly listed in knowledge_folders.
  if (knowledgeFolders.length > 0) {
    try {
      const nameResults = await pool.query(
        `SELECT f.id FROM folders f
         WHERE f.name = ANY($1)
           AND (f.path LIKE '%/数字员工/' || $2 || '/%' OR f.path LIKE '%/组织公共区/%')`,
        [knowledgeFolders, deps.config.name],
      );
      for (const row of nameResults.rows) {
        if (!folderUuids.includes(row.id)) folderUuids.push(row.id);
      }
    } catch {}
  }
  if (folderUuids.length === 0) {
    deps.logger.warn({ knowledgeFolders }, 'Folder UUID resolution failed, skipping knowledge search');
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  const results = await deps.memoryClient.searchInFolders(searchQuery, folderUuids, 20);
  // B-fix 2026-06-20: vector search for memories (semantic recall) with ILIKE fallback
  // Mirrors VMT 得一 N-1/N-2 fix: vector first, threshold decision, ILIKE as backup
  let memoryResults: any[] = [];
  try {
    const queryEmb = await new DocEmbedder(deps.logger as any).embed(searchQuery);
    const vecStr = JSON.stringify(queryEmb);
    // Use (SELECT id ...) not (SELECT bot_id ...) — fix VMT bug N-2 uuid/varchar type mismatch
    const { rows: vecRows } = await pool.query(
      `SELECT id, type, subject, subject_normalized, confidence, polarity, hit_count,
              LEFT(content, 300) AS snippet, last_hit_at,
              1 - (embedding <=> $1::vector) AS relevance
         FROM memories
         WHERE invalidated_at IS NULL
           AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $2 LIMIT 1)
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC LIMIT 8`,
      [vecStr, deps.config.name],
    );
    const topRel = vecRows[0]?.relevance ?? 0;
    if (topRel >= MEMORY_VECTOR_THRESHOLD) {
      memoryResults = vecRows;
      deps.logger.info({ topRel, count: vecRows.length }, 'Memory vector search hit');
    } else {
      // Fallback: ILIKE (also fixed to use id not bot_id)
      const { rows: ilikeRows } = await pool.query(
        `SELECT id, type, subject, subject_normalized, confidence, polarity, hit_count,
                LEFT(content, 300) AS snippet, last_hit_at
           FROM memories WHERE invalidated_at IS NULL
            AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1)
            AND (content ILIKE '%' || $2 || '%' OR subject ILIKE '%' || $2 || '%')
          ORDER BY hit_count DESC, confidence DESC LIMIT 8`,
        [deps.config.name, Array.from(searchQuery).slice(0, 50).join('')],
      );
      memoryResults = ilikeRows || [];
      deps.logger.info({ topRel, count: memoryResults.length, fallback: 'ilike' }, 'Memory search fell back to ILIKE');
    }
  } catch (err: any) {
    deps.logger.debug({ err: err?.message }, 'Memories search skipped');
  }

  // v1 RAG §4.2: Re-rank by recency + hit_count + confidence
  // score = 0.5*cosine + 0.2*recency + 0.2*hit_count + 0.1*confidence
  let ranked = results;
  try {
    if (results.length > 0) {
      // 取每条的 metadata/hit_count/confidence (从 documents 或 memories)
      const ids = results.map(r => r.id);
      const { rows: metaRows } = await pool.query(
        `SELECT id, hit_count, confidence, updated_at, polarity FROM memories
          WHERE id = ANY($1) AND invalidated_at IS NULL`,
        [ids]
      ).catch(() => ({ rows: [] }));
      const metaMap = new Map(metaRows.map((r: any) => [r.id, r]));

      const HALF_LIFE_DAYS = 30;
      const now = Date.now();
      ranked = results
        .map(r => {
          const meta: any = metaMap.get(r.id);
          const cosine = 1 - (r.score || 0); // memory API: lower score = better
          const recency = meta?.updated_at
            ? Math.exp(-((now - new Date(meta.updated_at).getTime()) / 86400000) * Math.LN2 / HALF_LIFE_DAYS)
            : 0.5;
          const hitCount = Math.min(1, (meta?.hit_count || 0) / 10); // normalize
          const confidence = meta?.confidence ?? 0.5;
          const finalScore = 0.5*cosine + 0.2*recency + 0.2*hitCount + 0.1*confidence;
          return { r, finalScore, meta };
        })
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5)
        .map(x => x.r);

      // Bump hit_count only for docs actually injected into context (top 3)
      // M1-fix 2026-06-20: was UPDATE memories (wrong table) — IDs are document UUIDs not memory UUIDs.
      // Changed to UPDATE documents, plus added last_hit_at writeback.
      if ((metaRows as any[]).length > 0) {
        const injectedIds = ranked.slice(0, 3).map(r => r.id);
        if (injectedIds.length > 0) {
          await pool.query(
            `UPDATE documents SET hit_count = COALESCE(hit_count, 0) + 1, last_hit_at = NOW()
              WHERE id = ANY($1)`,
            [injectedIds]
          ).catch((err: any) => deps.logger.debug({ err: err.message }, 'hit_count bump failed'));
        }
      }

      deps.logger.info(
        { chatId, resultCount: ranked.length, topScore: ranked.length > 0 ? (1 - (ranked[0].score || 0)) : 0 },
        'Knowledge re-ranked (v1)',
      );
    }
  } catch (err: any) {
    deps.logger.warn({ err: err?.message }, 'Re-rank failed, using raw results');
  }
  const finalResults = ranked;
  // Avoid naming conflict: replace `results` with `finalResults` below


  // P2.3: Search bot's own conversation history for cross-session recall
  let conversationContext = '';
  if (deps.workspaceManager) {
    try {
      const knowledgeFolderId = await deps.workspaceManager.getBotKnowledgeFolderId(deps.config.name);
      if (knowledgeFolderId) {
        const convResults = await deps.memoryClient.searchInFolders(searchQuery, [knowledgeFolderId], 10);
      // v1: re-rank by hit_count + recency
      const convRanked = [...convResults]
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))  // memory API: lower score = better match
        .slice(0, 5);

        const convItems = (convRanked || [])
          .filter((r: any) => {
            const tags = r.tags || [];
            return tags.some((t: string) => t === 'conversation-memory' || t === 'auto-archive');
          })
          .slice(0, 3);
        if (convItems.length > 0) {
          const convFormatted = convItems
            .map((r: any, i: number) => {
              const snippet = (r.snippet || '').replace(/<[^>]*>/g, '');
              const updated = r.updated_at ? r.updated_at.slice(0, 10) : '';
              return `### ${i + 1}. ${r.title}\n> 对话时间: ${updated}\n> ${snippet.slice(0, 200)}`;
            })
            .join('\n\n');
          conversationContext = `\n\n## 历史对话参考\n\n以下是你最近的对话记录，可帮助理解上下文连续性：\n\n${convFormatted}\n\n> 根据对话时效性，优先参考最近7天内的记录。\n`;
        }
      }
    } catch (err: any) {
      deps.logger.debug({ err: err?.message }, 'Conversation memory recall skipped');
    }
  }

  if (!finalResults || finalResults.length === 0) {
    if (conversationContext) {
      return { systemPromptOverride, knowledgeContext: conversationContext, agentBoundSkills };
    }
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  // v22.3: render by type
  const prefDec = (memoryResults || []).filter((r: any) => ['preference','decision'].includes(r.type));
  const factsEv = (memoryResults || []).filter((r: any) => ['fact','event'].includes(r.type));
  const docParts: string[] = [];
  if (prefDec.length > 0) docParts.push('### 偏好与决策\n' + prefDec.map((r: any) => `- [${r.type}] ${r.subject} (${(r.confidence*100).toFixed(0)}%)\n  > ${(r.snippet||r.content||'').slice(0,150)}`).join('\n'));
  if (factsEv.length > 0) docParts.push('### 事实与事件\n' + factsEv.map((r: any) => `- [${r.type}] ${r.subject}`).join('\n'));
  const docs = finalResults.slice(0,3).map((r,i) => `### ${i+1}. ${r.title}\n${(r.snippet||'').replace(/<[^>]*>/g,'')}`).join('\n\n');
  if (docs) docParts.push('### 工作区文档\n' + docs);
  const formatted = docParts.join('\n\n');
  const knowledgeContext = `## 相关知识参考\n\n以下是从知识库中检索到的相关资料，请参考这些信息回答用户问题：\n\n${formatted}${conversationContext}`;
  deps.logger.info(
    { chatId, folderCount: knowledgeFolders.length, resultCount: finalResults.length },
    'Knowledge injection applied',
  );
  return { systemPromptOverride, knowledgeContext, agentBoundSkills };
}
