import { pool } from './index.js';

export interface BudgetRow {
  botName: string;
  dailyLimitUsd: number;
  todaySpent: number;
  todayTasks: number;
  paused: boolean;
  lastRollover: string;
}

export interface BudgetHistoryRow {
  botName: string;
  date: string;
  costUsd: number;
  taskCount: number;
}

export class BudgetStore {
  async get(botName: string): Promise<BudgetRow | null> {
    const r = await pool.query('SELECT * FROM bot_budgets WHERE bot_name = $1', [botName]);
    if (r.rows.length === 0) return null;
    return this.mapRow(r.rows[0]);
  }

  async upsert(row: BudgetRow): Promise<void> {
    await pool.query(
      `INSERT INTO bot_budgets (bot_name, daily_limit_usd, today_spent, today_tasks, paused, last_rollover, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (bot_name) DO UPDATE SET
         daily_limit_usd = $2, today_spent = $3, today_tasks = $4, paused = $5, last_rollover = $6, updated_at = now()`,
      [row.botName, row.dailyLimitUsd, row.todaySpent, row.todayTasks, row.paused, row.lastRollover],
    );
  }

  async list(): Promise<BudgetRow[]> {
    const r = await pool.query('SELECT * FROM bot_budgets ORDER BY bot_name');
    return r.rows.map(this.mapRow);
  }

  async addHistory(row: BudgetHistoryRow): Promise<void> {
    await pool.query(
      `INSERT INTO budget_history (bot_name, date, cost_usd, task_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_name, date) DO UPDATE SET cost_usd = $3, task_count = $4`,
      [row.botName, row.date, row.costUsd, row.taskCount],
    );
  }

  async getHistory(botName: string, since?: string): Promise<BudgetHistoryRow[]> {
    const r = await pool.query(
      since
        ? 'SELECT * FROM budget_history WHERE bot_name = $1 AND date >= $2 ORDER BY date'
        : 'SELECT * FROM budget_history WHERE bot_name = $1 ORDER BY date',
      since ? [botName, since] : [botName],
    );
    return r.rows.map((r: any) => ({
      botName: r.bot_name,
      date: r.date.toISOString().split('T')[0],
      costUsd: Number(r.cost_usd),
      taskCount: r.task_count,
    }));
  }

  async seedFromJson(data: any): Promise<number> {
    let count = 0;
    for (const b of data.budgets || []) {
      await this.upsert({
        botName: b.botName,
        dailyLimitUsd: b.dailyLimitUsd ?? 0,
        todaySpent: b.todaySpent ?? 0,
        todayTasks: b.todayTasks ?? 0,
        paused: b.paused ?? false,
        lastRollover: new Date().toISOString().split('T')[0],
      });
      for (const h of b.history || []) {
        await this.addHistory({ botName: b.botName, date: h.date, costUsd: h.costUsd, taskCount: h.taskCount });
      }
      count++;
    }
    return count;
  }

  private mapRow(r: any): BudgetRow {
    return {
      botName: r.bot_name,
      dailyLimitUsd: Number(r.daily_limit_usd),
      todaySpent: Number(r.today_spent),
      todayTasks: r.today_tasks,
      paused: r.paused,
      lastRollover: r.last_rollover?.toISOString?.()?.split('T')[0] || r.last_rollover,
    };
  }
}
