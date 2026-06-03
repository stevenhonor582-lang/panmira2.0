/**
 * MemoryWriter — auto-extract and store conversation insights after task completion.
 * Saves a structured summary to the bot's knowledge folder in MetaMemory.
 */

import type { MemoryClient } from '../memory/memory-client.js';
import type { Logger } from '../utils/logger.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';

const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes per chat
const MAX_CACHE_SIZE = 100;

export class MemoryWriter {
  private folderCache = new Map<string, string>();
  private lastRecordTime = new Map<string, number>();
  private workspaceManager?: WorkspaceManager;

  constructor(
    private memoryClient: MemoryClient,
    private logger: Logger,
  ) {}

  setWorkspaceManager(wm: WorkspaceManager): void {
    this.workspaceManager = wm;
  }

  /**
   * Extract and store a conversation summary after task completion.
   * Fire-and-forget: errors are logged but never throw.
   */
  async record(
    botName: string,
    userMessage: string,
    assistantResponse: string,
    metadata: { chatId: string; chatType?: string; userId?: string; durationMs?: number; costUsd?: number },
  ): Promise<void> {
    try {
      // Rate limit: 1 record per chat per 10 minutes
      const now = Date.now();
      const lastTime = this.lastRecordTime.get(metadata.chatId);
      if (lastTime && now - lastTime < RATE_LIMIT_MS) return;
      this.lastRecordTime.set(metadata.chatId, now);

      const title = this.buildTitle(userMessage);
      const content = this.buildContent(userMessage, assistantResponse, metadata);
      const tags = ['conversation-memory', botName, metadata.chatId];

      if (this.workspaceManager) {
        if (metadata.chatType === 'group') {
          await this.workspaceManager.createGroupDoc(metadata.chatId, 'knowledge', title, content, tags);
        } else {
          await this.workspaceManager.createBotDoc(botName, 'knowledge', title, content, tags);
        }
      } else {
        const folderId = await this.ensureFolder(`数字员工/${botName}/知识沉淀`);
        if (!folderId) return;

        await this.memoryClient.createDocument({
          title,
          content,
          folder_id: folderId,
          tags,
          created_by: botName,
        });
      }

      this.logger.debug({ botName, chatId: metadata.chatId }, 'Conversation memory recorded');
    } catch (err: any) {
      this.logger.warn({ err: err?.message, botName }, 'Failed to record conversation memory');
    }
  }

  private buildTitle(userMessage: string): string {
    const clean = userMessage.replace(/\n/g, ' ').trim();
    return clean.length > 60 ? clean.slice(0, 57) + '...' : clean;
  }

  private buildContent(
    userMessage: string,
    assistantResponse: string,
    metadata: { chatId: string; userId?: string; durationMs?: number; costUsd?: number },
  ): string {
    const ts = new Date().toISOString();
    const lines = [`# 对话记录 ${ts}`, '', `**用户**: ${userMessage.slice(0, 500)}`, ''];

    if (metadata.userId) lines.push(`**用户ID**: ${metadata.userId}`);
    if (metadata.durationMs) lines.push(`**耗时**: ${(metadata.durationMs / 1000).toFixed(1)}s`);
    if (metadata.costUsd) lines.push(`**费用**: $${metadata.costUsd.toFixed(4)}`);

    lines.push('');
    lines.push('**助手回复**:');
    lines.push(assistantResponse.slice(0, 2000));

    return lines.join('\n');
  }

  private async ensureFolder(path: string): Promise<string | null> {
    const cached = this.folderCache.get(path);
    if (cached) return cached;

    const parts = path.split('/');
    let parentId = 'root';
    for (const part of parts) {
      const id = await this.memoryClient.ensureFolder(part, parentId);
      if (!id) return null;
      parentId = id;
    }

    // LRU eviction
    if (this.folderCache.size >= MAX_CACHE_SIZE) {
      const oldest = this.folderCache.keys().next().value;
      if (oldest) this.folderCache.delete(oldest);
    }

    this.folderCache.set(path, parentId);
    return parentId;
  }
}
