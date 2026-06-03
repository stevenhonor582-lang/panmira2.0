import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Logger } from '../../utils/logger.js';
import type { EngineName } from '../types.js';
import type { ChatSessionStore } from '../../db/chat-session-store.js';

export interface UserSession {
  sessionId: string | undefined;
  sessionIdEngine?: EngineName;
  workingDirectory: string;
  lastUsed: number;
  cumulativeTokens: number;
  cumulativeCostUsd: number;
  cumulativeDurationMs: number;
  model?: string;
  modelEngine?: EngineName;
  engine?: EngineName;
  pendingSummary?: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 10_000;

export class SessionManager {
  private sessions = new Map<string, UserSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;
  private botName: string;
  private dbStore: ChatSessionStore | undefined;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private defaultWorkingDirectory: string,
    private logger: Logger,
    botName: string = 'default',
    dbStore?: ChatSessionStore,
  ) {
    this.botName = botName;
    this.dbStore = dbStore;

    if (dbStore) {
      this.loadFromDB();
    } else {
      this.loadFromDisk();
    }

    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
    if (dbStore) {
      this.flushTimer = setInterval(() => this.flushToDB(), 30_000);
    }
  }

  getSession(chatId: string): UserSession {
    let session = this.sessions.get(chatId);
    if (!session) {
      if (this.sessions.size >= MAX_SESSIONS) {
        this.evictOldest();
      }
      session = {
        sessionId: undefined,
        workingDirectory: this.defaultWorkingDirectory,
        lastUsed: Date.now(),
        cumulativeTokens: 0,
        cumulativeCostUsd: 0,
        cumulativeDurationMs: 0,
      };
      this.sessions.set(chatId, session);
    } else {
      // Always use the latest defaultWorkingDirectory from DB config
      session.workingDirectory = this.defaultWorkingDirectory;
    }
    session.lastUsed = Date.now();
    return session;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, s] of this.sessions) {
      if (s.lastUsed < oldestTime) {
        oldestTime = s.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.sessions.delete(oldestKey);
    }
  }

  setSessionId(chatId: string, sessionId: string, engine?: EngineName): void {
    const session = this.getSession(chatId);
    session.sessionId = sessionId;
    session.sessionIdEngine = engine;
    this.markDirty();
  }

  setSessionModel(chatId: string, model: string | undefined, engine?: EngineName): void {
    const session = this.getSession(chatId);
    session.model = model;
    session.modelEngine = model ? engine : undefined;
    this.markDirty();
  }

  setSessionEngine(chatId: string, engine: EngineName | undefined): void {
    const session = this.getSession(chatId);
    if (session.engine === engine) return;
    session.engine = engine;
    session.sessionId = undefined;
    session.sessionIdEngine = undefined;
    session.model = undefined;
    session.modelEngine = undefined;
    this.markDirty();
  }

  addUsage(chatId: string, tokens: number, costUsd: number, durationMs: number): void {
    const session = this.getSession(chatId);
    session.cumulativeTokens += tokens;
    session.cumulativeCostUsd += costUsd;
    session.cumulativeDurationMs += durationMs;
    this.markDirty();
  }

  resetSession(chatId: string, summary?: string): void {
    const session = this.sessions.get(chatId);
    if (session) {
      session.sessionId = undefined;
      session.sessionIdEngine = undefined;
      session.cumulativeTokens = 0;
      session.cumulativeCostUsd = 0;
      session.cumulativeDurationMs = 0;
      if (summary) { session.pendingSummary = summary; }
      this.markDirty();
    }
  }

  consumePendingSummary(chatId: string): string | undefined {
    const session = this.sessions.get(chatId);
    if (!session?.pendingSummary) return undefined;
    const summary = session.pendingSummary;
    session.pendingSummary = undefined;
    this.markDirty();
    return summary;
  }

  markDirty(): void {
    this.dirty = true;
    if (!this.dbStore) {
      this.saveToDisk();
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let changed = false;
    for (const [chatId, session] of this.sessions) {
      if (now - session.lastUsed > SESSION_TTL_MS) {
        this.sessions.delete(chatId);
        changed = true;
      }
    }
    if (changed) {
      if (this.dbStore) {
        this.dbStore.deleteExpired(this.botName, SESSION_TTL_MS).catch(() => {});
      } else {
        this.saveToDisk();
      }
    }
  }

  private async loadFromDB(): Promise<void> {
    if (!this.dbStore) return;
    try {
      const rows = await this.dbStore.listByBot(this.botName);
      const now = Date.now();
      let loaded = 0;
      for (const r of rows) {
        if (now - r.lastUsed > SESSION_TTL_MS) continue;
        this.sessions.set(r.chatId, {
          sessionId: r.sessionId ?? undefined,
          sessionIdEngine: (r.sessionIdEngine as EngineName) ?? undefined,
          workingDirectory: this.defaultWorkingDirectory,
          lastUsed: r.lastUsed,
          cumulativeTokens: r.cumulativeTokens,
          cumulativeCostUsd: Number(r.cumulativeCostUsd),
          cumulativeDurationMs: r.cumulativeDurationMs,
          model: r.model ?? undefined,
          modelEngine: (r.modelEngine as EngineName) ?? undefined,
          engine: (r.engine as EngineName) ?? undefined,
        });
        loaded++;
      }
      if (loaded > 0) {
        this.logger.info({ loaded }, 'Restored sessions from DB');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load sessions from DB, starting fresh');
    }
  }

  private async flushToDB(): Promise<void> {
    if (!this.dirty || !this.dbStore) return;
    this.dirty = false;
    try {
      for (const [chatId, session] of this.sessions) {
        if (session.sessionId || session.model || session.engine) {
          await this.dbStore.upsert({
            botName: this.botName,
            chatId,
            sessionId: session.sessionId ?? null,
            sessionIdEngine: session.sessionIdEngine ?? null,
            workingDirectory: session.workingDirectory,
            lastUsed: session.lastUsed,
            cumulativeTokens: session.cumulativeTokens,
            cumulativeCostUsd: session.cumulativeCostUsd,
            cumulativeDurationMs: session.cumulativeDurationMs,
            model: session.model ?? null,
            modelEngine: session.modelEngine ?? null,
            engine: session.engine ?? null,
          });
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to flush sessions to DB');
      this.dirty = true;
    }
  }

  private persistPath(): string {
    const dataDir = process.env.SESSION_STORE_DIR || path.join(os.homedir(), '.metabot');
    fs.mkdirSync(dataDir, { recursive: true });
    return path.join(dataDir, `sessions-${this.botName}.json`);
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, any> = {};
      for (const [chatId, session] of this.sessions) {
        if (session.sessionId || session.model || session.engine) {
          data[chatId] = {
            sessionId: session.sessionId || '',
            sessionIdEngine: session.sessionIdEngine,
            workingDirectory: session.workingDirectory,
            lastUsed: session.lastUsed,
            cumulativeTokens: session.cumulativeTokens,
            cumulativeCostUsd: session.cumulativeCostUsd,
            cumulativeDurationMs: session.cumulativeDurationMs,
            model: session.model,
            modelEngine: session.modelEngine,
            engine: session.engine,
            ...(session.pendingSummary ? { pendingSummary: session.pendingSummary } : {}),
          };
        }
      }
      fs.writeFileSync(this.persistPath(), JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to persist sessions to disk');
    }
  }

  private loadFromDisk(): void {
    try {
      const p = this.persistPath();
      if (!fs.existsSync(p)) return;
      const raw = fs.readFileSync(p, 'utf-8');
      const data: Record<string, any> = JSON.parse(raw);
      const now = Date.now();
      let loaded = 0;
      for (const [chatId, s] of Object.entries(data)) {
        if (now - s.lastUsed > SESSION_TTL_MS) continue;
        this.sessions.set(chatId, {
          sessionId: s.sessionId || undefined,
          sessionIdEngine: s.sessionIdEngine,
          workingDirectory: this.defaultWorkingDirectory,
          lastUsed: s.lastUsed,
          cumulativeTokens: s.cumulativeTokens ?? 0,
          cumulativeCostUsd: s.cumulativeCostUsd ?? 0,
          cumulativeDurationMs: s.cumulativeDurationMs ?? 0,
          model: s.model,
          modelEngine: s.modelEngine,
          engine: s.engine,
          pendingSummary: s.pendingSummary,
        });
        loaded++;
      }
      if (loaded > 0) {
        this.logger.info({ loaded, path: p }, 'Restored sessions from disk');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load sessions from disk, starting fresh');
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.dbStore) {
      this.flushToDB().catch(() => {});
    } else {
      this.saveToDisk();
    }
  }
}
