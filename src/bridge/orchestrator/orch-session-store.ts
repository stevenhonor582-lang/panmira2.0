/**
 * Persists active orchestration sessions to disk so a user can
 * "回到主线" (resume) a long-running plan that was interrupted
 * (process restart, network drop, user wandered off to fix a bug).
 *
 * Distinct from `task-state-store`:
 *   - task-state-store: auto-recovery of crashed in-flight tasks
 *   - orch-session-store: user-initiated resume of named plans
 *
 * Files: ~/.panmira/orch-sessions/<sessionId>.json
 * TTL: 7 days (swept on read).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Logger } from '../../utils/logger.js';
import type {
  OrchestrationProgress,
  ExecutionPlan,
  GateResult,
  PendingTask,
} from './types.js';

export interface PersistedOrchSession {
  sessionId: string;
  chatId: string;
  botName: string;
  intentName: string;
  userMessage: string;
  plan: ExecutionPlan;
  progress: OrchestrationProgress;
  allGateResults: GateResult[];
  totalCostUsd: number;
  pendingTasks: PendingTask[];
  cwd: string;
  outputsDir: string;
  cardMessageId: string;
  knowledgeContext?: string;
  startTime: number;
  lastUpdated: number;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function dir(): string {
  return path.join(os.homedir(), '.panmira', 'orch-sessions');
}

function filePath(sessionId: string): string {
  // Sanitize sessionId in case it ever contains path-unsafe chars
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(dir(), `${safe}.json`);
}

/** Best-effort write. Never throws (so a write failure doesn't break the main flow). */
export function saveOrchSession(session: PersistedOrchSession, logger?: Logger): void {
  try {
    const p = filePath(session.sessionId);
    const d = dir();
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ ...session, lastUpdated: Date.now() }, null, 2), 'utf-8');
  } catch (err: any) {
    logger?.warn?.({ err, sessionId: session.sessionId }, 'orch-session-store: save failed');
  }
}

export function loadOrchSession(sessionId: string, logger?: Logger): PersistedOrchSession | null {
  try {
    const p = filePath(sessionId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    const session = JSON.parse(raw) as PersistedOrchSession;

    // Sweep stale sessions on read
    if (Date.now() - session.lastUpdated > TTL_MS) {
      deleteOrchSession(sessionId);
      return null;
    }
    return session;
  } catch (err: any) {
    logger?.warn?.({ err, sessionId }, 'orch-session-store: load failed');
    return null;
  }
}

export function deleteOrchSession(sessionId: string, logger?: Logger): void {
  try {
    const p = filePath(sessionId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err: any) {
    logger?.warn?.({ err, sessionId }, 'orch-session-store: delete failed');
  }
}
