import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import { MemoryClient } from '../memory/memory-client.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import { pool } from '../db/index.js';

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
    const contPat = /^(继续|检查|排查|修一下|怎么样|好了吗|完成了吗|接着|看看|查一下|测一下|试一下|好的|ok|嗯|哦|知道了|收到|明白|懂了|对|可以|行|好|谢谢|再见)\b/i;
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
  if (knowledgeFolders.length > 0) {
    try {
      const nameResults = await pool.query(
        `SELECT f.id FROM folders f
         WHERE f.name = ANY($1)
           AND (f.path LIKE '数字员工/' || $2 || '%' OR f.path LIKE '组织公共区/%')`,
        [knowledgeFolders, deps.config.name],
      );
      for (const row of nameResults.rows) {
        if (!folderUuids.includes(row.id)) folderUuids.push(row.id);
      }
    } catch {}
  }
  if (folderUuids.length === 0) folderUuids = knowledgeFolders;

  const results = await deps.memoryClient.searchInFolders(searchQuery, folderUuids, 5);

  // P2.3: Search bot's own conversation history for cross-session recall
  let conversationContext = '';
  if (deps.workspaceManager) {
    try {
      const knowledgeFolderId = await deps.workspaceManager.getBotKnowledgeFolderId(deps.config.name);
      if (knowledgeFolderId) {
        const convResults = await deps.memoryClient.searchInFolders(searchQuery, [knowledgeFolderId], 3);
        const convItems = (convResults || [])
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

  if (!results || results.length === 0) {
    if (conversationContext) {
      return { systemPromptOverride, knowledgeContext: conversationContext, agentBoundSkills };
    }
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  const formatted = results
    .slice(0, 5)
    .map((r, i) => {
      const snippet = (r.snippet || '').replace(/<[^>]*>/g, '');
      const scoreTag = r.score ? ` (相关度: ${Math.round((1 - r.score) * 100)}%)` : '';
      return `### ${i + 1}. ${r.title}${scoreTag}\n${snippet}`;
    })
    .join('\n\n');

  const knowledgeContext = `## 相关知识参考\n\n以下是从知识库中检索到的相关资料，请参考这些信息回答用户问题：\n\n${formatted}${conversationContext}`;
  deps.logger.info(
    { chatId, folderCount: knowledgeFolders.length, resultCount: results.length },
    'Knowledge injection applied',
  );
  return { systemPromptOverride, knowledgeContext, agentBoundSkills };
}
