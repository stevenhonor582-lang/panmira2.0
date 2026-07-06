/**
 * Tests for SDK HookRegistry.
 *
 * Covers:
 *  - registerDefaults populates the 18 core lifecycle hooks
 *  - register() adds custom callbacks and count()/all reflect them
 *  - all returns the SDK Options.hooks shape (HookCallbackMatcher[])
 *  - Default callback writes task_metrics INSERT on fire
 *  - Default callback swallows errors (non-blocking contract)
 *
 * Mock pattern: vi.hoisted + vi.mock('../../db/index.js') +
 *               vi.mock('../../utils/logger.js')
 *
 * Note on hoisting: vi.mock factories run before any import / const in the
 * file is initialized. We use vi.hoisted() so the query spy is created
 * during the hoist pass and is therefore visible inside the factory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

vi.mock('../../db/index.js', () => ({
  pool: {
    query: queryMock,
    on: vi.fn(),
  },
  db: {},
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

import { HookRegistry } from '../hook-registry.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  // recordMetricSafe() short-circuits without DATABASE_URL.
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/panmira_test';
});

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});

describe('HookRegistry', () => {
  it('registerDefaults registers 18+ core lifecycle hooks', () => {
    // Arrange
    const registry = new HookRegistry();

    // Act
    registry.registerDefaults();

    // Assert — every event in DEFAULT_HOOK_EVENTS (18) gets ≥1 callback.
    // Verify a representative sample across lifecycle categories.
    expect(registry.count('TaskCreated')).toBeGreaterThanOrEqual(1);
    expect(registry.count('SessionStart')).toBeGreaterThanOrEqual(1);
    expect(registry.count('SessionEnd')).toBeGreaterThanOrEqual(1);
    expect(registry.count('PreToolUse')).toBeGreaterThanOrEqual(1);
    expect(registry.count('PostToolUse')).toBeGreaterThanOrEqual(1);
    expect(registry.count('Stop')).toBeGreaterThanOrEqual(1);
    expect(registry.count('PreCompact')).toBeGreaterThanOrEqual(1);
    expect(registry.count('PermissionRequest')).toBeGreaterThanOrEqual(1);

    // Total callbacks across the 18 default events ≥ 18.
    const defaultEvents = [
      'TaskCreated', 'TaskCompleted', 'TeammateIdle',
      'SessionStart', 'SessionEnd',
      'SubagentStart', 'SubagentStop',
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
      'PermissionRequest', 'PermissionDenied',
      'PreCompact', 'PostCompact',
      'UserPromptSubmit',
      'Stop', 'StopFailure',
      'ConfigChange',
    ] as const;
    const total = defaultEvents.reduce((sum, ev) => sum + registry.count(ev), 0);
    expect(total).toBeGreaterThanOrEqual(18);
  });

  it('register adds a custom callback reflected in count() and all', () => {
    // Arrange
    const registry = new HookRegistry();
    const cb = vi.fn().mockResolvedValue(undefined);

    // Act
    registry.register('Stop', cb);

    // Assert
    expect(registry.count('Stop')).toBe(1);
    const hooks = registry.all;
    expect(hooks.Stop).toBeDefined();
    expect(hooks.Stop!.length).toBe(1);
    // The matcher wraps our callback inside { hooks: [...] }.
    expect(hooks.Stop![0]).toHaveProperty('hooks');
    expect(hooks.Stop![0].hooks!.length).toBe(1);
  });

  it('all returns SDK Options.hooks shape (Partial<Record<HookEvent, HookCallbackMatcher[]>>)', () => {
    // Arrange
    const registry = new HookRegistry();
    registry.register('PreToolUse', vi.fn().mockResolvedValue(undefined));
    registry.register('PostToolUse', vi.fn().mockResolvedValue(undefined));

    // Act
    const hooks = registry.all;

    // Assert — runtime shape matches the SDK Options.hooks contract:
    //   Partial<Record<HookEvent, HookCallbackMatcher[]>>
    expect(hooks).toBeTypeOf('object');
    expect(Array.isArray(hooks.PreToolUse)).toBe(true);
    expect(Array.isArray(hooks.PostToolUse)).toBe(true);
    // Unregistered events are absent (partial record).
    expect(hooks.Stop).toBeUndefined();
    // Each entry is an array of matchers with a `hooks` field.
    const matcher = hooks.PreToolUse![0];
    expect(matcher).toHaveProperty('hooks');
    expect(Array.isArray(matcher.hooks)).toBe(true);
    expect(typeof matcher.hooks![0]).toBe('function');
  });

  it('default callback writes a task_metrics INSERT via pool.query', async () => {
    // Arrange — registerDefaults() wires a default callback for TaskCreated.
    const registry = new HookRegistry();
    registry.registerDefaults();

    // Extract the wrapped callback by reading registry.all (the SDK
    // entrypoint) so we exercise the real wrapCallback() adapter too.
    const hooks = registry.all;
    const sdkCallback = hooks.TaskCreated![0].hooks![0];

    // Act — invoke the SDK-shaped callback with a synthetic HookInput.
    await sdkCallback(
      {
        session_id: 'sess-123',
        cwd: '/workspace',
        agent_id: 'agent-1',
        agent_type: 'main',
        tool_name: 'Read',
      } as never,
      'tool-use-1',
      { signal: new AbortController().signal } as never,
    );

    // Assert — exactly one INSERT into task_metrics with hook_fired label.
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO task_metrics/);
    expect(params[0]).toBe('hook_fired');
    expect(params[1]).toBe(1);
    const tags = JSON.parse(params[2]);
    expect(tags.hook_event).toBe('TaskCreated');
    expect(tags.session_id).toBe('sess-123');
    expect(tags.tool_use_id).toBe('tool-use-1');
    expect(tags.tool_name).toBe('Read');
  });

  it('default callback downgrades DB errors to warn and does not throw', async () => {
    // Arrange — pool.query rejects; default callback must catch + warn, not
    // propagate (non-blocking contract from hook-registry.ts header).
    queryMock.mockRejectedValueOnce(new Error('connection refused'));
    const registry = new HookRegistry();
    registry.registerDefaults();
    const sdkCallback = registry.all.SessionStart![0].hooks![0];

    // Act — must NOT await-and-reject; wrap in resolves to assert settled.
    const resultPromise = sdkCallback(
      { session_id: 'sess-err' } as never,
      undefined,
      { signal: new AbortController().signal } as never,
    );
    await expect(resultPromise).resolves.not.toThrow();

    // Assert — query was attempted, error swallowed (no propagation).
    expect(queryMock).toHaveBeenCalledTimes(1);
    // The wrapCallback adapter normalizes void return → { continue: true }.
    const result = await resultPromise;
    expect(result).toEqual({ continue: true });
  });
});
