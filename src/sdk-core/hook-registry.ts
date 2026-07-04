/**
 * SDK Hook Registry
 *
 * Central registration point for all 28 SDK hook events. Each hook writes
 * a structured log entry and a `task_metrics` row (metric_name='hook_fired')
 * so observability is uniform across panmira 2.0.
 *
 * Replaces panmira 1.0's scattered PreToolUse hooks (5 different files).
 *
 * Design:
 * - Open-Closed: register() adds callbacks without touching existing code.
 * - Non-blocking: every default callback catches its own errors so a hook
 *   failure can never break the main query() flow.
 * - Typed: SDK HookEvent union used everywhere; no stringly-typed keys.
 *
 * @module sdk-core/hook-registry
 */

import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import { pool } from '../db/index.js';
import { createLogger, type Logger } from '../utils/logger.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/hook-registry' });

/**
 * All 28 SDK hook events. Mirrors SDK HookEvent union; kept as a const tuple
 * so registerDefaults() can iterate without losing type narrowing.
 */
const ALL_HOOK_EVENTS = [
  // Task lifecycle
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  // Session
  'SessionStart',
  'SessionEnd',
  // Subagent
  'SubagentStart',
  'SubagentStop',
  // Tool
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  // Permission
  'PermissionRequest',
  'PermissionDenied',
  // Compaction
  'PreCompact',
  'PostCompact',
  // User input
  'UserPromptSubmit',
  'UserPromptExpansion',
  // Stop
  'Stop',
  'StopFailure',
  // Config & setup
  'ConfigChange',
  'Setup',
  'InstructionsLoaded',
  // Elicitation
  'Elicitation',
  'ElicitationResult',
  // Notification
  'Notification',
  // Worktree & fs
  'WorktreeCreate',
  'WorktreeRemove',
  'CwdChanged',
  'FileChanged',
] as const satisfies readonly HookEvent[];

/**
 * Hook events that get the default panmira 2.0 callback (the full lifecycle
 * set we explicitly care about). Other events remain registered but silent
 * — call register() to override or add behavior.
 */
const DEFAULT_HOOK_EVENTS: readonly HookEvent[] = [
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'Stop',
  'StopFailure',
  'ConfigChange',
];

// === Types ===

/**
 * Panmira-local hook callback signature. Mirrors SDK HookCallback but
 * tolerates `void` return (treated as "no-op, continue") so default
 * callbacks can simply not return.
 */
export type PanmiraHookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
) => Promise<HookJSONOutput | void>;

/**
 * Tags attached to each task_metrics row. Keeps the JSONB column queryable
 * (task_id / hook_event / tool_name / session_id).
 */
export interface HookMetricTags {
  readonly hook_event: HookEvent;
  readonly session_id?: string;
  readonly tool_use_id?: string;
  readonly agent_id?: string;
  readonly agent_type?: string;
  readonly cwd?: string;
  readonly tool_name?: string;
  readonly [key: string]: unknown;
}

// === Hook Registry ===

/**
 * Central registry for SDK hook callbacks.
 *
 * Usage:
 * ```ts
 * const registry = new HookRegistry();
 * registry.registerDefaults();           // panmira 2.0 standard callbacks
 * registry.register('PreToolUse', myCustom);  // override or add
 * // later, pass to query():
 * query({ options: { hooks: registry.all } });
 * ```
 */
export class HookRegistry {
  private readonly callbacks = new Map<HookEvent, PanmiraHookCallback[]>();

  /**
   * Register a callback for a specific hook event.
   * Multiple callbacks per event are supported; they fire in registration order.
   */
  register(event: HookEvent, callback: PanmiraHookCallback): void {
    const list = this.callbacks.get(event) ?? [];
    list.push(callback);
    this.callbacks.set(event, list);
    LOG.debug({ hook_event: event }, 'Hook callback registered');
  }

  /**
   * All registered hooks in the SDK Options.hooks format.
   * Each event maps to one matcher with no `matcher` filter (matches all).
   */
  get all(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const out: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
    for (const [event, callbacks] of this.callbacks) {
      if (callbacks.length === 0) continue;
      out[event] = [
        {
          hooks: callbacks.map(wrapCallback),
        },
      ];
    }
    return out;
  }

  /**
   * Number of callbacks currently registered for an event.
   * Useful for tests and startup diagnostics.
   */
  count(event: HookEvent): number {
    return this.callbacks.get(event)?.length ?? 0;
  }

  /**
   * Register default panmira 2.0 callbacks for the core lifecycle hooks.
   * Each default callback: logs structured info + writes task_metrics row.
   * Safe to call multiple times (idempotent guard).
   */
  registerDefaults(): void {
    if (this.callbacks.size > 0) {
      LOG.debug('Defaults already registered, skipping');
      return;
    }
    for (const event of DEFAULT_HOOK_EVENTS) {
      this.register(event, makeDefaultCallback(event));
    }
    LOG.info(
      { count: DEFAULT_HOOK_EVENTS.length },
      'Default hook callbacks registered',
    );
  }
}

// === Private helpers ===

/**
 * Adapt a PanmiraHookCallback to the SDK HookCallback shape.
 * `void` return is normalized to `{ continue: true }` so the SDK sees a
 * well-formed SyncHookJSONOutput.
 */
function wrapCallback(cb: PanmiraHookCallback): HookCallback {
  return async (input, toolUseID, opts) => {
    const result = await cb(input, toolUseID);
    return result ?? ({ continue: true } as HookJSONOutput);
    // opts.signal intentionally unused — default callbacks are fast.
    void opts;
  };
}

/**
 * Build the standard callback for a hook event. Logs structured info and
 * writes a task_metrics row. All errors are caught and downgraded to warn
 * so observability code can never block the main flow.
 */
function makeDefaultCallback(event: HookEvent): PanmiraHookCallback {
  return async (input, toolUseID) => {
    const tags = extractTags(event, input, toolUseID);
    LOG.info(tags, `hook:${event}`);
    await recordMetricSafe(event, tags).catch((err: unknown) => {
      LOG.warn({ hook_event: event, err: stringifyErr(err) }, 'metric write failed');
    });
  };
}

/** Extract queryable tags from a hook input without assuming its variant. */
function extractTags(
  event: HookEvent,
  input: HookInput,
  toolUseID: string | undefined,
): HookMetricTags {
  const base = input as Partial<{
    session_id: string;
    cwd: string;
    agent_id: string;
    agent_type: string;
    tool_name: string;
  }>;
  const tags: HookMetricTags = {
    hook_event: event,
    session_id: base.session_id,
    cwd: base.cwd,
    agent_id: base.agent_id,
    agent_type: base.agent_type,
    tool_use_id: toolUseID,
    ...(base.tool_name ? { tool_name: base.tool_name } : {}),
  };
  return tags;
}

/** INSERT a hook_fired row. Swallows errors (table may not exist yet in dev). */
async function recordMetricSafe(
  event: HookEvent,
  tags: HookMetricTags,
): Promise<void> {
  if (!process.env.DATABASE_URL) return; // skip when DB not configured
  await pool.query(
    `INSERT INTO task_metrics (metric_name, metric_value, tags)
     VALUES ($1, $2, $3)`,
    ['hook_fired', 1, JSON.stringify(tags)],
  );
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
