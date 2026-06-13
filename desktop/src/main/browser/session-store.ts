export type SessionId = string;

export interface SessionContext {
  profileDir: string;
  launchedAt?: number;
}

export interface Session extends SessionContext {
  sessionId: SessionId;
  taskId: string;
}

export class SessionStore {
  private sessions = new Map<SessionId, Session>();
  private counter = 0;

  create(taskId: string, ctx: SessionContext): Session {
    const sessionId = `s${++this.counter}-${Date.now()}`;
    const session: Session = { sessionId, taskId, ...ctx };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: SessionId): Session | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: SessionId): void {
    this.sessions.delete(sessionId);
  }

  listByTask(taskId: string): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.taskId === taskId);
  }
}
