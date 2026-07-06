/**
 * CanUseTool Decider
 *
 * Centralized per-tool-call permission decision for panmira 2.0.
 * Replaces panmira 1.0's scattered 5 PreToolUse hooks
 * (denyAskUserQuestionHook / allowPlanModeHook / bashGuardHook /
 * fsGuardHook x 2).
 *
 * SDK Contract: PermissionResult supports only 'allow' | 'deny'. There
 * is no 'ask' behavior. 'ask' semantics (user can override) are
 * approximated by 'deny' with a descriptive message; the bridge/UI
 * may surface this to the user. For sensitive tools we deliberately
 * choose 'deny' as the safe default until an explicit allow-rule lands.
 *
 * @module sdk-core/can-use-tool
 */

import type {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger, type Logger } from '../utils/logger.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/can-use-tool' });

// === Default Permission Sets (panmira 2.0) ===

/**
 * Tools physically disabled by v2.1 decision.
 * AskUserQuestion: user prefers plain-text Q&A (locked in commit 00813b38).
 */
const DEFAULT_DENIED_TOOLS: ReadonlySet<string> = Object.freeze(
  new Set<string>(['AskUserQuestion']),
);

/**
 * Sensitive tools - denied by default, require explicit user override.
 * Bash: command-injection risk. Write/Edit: filesystem-mutation risk.
 */
const DEFAULT_SENSITIVE_TOOLS: ReadonlySet<string> = Object.freeze(
  new Set<string>(['Bash', 'Write', 'Edit', 'NotebookEdit']),
);

/**
 * Always-allowed safe inspection / planning tools.
 */
const DEFAULT_ALLOWED_TOOLS: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    'Read',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'TodoWrite',
    'Task',
    'Skill',
  ]),
);

// === Types ===

/** Per-bot permission policy. Inject one instance per BotRegistry entry. */
export interface BotPermissions {
  /** Tools always allowed (whitelist). */
  readonly allowedTools: ReadonlySet<string>;
  /** Tools always denied (blacklist). Highest precedence. */
  readonly deniedTools: ReadonlySet<string>;
  /** Tools requiring user confirmation - denied-by-default in current SDK. */
  readonly sensitiveTools: ReadonlySet<string>;
}

/** Options for constructing a decider with optional policy override. */
export interface CanUseToolDeciderOptions {
  /** Override default permission sets. Defaults to panmira 2.0 policy. */
  readonly permissions?: Partial<BotPermissions>;
}

// === Decision Result Builders ===

function allow(): PermissionResult {
  return { behavior: 'allow' } as PermissionResult;
}

function deny(message: string): PermissionResult {
  return { behavior: 'deny', message } as PermissionResult;
}

function denySensitive(
  toolName: string,
  suggestions: PermissionUpdate[] | undefined,
): PermissionResult {
  if (suggestions && suggestions.length > 0) {
    // SDK has no 'ask'; we still deny, but log suggestions so the bridge
    // can render an 'always allow' affordance based on decisionReason.
    LOG.debug({ tool_name: toolName, suggestionCount: suggestions.length }, 'Sensitive deny');
  }
  return deny(`Tool ${toolName} is sensitive - confirm before use`);
}

function logDecision(
  toolName: string,
  toolUseId: string,
  level: 'info' | 'debug',
  message: string,
): void {
  LOG[level]({ tool_name: toolName, tool_use_id: toolUseId }, message);
}

// === Decider ===

/**
 * Resolves per-tool-call permission from a BotPermissions policy.
 *
 * Usage (in QueryRunner):
 *   const decider = new CanUseToolDecider();
 *   queryOptions.canUseTool = decider.decide;
 *
 * Decision order (early return):
 *  1. deniedTools     -> deny  ('Tool explicitly forbidden')
 *  2. sensitiveTools  -> deny  ('requires user confirmation')
 *  3. allowedTools    -> allow
 *  4. default         -> deny  ('Tool not in whitelist') - safe default
 */
export class CanUseToolDecider {
  private readonly permissions: BotPermissions;

  constructor(opts: CanUseToolDeciderOptions = {}) {
    this.permissions = {
      allowedTools: opts.permissions?.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      deniedTools: opts.permissions?.deniedTools ?? DEFAULT_DENIED_TOOLS,
      sensitiveTools: opts.permissions?.sensitiveTools ?? DEFAULT_SENSITIVE_TOOLS,
    };
  }

  /**
   * SDK CanUseTool callback. Bound arrow function preserves instance binding
   * so it can be passed directly to query({ options: { canUseTool } }).
   */
  decide: CanUseTool = async (
    toolName: string,
    _input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      decisionReason?: string;
      toolUseID: string;
    },
  ): Promise<PermissionResult> => {
    const id = options.toolUseID;
    if (options.signal?.aborted) return deny('Aborted before permission check');

    if (this.permissions.deniedTools.has(toolName)) {
      logDecision(toolName, id, 'info', 'Tool denied (forbidden)');
      return deny(`Tool ${toolName} is disabled by panmira policy`);
    }
    if (this.permissions.sensitiveTools.has(toolName)) {
      logDecision(toolName, id, 'info', 'Sensitive tool - deny pending user override');
      return denySensitive(toolName, options.suggestions);
    }
    if (this.permissions.allowedTools.has(toolName)) {
      logDecision(toolName, id, 'debug', 'Tool allowed');
      return allow();
    }
    logDecision(toolName, id, 'info', 'Tool not in whitelist - deny (safe default)');
    return deny(`Tool ${toolName} is not in the bot whitelist`);
  };

  /** Read-only view of current policy - for diagnostics / BotRegistry. */
  getPolicy(): Readonly<BotPermissions> {
    return this.permissions;
  }
}
