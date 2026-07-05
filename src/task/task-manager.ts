/**
 * Task Manager
 *
 * CRUD + state machine for tasks table.
 * 7 states: active / paused / closed / deleted / failed_recovery
 *
 * @module task/task-manager
 */

import { pool } from "../db/index.js";
import { createLogger, type Logger } from "../utils/logger.js";

const LOG: Logger = createLogger("info").child({ module: "task/task-manager" });

export type TaskStatus = "active" | "paused" | "closed" | "deleted" | "failed_recovery";

export interface Task {
  readonly id: string;
  readonly chatId: string;
  readonly botName: string;
  readonly sdkSessionId: string | null;
  readonly title: string | null;
  readonly status: TaskStatus;
  readonly lastActivityAt: Date;
}

interface TaskRow {
  id: string;
  chat_id: string;
  bot_name: string;
  sdk_session_id: string | null;
  title: string | null;
  status: string;
  last_activity_at: Date;
}

export class TaskManager {
  /**
   * Create a new active task. Pauses any existing active task in the same chat.
   */
  async createTask(opts: {
    chatId: string;
    botName: string;
    initialPrompt: string;
    sdkSessionId?: string;
    title?: string;
  }): Promise<Task> {
    await pool.query(
      "UPDATE tasks SET status = 'paused', paused_at = NOW() WHERE chat_id = $1 AND status = 'active'",
      [opts.chatId],
    );

    const { rows } = await pool.query(
      "INSERT INTO tasks (chat_id, bot_name, initial_prompt, sdk_session_id, title, status) VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *",
      [opts.chatId, opts.botName, opts.initialPrompt, opts.sdkSessionId ?? null, opts.title ?? null],
    );

    LOG.info({ taskId: rows[0].id, chatId: opts.chatId, botName: opts.botName }, "Task created");
    return this.rowToTask(rows[0]);
  }

  /**
   * List active + paused + failed_recovery tasks for a chat.
   */
  async listOpenTasks(chatId: string): Promise<Task[]> {
    const { rows } = await pool.query(
      "SELECT * FROM tasks WHERE chat_id = $1 AND status IN ('active', 'paused', 'failed_recovery') ORDER BY last_activity_at DESC",
      [chatId],
    );
    return rows.map((r: any) => this.rowToTask(r));
  }

  /**
   * Switch to a paused task (pauses current active).
   */
  async switchTask(taskId: string, chatId: string): Promise<Task> {
    await pool.query("UPDATE tasks SET status = 'paused', paused_at = NOW() WHERE chat_id = $1 AND status = 'active'", [chatId]);
    const { rows } = await pool.query(
      "UPDATE tasks SET status = 'active', paused_at = NULL, last_activity_at = NOW() WHERE id = $1 AND chat_id = $2 RETURNING *",
      [taskId, chatId],
    );
    if (!rows[0]) throw new Error(`Task ${taskId} not found`);
    LOG.info({ taskId, chatId }, "Task switched");
    return this.rowToTask(rows[0]);
  }

  /**
   * Force stop active task → paused.
   */
  async forceStop(chatId: string): Promise<void> {
    await pool.query("UPDATE tasks SET status = 'paused', paused_at = NOW() WHERE chat_id = $1 AND status = 'active'", [chatId]);
    LOG.info({ chatId }, "Task force stopped");
  }

  /**
   * Delete task (soft delete).
   */
  async deleteTask(taskId: string): Promise<void> {
    await pool.query("UPDATE tasks SET status = 'deleted', deleted_at = NOW() WHERE id = $1", [taskId]);
    LOG.info({ taskId }, "Task deleted");
  }

  /**
   * Mark task as closed (natural completion).
   */
  async closeTask(taskId: string, reason?: string): Promise<void> {
    await pool.query(
      "UPDATE tasks SET status = 'closed', closed_at = NOW(), close_reason = $2 WHERE id = $1",
      [taskId, reason ?? 'natural'],
    );
    LOG.info({ taskId, reason }, "Task closed");
  }

  /**
   * Update task activity (call after each turn).
   */
  async touchActivity(taskId: string, tokens?: number): Promise<void> {
    if (tokens) {
      await pool.query(
        "UPDATE tasks SET last_activity_at = NOW(), turn_count = turn_count + 1, cumulative_tokens = cumulative_tokens + $2 WHERE id = $1",
        [taskId, tokens],
      );
    } else {
      await pool.query("UPDATE tasks SET last_activity_at = NOW() WHERE id = $1", [taskId]);
    }
  }

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      chatId: row.chat_id,
      botName: row.bot_name,
      sdkSessionId: row.sdk_session_id,
      title: row.title,
      status: row.status as TaskStatus,
      lastActivityAt: row.last_activity_at,
    };
  }
}
