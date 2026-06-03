/**
 * In-memory cost aggregation tracker. Collects per-bot and per-user
 * cost/usage stats from audit events. Stats reset on process restart.
 */

export interface UsageRecord {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCostUsd: number;
  totalDurationMs: number;
  lastTaskAt: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

export interface CostStats {
  byBot: Record<string, UsageRecord>;
  byUser: Record<string, UsageRecord>;
  global: UsageRecord;
}

function emptyRecord(): UsageRecord {
  return {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    lastTaskAt: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
  };
}

export class CostTracker {
  private byBot = new Map<string, UsageRecord>();
  private byUser = new Map<string, UsageRecord>();
  private global: UsageRecord = emptyRecord();

  record(opts: {
    botName: string;
    userId: string;
    success: boolean;
    costUsd?: number;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }): void {
    const { botName, userId, success, costUsd = 0, durationMs = 0, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0 } = opts;
    const now = Date.now();

    const update = (rec: UsageRecord) => {
      rec.totalTasks++;
      if (success) rec.completedTasks++;
      else rec.failedTasks++;
      rec.totalCostUsd += costUsd;
      rec.totalDurationMs += durationMs;
      rec.totalInputTokens += inputTokens;
      rec.totalOutputTokens += outputTokens;
      rec.totalCacheReadTokens += cacheReadTokens;
      rec.totalCacheCreationTokens += cacheCreationTokens;
      rec.lastTaskAt = now;
    };

    if (!this.byBot.has(botName)) this.byBot.set(botName, emptyRecord());
    update(this.byBot.get(botName)!);

    if (!this.byUser.has(userId)) this.byUser.set(userId, emptyRecord());
    update(this.byUser.get(userId)!);

    update(this.global);
  }

  getStats(): CostStats {
    return {
      byBot: Object.fromEntries(this.byBot),
      byUser: Object.fromEntries(this.byUser),
      global: { ...this.global },
    };
  }

  reset(): void {
    this.byBot.clear();
    this.byUser.clear();
    this.global = emptyRecord();
  }
}
