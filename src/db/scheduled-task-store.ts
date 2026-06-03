import { pool } from './index.js';

export interface ScheduledTaskRow {
  id: string;
  botName: string;
  chatId: string;
  prompt: string;
  executeAt: number;
  status: string;
  parentRecurringId: string | null;
  createdAt: number;
}

export interface RecurringTaskRow {
  id: string;
  botName: string;
  chatId: string;
  prompt: string;
  cronExpr: string;
  timezone: string;
  status: string;
  nextExecuteAt: number;
  createdAt: number;
}

export class ScheduledTaskStore {
  // Scheduled tasks
  async createTask(row: Omit<ScheduledTaskRow, 'id'>): Promise<string> {
    const r = await pool.query(
      `INSERT INTO scheduled_tasks (bot_name, chat_id, prompt, execute_at, status, parent_recurring_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [row.botName, row.chatId, row.prompt, row.executeAt, row.status, row.parentRecurringId, row.createdAt],
    );
    return r.rows[0].id;
  }

  async updateTaskStatus(id: string, status: string): Promise<void> {
    await pool.query('UPDATE scheduled_tasks SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
  }

  async getPendingTasks(): Promise<ScheduledTaskRow[]> {
    const r = await pool.query("SELECT * FROM scheduled_tasks WHERE status = 'pending' ORDER BY execute_at");
    return r.rows.map(this.mapTask);
  }

  async getTasksByBot(botName: string): Promise<ScheduledTaskRow[]> {
    const r = await pool.query('SELECT * FROM scheduled_tasks WHERE bot_name = $1 ORDER BY execute_at DESC', [botName]);
    return r.rows.map(this.mapTask);
  }

  async deleteTask(id: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM scheduled_tasks WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  // Recurring tasks
  async createRecurring(row: Omit<RecurringTaskRow, 'id'>): Promise<string> {
    const r = await pool.query(
      `INSERT INTO recurring_tasks (bot_name, chat_id, prompt, cron_expr, timezone, status, next_execute_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [row.botName, row.chatId, row.prompt, row.cronExpr, row.timezone, row.status, row.nextExecuteAt, row.createdAt],
    );
    return r.rows[0].id;
  }

  async updateRecurringNext(id: string, nextExecuteAt: number): Promise<void> {
    await pool.query('UPDATE recurring_tasks SET next_execute_at = $1, updated_at = now() WHERE id = $2', [nextExecuteAt, id]);
  }

  async updateRecurringStatus(id: string, status: string): Promise<void> {
    await pool.query('UPDATE recurring_tasks SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
  }

  async getActiveRecurring(): Promise<RecurringTaskRow[]> {
    const r = await pool.query("SELECT * FROM recurring_tasks WHERE status = 'active' ORDER BY next_execute_at");
    return r.rows.map(this.mapRecurring);
  }

  async getRecurringByBot(botName: string): Promise<RecurringTaskRow[]> {
    const r = await pool.query('SELECT * FROM recurring_tasks WHERE bot_name = $1 ORDER BY created_at DESC', [botName]);
    return r.rows.map(this.mapRecurring);
  }

  async deleteRecurring(id: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM recurring_tasks WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async seedFromJson(data: any): Promise<{ tasks: number; recurring: number }> {
    let tasks = 0;
    let recurring = 0;
    for (const t of data.scheduledTasks || []) {
      try {
        await this.createTask({
          botName: t.botName, chatId: t.chatId, prompt: t.prompt,
          executeAt: t.executeAt, status: t.status || 'pending',
          parentRecurringId: t.parentRecurringId || null, createdAt: t.createdAt || Date.now(),
        });
        tasks++;
      } catch {}
    }
    for (const r of data.recurringTasks || []) {
      try {
        await this.createRecurring({
          botName: r.botName, chatId: r.chatId, prompt: r.prompt,
          cronExpr: r.cronExpr, timezone: r.timezone || 'Asia/Shanghai',
          status: r.status || 'active', nextExecuteAt: r.nextExecuteAt, createdAt: r.createdAt || Date.now(),
        });
        recurring++;
      } catch {}
    }
    return { tasks, recurring };
  }

  private mapTask(r: any): ScheduledTaskRow {
    return {
      id: r.id, botName: r.bot_name, chatId: r.chat_id, prompt: r.prompt,
      executeAt: Number(r.execute_at), status: r.status,
      parentRecurringId: r.parent_recurring_id, createdAt: Number(r.created_at),
    };
  }

  private mapRecurring(r: any): RecurringTaskRow {
    return {
      id: r.id, botName: r.bot_name, chatId: r.chat_id, prompt: r.prompt,
      cronExpr: r.cron_expr, timezone: r.timezone, status: r.status,
      nextExecuteAt: Number(r.next_execute_at), createdAt: Number(r.created_at),
    };
  }
}
