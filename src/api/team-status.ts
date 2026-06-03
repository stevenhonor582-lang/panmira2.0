import type { BotRegistry, BotInfo } from './bot-registry.js';
import { getAgents, type AgentMetadata } from './agent-scanner.js';
import { pool } from '../db/index.js';

export interface BotStatus extends BotInfo {
  status: 'idle' | 'busy' | 'error';
  currentTask?: {
    chatId: string;
    startTime: number;
    durationMs: number;
  };
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  };
  agents?: AgentMetadata[];
}

export interface TeamStatus {
  bots: BotStatus[];
  summary: {
    totalBots: number;
    busyBots: number;
    idleBots: number;
    totalCostUsd: number;
    totalTasks: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  };
}

/** Aggregate stats from activity_events table (survives restarts). */
async function getDbStats(): Promise<Record<string, BotStatus['stats']>> {
  try {
    const { rows } = await pool.query(`
      SELECT
        bot_name,
        count(*) as "totalTasks",
        count(*) FILTER (WHERE type = 'task_completed') as "completedTasks",
        count(*) FILTER (WHERE type = 'task_failed') as "failedTasks",
        COALESCE(sum(cost_usd), 0) as "totalCostUsd",
        COALESCE(sum(input_tokens), 0) as "totalInputTokens",
        COALESCE(sum(output_tokens), 0) as "totalOutputTokens",
        COALESCE(sum(cache_read_tokens), 0) as "totalCacheReadTokens",
        COALESCE(sum(cache_creation_tokens), 0) as "totalCacheCreationTokens"
      FROM activity_events
      GROUP BY bot_name
    `);
    const result: Record<string, BotStatus['stats']> = {};
    for (const row of rows) {
      result[row.bot_name] = {
        totalTasks: Number(row.totalTasks),
        completedTasks: Number(row.completedTasks),
        failedTasks: Number(row.failedTasks),
        totalCostUsd: Number(row.totalCostUsd),
        totalInputTokens: Number(row.totalInputTokens),
        totalOutputTokens: Number(row.totalOutputTokens),
        totalCacheReadTokens: Number(row.totalCacheReadTokens),
        totalCacheCreationTokens: Number(row.totalCacheCreationTokens),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Aggregate bot status from the registry, running tasks, and cost tracker.
 */
export async function getTeamStatus(registry: BotRegistry): Promise<TeamStatus> {
  const bots: BotStatus[] = [];
  const registeredBots = registry.list();
  const dbStats = await getDbStats();

  for (const botInfo of registeredBots) {
    const bot = registry.get(botInfo.name);
    const bridge = bot?.bridge;

    let currentTask: BotStatus['currentTask'] | undefined;
    let status: BotStatus['status'] = 'idle';

    const runningTasksInfo = bridge?.getRunningTasksInfo();
    if (runningTasksInfo && runningTasksInfo.length > 0) {
      status = 'busy';
      const first = runningTasksInfo[0];
      currentTask = {
        chatId: first.chatId,
        startTime: first.startTime,
        durationMs: Date.now() - first.startTime,
      };
    }

    const persistedStats = dbStats[botInfo.name];

    const stats: BotStatus['stats'] = persistedStats ?? {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    };

    const agents = await getAgents(botInfo.workingDirectory);

    bots.push({
      ...botInfo,
      status,
      currentTask,
      stats,
      ...(agents.length > 0 ? { agents } : {}),
    });
  }

  const summary = {
    totalBots: bots.length,
    busyBots: bots.filter((b) => b.status === 'busy').length,
    idleBots: bots.filter((b) => b.status === 'idle').length,
    totalCostUsd: bots.reduce((sum, b) => sum + b.stats.totalCostUsd, 0),
    totalTasks: bots.reduce((sum, b) => sum + b.stats.totalTasks, 0),
    totalInputTokens: bots.reduce((sum, b) => sum + b.stats.totalInputTokens, 0),
    totalOutputTokens: bots.reduce((sum, b) => sum + b.stats.totalOutputTokens, 0),
    totalCacheReadTokens: bots.reduce((sum, b) => sum + b.stats.totalCacheReadTokens, 0),
    totalCacheCreationTokens: bots.reduce((sum, b) => sum + b.stats.totalCacheCreationTokens, 0),
  };

  return { bots, summary };
}
