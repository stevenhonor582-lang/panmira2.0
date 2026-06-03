import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Logger } from '../utils/logger.js';
import type { BudgetStore } from '../db/budget-store.js';

interface BudgetRecord {
  date: string;
  costUsd: number;
  taskCount: number;
}

interface BotBudget {
  botName: string;
  dailyLimitUsd: number;
  todaySpent: number;
  todayTasks: number;
  history: BudgetRecord[];
  paused: boolean;
}

export class BudgetManager {
  private budgets = new Map<string, BotBudget>();
  private logger: Logger;
  private dataPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dbStore: BudgetStore | undefined;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | undefined;

  constructor(logger: Logger, dbStore?: BudgetStore) {
    this.logger = logger.child({ module: 'budget' });
    this.dbStore = dbStore;
    this.dataPath = path.join(os.homedir(), '.panmira', 'budgets.json');

    if (dbStore) {
      this.loadFromDB();
      this.flushTimer = setInterval(() => this.flushToDB(), 30_000);
    } else {
      this.load();
    }
  }

  setLimit(botName: string, dailyLimitUsd: number): void {
    const budget = this.getOrCreate(botName);
    budget.dailyLimitUsd = dailyLimitUsd;
    this.markDirty();
  }

  canAcceptTask(botName: string): { allowed: boolean; reason?: string } {
    const budget = this.budgets.get(botName);
    if (!budget || budget.dailyLimitUsd <= 0) return { allowed: true };
    if (budget.paused) return { allowed: false, reason: 'Bot paused due to budget override' };

    this.rolloverIfNeeded(budget);

    if (budget.todaySpent >= budget.dailyLimitUsd) {
      return { allowed: false, reason: `Daily budget exhausted: $${budget.todaySpent.toFixed(2)} / $${budget.dailyLimitUsd.toFixed(2)}` };
    }
    if (budget.todaySpent >= budget.dailyLimitUsd * 0.8) {
      this.logger.warn({ botName, spent: budget.todaySpent, limit: budget.dailyLimitUsd }, 'Budget 80% threshold');
    }
    return { allowed: true };
  }

  recordCost(botName: string, costUsd: number): void {
    const budget = this.getOrCreate(botName);
    this.rolloverIfNeeded(budget);
    budget.todaySpent += costUsd;
    budget.todayTasks++;
    this.markDirty();
  }

  pauseBot(botName: string): void {
    const budget = this.getOrCreate(botName);
    budget.paused = true;
    this.markDirty();
  }

  resumeBot(botName: string): void {
    const budget = this.getOrCreate(botName);
    budget.paused = false;
    this.markDirty();
  }

  getStatus(botName: string): { spent: number; limit: number; tasks: number; paused: boolean } | null {
    const budget = this.budgets.get(botName);
    if (!budget) return null;
    this.rolloverIfNeeded(budget);
    return {
      spent: budget.todaySpent,
      limit: budget.dailyLimitUsd,
      tasks: budget.todayTasks,
      paused: budget.paused,
    };
  }

  getReport(period: 'daily' | 'weekly' | 'monthly' = 'daily'): Record<string, { spent: number; tasks: number; limit: number }> {
    const report: Record<string, { spent: number; tasks: number; limit: number }> = {};
    const now = new Date();

    for (const [name, budget] of this.budgets) {
      this.rolloverIfNeeded(budget);
      let spent = budget.todaySpent;
      let tasks = budget.todayTasks;

      if (period !== 'daily' && budget.history.length > 0) {
        const days = period === 'weekly' ? 7 : 30;
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        for (const record of budget.history) {
          if (record.date >= cutoffStr) {
            spent += record.costUsd;
            tasks += record.taskCount;
          }
        }
      }

      report[name] = { spent, tasks, limit: budget.dailyLimitUsd };
    }
    return report;
  }

  getAllBudgets(): BotBudget[] {
    return Array.from(this.budgets.values());
  }

  private getOrCreate(botName: string): BotBudget {
    let budget = this.budgets.get(botName);
    if (!budget) {
      budget = {
        botName,
        dailyLimitUsd: 0,
        todaySpent: 0,
        todayTasks: 0,
        history: [],
        paused: false,
      };
      this.budgets.set(botName, budget);
    }
    return budget;
  }

  private rolloverIfNeeded(budget: BotBudget): void {
    const today = new Date().toISOString().split('T')[0];
    if (budget.history.length > 0) {
      const lastDate = budget.history[budget.history.length - 1]?.date;
      if (lastDate === today) return;
    }

    if (budget.todaySpent > 0 || budget.todayTasks > 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const histEntry = {
        date: yesterday.toISOString().split('T')[0],
        costUsd: budget.todaySpent,
        taskCount: budget.todayTasks,
      };
      budget.history.push(histEntry);
      if (this.dbStore) {
        this.dbStore.addHistory({ botName: budget.botName, ...histEntry }).catch(() => {});
      }
      if (budget.history.length > 90) {
        budget.history = budget.history.slice(-90);
      }
    }

    budget.todaySpent = 0;
    budget.todayTasks = 0;
  }

  private markDirty(): void {
    this.dirty = true;
    if (!this.dbStore) {
      this.scheduleSave();
    }
  }

  private async loadFromDB(): Promise<void> {
    if (!this.dbStore) return;
    try {
      const rows = await this.dbStore.list();
      for (const r of rows) {
        const history = await this.dbStore.getHistory(r.botName);
        this.budgets.set(r.botName, {
          botName: r.botName,
          dailyLimitUsd: r.dailyLimitUsd,
          todaySpent: r.todaySpent,
          todayTasks: r.todayTasks,
          paused: r.paused,
          history,
        });
      }
      if (this.budgets.size > 0) {
        this.logger.info({ count: this.budgets.size }, 'Budgets loaded from DB');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load budgets from DB');
    }
  }

  private async flushToDB(): Promise<void> {
    if (!this.dirty || !this.dbStore) return;
    this.dirty = false;
    try {
      for (const budget of this.budgets.values()) {
        await this.dbStore.upsert({
          botName: budget.botName,
          dailyLimitUsd: budget.dailyLimitUsd,
          todaySpent: budget.todaySpent,
          todayTasks: budget.todayTasks,
          paused: budget.paused,
          lastRollover: new Date().toISOString().split('T')[0],
        });
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to flush budgets to DB');
      this.dirty = true;
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        for (const b of data.budgets || []) {
          this.budgets.set(b.botName, b);
        }
        this.logger.info({ count: this.budgets.size }, 'Budgets loaded');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load budgets');
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 2000);
  }

  private save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataPath, JSON.stringify({ budgets: Array.from(this.budgets.values()) }, null, 2));
    } catch (err) {
      this.logger.warn({ err }, 'Failed to save budgets');
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    if (this.dbStore) {
      this.flushToDB().catch(() => {});
    } else {
      this.save();
    }
  }
}
