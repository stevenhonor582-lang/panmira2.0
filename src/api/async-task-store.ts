import * as crypto from 'node:crypto';
import { pool } from '../db/index.js';

export interface AsyncTask {
  id: string;
  botName: string;
  chatId: string;
  prompt: string;
  status: 'accepted' | 'running' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  result?: {
    success: boolean;
    responseText: string;
    costUsd?: number;
    durationMs?: number;
    error?: string;
  };
  callbackChatId?: string;
  callbackBotName?: string;
}

export class AsyncTaskStore {
  private tasks = new Map<string, AsyncTask>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private initialized = false;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 3600_000;
      for (const [id, task] of this.tasks) {
        if (task.completedAt && task.completedAt < cutoff) {
          this.tasks.delete(id);
          pool.query('DELETE FROM async_tasks WHERE id = $1', [id]).catch(() => {});
        }
      }
      pool
        .query('DELETE FROM async_tasks WHERE completed_at IS NOT NULL AND completed_at < $1', [cutoff])
        .catch(() => {});
    }, 300_000);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const { rows } = await pool.query("SELECT * FROM async_tasks WHERE status IN ('accepted', 'running')");
      for (const r of rows) {
        this.tasks.set(r.id, {
          id: r.id,
          botName: r.bot_name,
          chatId: r.chat_id,
          prompt: r.prompt,
          status: r.status as AsyncTask['status'],
          createdAt: Number(r.created_at),
          completedAt: r.completed_at ? Number(r.completed_at) : undefined,
          result: r.result || undefined,
          callbackChatId: r.callback_chat_id || undefined,
          callbackBotName: r.callback_bot_name || undefined,
        });
      }
    } catch {
      /* table may not exist yet during migration */
    }
  }

  create(opts: {
    botName: string;
    chatId: string;
    prompt: string;
    callbackChatId?: string;
    callbackBotName?: string;
  }): AsyncTask {
    const task: AsyncTask = {
      id: crypto.randomUUID().slice(0, 8),
      botName: opts.botName,
      chatId: opts.chatId,
      prompt: opts.prompt,
      status: 'accepted',
      createdAt: Date.now(),
      callbackChatId: opts.callbackChatId,
      callbackBotName: opts.callbackBotName,
    };
    this.tasks.set(task.id, task);
    pool
      .query(
        `INSERT INTO async_tasks (id, bot_name, chat_id, prompt, status, created_at, callback_chat_id, callback_bot_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          task.id,
          task.botName,
          task.chatId,
          task.prompt,
          task.status,
          task.createdAt,
          task.callbackChatId || null,
          task.callbackBotName || null,
        ],
      )
      .catch(() => {});
    return task;
  }

  get(id: string): AsyncTask | undefined {
    return this.tasks.get(id);
  }

  update(id: string, updates: Partial<AsyncTask>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      pool
        .query(`UPDATE async_tasks SET status = $1, completed_at = $2, result = $3 WHERE id = $4`, [
          task.status,
          task.completedAt || null,
          task.result ? JSON.stringify(task.result) : null,
          id,
        ])
        .catch(() => {});
    }
  }

  list(): AsyncTask[] {
    return Array.from(this.tasks.values());
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
