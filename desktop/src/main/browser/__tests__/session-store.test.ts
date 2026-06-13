import { describe, it, expect } from 'vitest';
import { SessionStore } from '../session-store.js';

describe('SessionStore', () => {
  it('create returns a unique sessionId', () => {
    const store = new SessionStore();
    const a = store.create('t1', { profileDir: '/tmp/p1' });
    const b = store.create('t1', { profileDir: '/tmp/p2' });
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('get retrieves an existing session', () => {
    const store = new SessionStore();
    const s = store.create('t1', { profileDir: '/tmp/p' });
    const fetched = store.get(s.sessionId);
    expect(fetched?.taskId).toBe('t1');
  });

  it('remove deletes a session', () => {
    const store = new SessionStore();
    const s = store.create('t1', { profileDir: '/tmp/p' });
    store.remove(s.sessionId);
    expect(store.get(s.sessionId)).toBeUndefined();
  });

  it('listByTask returns all sessions for a task', () => {
    const store = new SessionStore();
    store.create('t1', { profileDir: '/tmp/a' });
    store.create('t1', { profileDir: '/tmp/b' });
    store.create('t2', { profileDir: '/tmp/c' });
    expect(store.listByTask('t1')).toHaveLength(2);
    expect(store.listByTask('t2')).toHaveLength(1);
  });
});
