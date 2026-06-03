/**
 * Group Session Manager — tracks conversation history for multi-bot group chats.
 * In-memory store; can be migrated to Redis later for persistence.
 */
import type { Logger } from '../utils/logger.js';

export interface SessionMessage {
  botName: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface GroupSession {
  groupId: string;
  messages: SessionMessage[];
  createdAt: number;
  lastActivity: number;
}

export class GroupSessionManager {
  private sessions = new Map<string, GroupSession>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getSession(groupId: string): GroupSession {
    let session = this.sessions.get(groupId);
    if (!session) {
      session = { groupId, messages: [], createdAt: Date.now(), lastActivity: Date.now() };
      this.sessions.set(groupId, session);
      this.logger.info({ groupId }, 'GroupSession: created');
    }
    return session;
  }

  addMessage(groupId: string, botName: string, role: 'user' | 'assistant' | 'system', content: string): void {
    const session = this.getSession(groupId);
    session.messages.push({ botName, role, content, timestamp: Date.now() });
    session.lastActivity = Date.now();
    // Keep last 200 messages per session
    if (session.messages.length > 200) {
      session.messages = session.messages.slice(-200);
    }
  }

  getHistory(groupId: string, limit = 50): SessionMessage[] {
    const session = this.sessions.get(groupId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  /** Build a context summary for specialists to understand the group conversation so far. */
  getContext(groupId: string, maxChars = 3000): string {
    const history = this.getHistory(groupId, 30);
    if (history.length === 0) return '';

    const lines = history.map(
      (m) => `[${m.role}] ${m.botName}: ${m.content.slice(0, 200)}`,
    );
    let context = lines.join('\n');

    if (context.length > maxChars) {
      context = context.slice(-maxChars);
    }

    return `## Group Chat History\n${context}`;
  }

  /** Clean up sessions inactive for longer than maxAgeMs. */
  cleanup(maxAgeMs = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}
