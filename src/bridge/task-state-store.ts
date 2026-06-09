/**
 * Persists active task state to disk so that after a restart,
 * orphaned tasks can be detected and their chat users notified.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Logger } from '../utils/logger.js';
import { buildTaskRecoveryCard } from '../feishu/card-builder.js';

export interface PersistedTask {
  chatId: string;
  botName: string;
  userId?: string;
  startTime: number;
  prompt: string;
  cardMessageId: string;
  /** What the bot had produced so far before interruption */
  lastResponsePreview?: string;
  /** Why the task was stopped. 'restart' | 'crash' | 'timeout' | 'oom' | 'unknown'.
   *  When unset the recovery card uses a neutral default. */
  interruptionReason?: string;
}

const FILENAME = 'active-tasks.json';

function filePath(botName?: string): string {
  const base = path.join(os.homedir(), '.panmira');
  return botName
    ? path.join(base, `active-tasks-${botName}.json`)
    : path.join(base, FILENAME);
}

export function saveActiveTasks(tasks: PersistedTask[], botName?: string): void {
  try {
    const p = filePath(botName);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch {
    // Best-effort — never block shutdown
  }
}

export function loadActiveTasks(botName?: string): PersistedTask[] {
  try {
    const p = filePath(botName);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as PersistedTask[];
  } catch {
    return [];
  }
}

export function clearActiveTasks(botName?: string): void {
  try {
    const p = filePath(botName);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // Best-effort
  }
}

/** Remove tasks older than maxAgeMs (default 2 hours) — they're too stale to notify about. */
export function pruneStaleTasks(tasks: PersistedTask[], maxAgeMs = 2 * 60 * 60 * 1000): PersistedTask[] {
  const cutoff = Date.now() - maxAgeMs;
  return tasks.filter((t) => t.startTime > cutoff);
}

/**
 * On startup, read orphaned tasks and send recovery notifications.
 * Returns the number of chats notified.
 */
export async function recoverAndNotify(
  botName: string,
  sender: { sendTextNotice(chatId: string, title: string, content: string, color?: string): Promise<void> },
  logger: Logger,
): Promise<number> {
  const tasks = pruneStaleTasks(loadActiveTasks(botName));
  if (tasks.length === 0) {
    clearActiveTasks(botName);
    return 0;
  }

  logger.info({ count: tasks.length, botName }, 'Found orphaned tasks from previous restart, notifying chats');

  let notified = 0;
  for (const task of tasks) {
    try {
      const elapsed = Math.round((Date.now() - task.startTime) / 60000);
      const promptPreview = task.prompt.length > 120 ? task.prompt.slice(0, 120) + '...' : task.prompt;
      const responsePreview = task.lastResponsePreview
        ? task.lastResponsePreview.length > 200
          ? task.lastResponsePreview.slice(0, 200) + '...'
          : task.lastResponsePreview
        : null;
      const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}h${elapsed % 60}m` : `${elapsed}min`;
      // Use a proper card with buttons instead of text-only notice
      const cardJson = buildTaskRecoveryCard({
        originalPrompt: task.prompt,
        elapsed: elapsedStr,
        responsePreview: responsePreview || undefined,
        botName,
        reason: task.interruptionReason,
      });
      try {
        const snd = sender as any;
        if (snd.sendRawCard) await snd.sendRawCard(task.chatId, cardJson);
        else await sender.sendTextNotice(task.chatId, '⏠ 任务中断', `上次任务因重启中断（已运行 ${elapsedStr}）。\n需求: ${promptPreview}\n\n重新发送即可继续。`, 'orange');
      } catch {
        logger.warn({ chatId: task.chatId }, 'Failed to send recovery card');
      }
      notified++;
    } catch (err: any) {
      logger.warn({ chatId: task.chatId, err: err?.message }, 'Failed to send recovery notification');
    }
  }

  clearActiveTasks(botName);
  return notified;
}
