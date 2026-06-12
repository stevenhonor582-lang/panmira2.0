import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage, SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type { BotConfigBase, UserRole } from '../../config.js';
import { ROLE_TOOLS, createBashGuardHook, createFSGuardHook } from '../../auth/role-permissions.js';
import type { Logger } from '../../utils/logger.js';
import { AsyncQueue } from '../../utils/async-queue.js';
import { ContextLayer, ContextManager } from '../../bridge/context-manager.js';

const isWindows = process.platform === 'win32';

/** Resolve the Claude Code binary path at module load time. */
function resolveClaudePath(): string {
  if (process.env.CLAUDE_EXECUTABLE_PATH) return process.env.CLAUDE_EXECUTABLE_PATH;
  try {
    const cmd = isWindows ? 'where claude' : 'which claude';
    const resolved = execSync(cmd, { encoding: 'utf-8' }).trim().split(/\r?\n/)[0];
    if (resolved && fs.existsSync(resolved)) return resolved;
    if (resolved) {
      try {
        const real = fs.realpathSync(resolved);
        if (fs.existsSync(real)) return real;
      } catch {}
    }
    return resolved;
  } catch {
    return isWindows ? 'claude' : '/usr/local/bin/claude';
  }
}

const CLAUDE_EXECUTABLE = resolveClaudePath();

/**
 * Env var prefixes to always strip from the inherited process environment.
 * CLAUDE*: prevents "nested session" errors from the SDK.
 */
const ALWAYS_FILTERED_PREFIXES = ['CLAUDE'];

/**
 * Auth-related env vars that are only filtered when an explicit API key
 * is provided in bot config OR when ~/.claude/.credentials.json exists.
 * This ensures users who rely solely on ANTHROPIC_API_KEY env var can
 * still authenticate without configuring bot config.
 */
const AUTH_ENV_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

/**
 * Check if Claude Code has credentials.json (OAuth login).
 */
function hasCredentialsFile(): boolean {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    return fs.existsSync(credPath);
  } catch {
    return false;
  }
}

/**
 * Create a custom spawn function for cross-platform compatibility.
 * - Uses process.execPath (current Node binary) to avoid PATH issues on Windows.
 * - Always filters CLAUDE* env vars to prevent nested session errors.
 * - Filters ANTHROPIC auth env vars only when an explicit API key is provided
 *   or credentials.json exists (so env-var-only users can still authenticate).
 * - Merges process.env so child inherits system PATH, TEMP, etc.
 * - Optionally injects an explicit ANTHROPIC_API_KEY from bot config config.
 */
function createSpawnFn(explicitApiKey?: string, explicitBaseUrl?: string): (options: SpawnOptions) => SpawnedProcess {
  // Decide once whether to filter auth env vars
  const filterAuthVars = !!(explicitApiKey || hasCredentialsFile());

  return (options: SpawnOptions): SpawnedProcess => {
    // Use the command from the SDK (the binary path it resolved), not
    // process.execPath. The SDK now ships a native binary (claude.exe)
    // instead of a cli.js entrypoint, so spawning Node would fail with
    // "Cannot find module cli.js".
    const exec = options.command;

    // Merge provided env with process.env for a complete environment
    const baseEnv =
      options.env && Object.keys(options.env).length > 0 ? { ...process.env, ...options.env } : { ...process.env };

    // Filter out env vars that interfere with auth or cause nested session errors
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value === undefined) continue;
      if (ALWAYS_FILTERED_PREFIXES.some((p) => key.startsWith(p))) continue;
      if (filterAuthVars && AUTH_ENV_VARS.some((v) => key.startsWith(v))) continue;
      env[key] = value;
    }

    // Inject explicit API key and base URL from bot config (after filtering, so they take effect)
    if (explicitApiKey) {
      if (explicitBaseUrl) {
        env.ANTHROPIC_AUTH_TOKEN = explicitApiKey;
      } else {
        env.ANTHROPIC_API_KEY = explicitApiKey;
        env.ANTHROPIC_AUTH_TOKEN = explicitApiKey;
      }
    }
    if (explicitBaseUrl) {
      env.ANTHROPIC_BASE_URL = explicitBaseUrl;
    }

    const child = spawn(exec, options.args, {
      cwd: options.cwd,
      env,
      signal: options.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return child as unknown as SpawnedProcess;
  };
}

export interface ApiContext {
  botName: string;
  chatId: string;
  /** Group chat member names — enables inter-bot communication prompt. */
  groupMembers?: string[];
  /** Group ID — used to build grouptalk chatIds for inter-bot communication. */
  groupId?: string;
}

export interface ExecutorOptions {
  prompt: string;
  cwd: string;
  sessionId?: string;
  abortController: AbortController;
  outputsDir?: string;
  apiContext?: ApiContext;
  /** Override maxTurns for this execution. */
  maxTurns?: number;
  /** Override model for this execution (e.g. faster model for voice calls). */
  model?: string;
  /** Override allowed tools for this execution (empty array = no tools). */
  allowedTools?: string[];
  /** User role for tool restriction enforcement. */
  userRole?: UserRole;
  /** Override systemPrompt (e.g. resolved from agentId at execution time). */
  systemPromptOverride?: string;
  /** Knowledge base context to inject into system prompt. */
  knowledgeContext?: string | null;
  /** Called when AskUserQuestion is detected, before the hook blocks. */
  onPendingQuestion?: (question: { toolUseId: string; questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> }) => void;
}

export type SDKMessage = {
  type: string;
  subtype?: string;
  uuid?: string;
  session_id?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      id?: string;
      input?: unknown;
    }>;
  };
  // Result fields
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  errors?: string[];
  // Model usage from result message (per-model breakdown)
  modelUsage?: Record<string, { inputTokens: number; outputTokens: number; contextWindow: number; costUSD: number }>;
  // Stream event fields
  event?: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;
    };
    content_block?: {
      type: string;
      text?: string;
      name?: string;
      id?: string;
    };
  };
  parent_tool_use_id?: string | null;
};

export interface ExecutionHandle {
  stream: AsyncGenerator<SDKMessage>;
  sendAnswer(toolUseId: string, sessionId: string, answerText: string): void;
  /**
   * Resolve a pending AskUserQuestion PreToolUse hook with the user's answers.
   * Use this instead of sendAnswer when running in bypassPermissions mode —
   * sendAnswer enqueues a tool_result that never reaches the SDK because the
   * internal permission check short-circuits before auto-allow.
   */
  resolveQuestion(toolUseId: string, answers: Record<string, string>): void;
  finish(): void;
}

export class ClaudeExecutor {
  constructor(
    private config: BotConfigBase,
    private logger: Logger,
  ) {}

  private buildQueryOptions(
    cwd: string,
    sessionId: string | undefined,
    abortController: AbortController,
    outputsDir?: string,
    systemPromptOverride?: string,
  ): Record<string, unknown> {
    const queryOptions: Record<string, unknown> = {
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      cwd,
      abortController,
      includePartialMessages: true,
      // Load MCP servers and settings from user/project config files
      settingSources: this.config.claude.baseUrl ? ['project'] : ['user', 'project'],
      // Cross-platform spawn: custom spawn filters CLAUDE* env vars to
      // prevent nested-session errors. The SDK 0.2.141+ ships a native
      // binary (claude.exe) instead of a cli.js entrypoint, so:
      // - executable = the binary path (not node)
      // - executableArgs = empty (no JS entrypoint to inject)
      spawnClaudeCodeProcess: createSpawnFn(this.config.claude.apiKey, this.config.claude.baseUrl),
      executable: CLAUDE_EXECUTABLE,
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
    };

    // Build system prompt with priority-based ContextManager
    const ctx = new ContextManager();

    const effectiveSystemPrompt = systemPromptOverride ?? this.config.systemPrompt;
    if (effectiveSystemPrompt) {
      this.logger.info(
        {
          source: systemPromptOverride ? 'agent-ref' : 'config',
          systemPromptLength: effectiveSystemPrompt.length,
          preview: effectiveSystemPrompt.slice(0, 80),
        },
        'System prompt loaded',
      );
      ctx.addLayer({ layer: ContextLayer.IDENTITY, content: effectiveSystemPrompt });
    }

    if (outputsDir) {
      ctx.addLayer({
        layer: ContextLayer.SYSTEM,
        content: `## Output Files\nWhen producing output files for the user (images, PDFs, documents, archives, code files, etc.), copy them to: ${outputsDir}\nUse \`cp\` via the Bash tool. The bridge will automatically send files placed there to the user.`,
      });
    }

    // apiContext and knowledgeContext are dynamic (change per-session/per-query).
    // The caller (startExecution) prepends them to the first user message so the
    // system prompt stays 100% static and cacheable across all sessions.

    const assembledPrompt = ctx.buildPrompt(50000); // ~50K token budget for system prompt
    if (assembledPrompt) {
      queryOptions.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: '\n\n' + assembledPrompt,
        // Cache the entire system prompt (preset + append) across sessions.
        // Dynamic sections (git status, directory listing, date) are moved to
        // the first user message by the SDK so the system prompt stays static.
        excludeDynamicSections: true,
      };
    }

    if (this.config.claude.maxTurns !== undefined) {
      queryOptions.maxTurns = this.config.claude.maxTurns;
    }

    if (this.config.claude.maxBudgetUsd !== undefined) {
      queryOptions.maxBudgetUsd = this.config.claude.maxBudgetUsd;
    }

    // Pick the model from the standard config.claude.model slot, with a
    // fallback to a top-level `model` field (legacy config shape) so a
    // bot never silently falls through to the SDK default (which is
    // currently claude-haiku-4-5 and trips 529s on non-Anthropic
    // proxies like GLM that don't host that model).
    const resolvedModel = this.config.claude.model
      ?? (this.config as unknown as { model?: string }).model;
    if (resolvedModel) {
      queryOptions.model = resolvedModel;
    }

    if (sessionId) {
      queryOptions.resume = sessionId;
    }

    // Beta flags are ignored by the SDK on OAuth/Pro-Max auth. For 1M context,
    // use the model-name suffix `[1m]` (e.g. `claude-opus-4-7[1m]`) instead.
    // Removed: 1M beta causes false context window estimate on non-Anthropic proxies
    // queryOptions.betas = ['context-1m-2025-08-07'];

    return queryOptions;
  }

  startExecution(options: ExecutorOptions): ExecutionHandle {
    const { prompt, cwd, sessionId, abortController, outputsDir, apiContext } = options;

    this.logger.info({ cwd, hasSession: !!sessionId, outputsDir }, 'Starting Claude execution (multi-turn)');

    const inputQueue = new AsyncQueue<SDKUserMessage>();

    // Prepend dynamic context (session info, knowledge) to the first user message.
    // This keeps the system prompt 100% static and cacheable.
    let dynamicPrefix = '';
    if (apiContext) {
      dynamicPrefix += `## Current Session\n- Bot: ${apiContext.botName}\n- Chat: ${apiContext.chatId}\n`;
      if (apiContext.groupMembers && apiContext.groupMembers.length > 0) {
        const others = apiContext.groupMembers.filter((m) => m !== apiContext.botName);
        const groupId = apiContext.groupId;
        if (groupId) {
          dynamicPrefix += `- Group: ${groupId}\n- Other members: ${others.join(', ')}\n- Use grouptalk-${groupId}-<botName> as chatId for inter-bot communication\n`;
        } else {
          dynamicPrefix += `- Other members: ${others.join(', ')}\n`;
        }
      }
      dynamicPrefix += '\n';
    }
    if (options.knowledgeContext) {
      dynamicPrefix += `${options.knowledgeContext}\n`;
    }

    const fullPrompt = dynamicPrefix ? dynamicPrefix + prompt : prompt;

    // Push the initial user message
    const initialMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user' as const,
        content: fullPrompt,
      },
      parent_tool_use_id: null,
      session_id: sessionId || '',
    };
    inputQueue.enqueue(initialMessage);

    const queryOptions = this.buildQueryOptions(
      cwd,
      sessionId,
      abortController,
      outputsDir,
      options.systemPromptOverride,
    );
    if (options.maxTurns !== undefined) {
      queryOptions.maxTurns = options.maxTurns;
    }
    if (options.model) {
      queryOptions.model = options.model;
    }
    if (options.userRole) {
      const roleTools = ROLE_TOOLS[options.userRole];
      if (options.allowedTools !== undefined) {
        queryOptions.allowedTools = options.allowedTools.filter((t: string) => roleTools.includes(t));
      } else {
        queryOptions.allowedTools = roleTools;
      }
    } else if (options.allowedTools !== undefined) {
      queryOptions.allowedTools = options.allowedTools;
    }

    // AskUserQuestion PreToolUse hook: the SDK marks AskUserQuestion as
    // requiresUserInteraction=true, so in bypassPermissions mode it is denied
    // before auto-allow can fire. We intercept the PreToolUse event, pause until
    // the bridge collects the user's answers, then return them as updatedInput.
    // Providing updatedInput satisfies the interaction requirement and the SDK
    // resolves the tool call with {answers} filled in.
    const pendingQuestionResolvers = new Map<string, (answers: Record<string, string>) => void>();

    const askUserQuestionHook = async (
      input: { hook_event_name: string; tool_name: string; tool_input: unknown; tool_use_id: string },
      _toolUseId: string | undefined,
      { signal }: { signal: AbortSignal },
    ): Promise<Record<string, unknown>> => {
      const toolInput = input.tool_input as Record<string, unknown>;

      // Notify bridge BEFORE blocking so pendingQuestion is set even when stream is frozen
      if (options.onPendingQuestion && Array.isArray((input.tool_input as Record<string, unknown>).questions)) {
        const qs = (input.tool_input as Record<string, unknown>).questions as Array<Record<string, unknown>>;
        options.onPendingQuestion({
          toolUseId: input.tool_use_id,
          questions: qs.map((q: Record<string, unknown>) => ({
            question: String(q.question || ''),
            header: String(q.header || ''),
            options: Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>).map((o: Record<string, unknown>) => ({ label: String(o.label || ''), description: String(o.description || '') })) : [],
            multiSelect: Boolean(q.multiSelect),
          })),
        });
      }
      const id = input.tool_use_id;

      const answers = await new Promise<Record<string, string>>((resolve) => {
        pendingQuestionResolvers.set(id, resolve);

        // Safety timeout: auto-resolve with empty answers after 6 minutes
        // (slightly longer than bridge's 5-minute QUESTION_TIMEOUT_MS) to
        // prevent indefinite hang if the bridge fails to deliver an answer.
        const timeout = setTimeout(
          () => {
            if (pendingQuestionResolvers.delete(id)) {
              logger.warn(
                { toolUseId: id },
                'AskUserQuestion hook timed out after 6 minutes — returning empty answers',
              );
              resolve({});
            }
          },
          6 * 60 * 1000,
        );

        const onAbort = () => {
          clearTimeout(timeout);
          pendingQuestionResolvers.delete(id);
          resolve({});
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });

      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: { ...toolInput, answers },
        },
      };
    };

    const allowPlanModeHook = async () => {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    };

    queryOptions.hooks = {
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [askUserQuestionHook as any],
        },
        {
          matcher: 'EnterPlanMode',
          hooks: [allowPlanModeHook as any],
        },
        {
          matcher: 'ExitPlanMode',
          hooks: [allowPlanModeHook as any],
        },
        {
          matcher: 'Bash',
          hooks: [createBashGuardHook(this.config.permissions) as any],
        },
        {
          matcher: 'Write',
          hooks: [createFSGuardHook(this.config.permissions, this.config.claude.defaultWorkingDirectory, options.userRole) as any],
        },
        {
          matcher: 'Edit',
          hooks: [createFSGuardHook(this.config.permissions, this.config.claude.defaultWorkingDirectory, options.userRole) as any],
        },
      ],
    };

    const stream = query({
      prompt: inputQueue,
      options: queryOptions as any,
    });

    const logger = this.logger;

    async function* wrapStream(): AsyncGenerator<SDKMessage> {
      // Race each stream.next() against the abort signal so we exit immediately on /stop
      const abortPromise = new Promise<never>((_, reject) => {
        if (abortController.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        abortController.signal.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      });

      const iterator = stream[Symbol.asyncIterator]();

      try {
        while (true) {
          const result = await Promise.race([iterator.next(), abortPromise]);
          if (result.done) break;
          yield result.value as SDKMessage;
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          logger.info('Claude execution aborted');
          // Clean up the underlying iterator (non-blocking)
          try {
            iterator.return?.(undefined);
          } catch {
            /* ignore */
          }
          return;
        }
        throw err;
      }
    }

    return {
      stream: wrapStream(),
      sendAnswer: (toolUseId: string, sid: string, answerText: string) => {
        logger.info({ toolUseId }, 'Sending answer to Claude');
        const answerMessage: SDKUserMessage = {
          type: 'user',
          message: {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: answerText,
              },
            ],
          },
          parent_tool_use_id: null,
          session_id: sid,
        };
        inputQueue.enqueue(answerMessage);
      },
      resolveQuestion: (toolUseId: string, answers: Record<string, string>) => {
        const resolver = pendingQuestionResolvers.get(toolUseId);
        if (resolver) {
          pendingQuestionResolvers.delete(toolUseId);
          logger.info({ toolUseId, answerCount: Object.keys(answers).length }, 'Resolving AskUserQuestion hook');
          resolver(answers);
        } else {
          // Fallback: enqueue tool_result via inputQueue. Used if the hook
          // didn't capture this toolUseId (e.g., legacy sendAnswer path) or
          // the SDK version differs.
          logger.warn({ toolUseId }, 'No pending AskUserQuestion resolver — falling back to sendAnswer path');
          const answerMessage: SDKUserMessage = {
            type: 'user',
            message: {
              role: 'user' as const,
              content: [{ type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify({ answers }) }],
            },
            parent_tool_use_id: null,
            session_id: '',
          };
          inputQueue.enqueue(answerMessage);
        }
      },
      finish: () => {
        inputQueue.finish();
      },
    };
  }

  async *execute(options: ExecutorOptions): AsyncGenerator<SDKMessage> {
    const { prompt, cwd, sessionId, abortController, outputsDir } = options;

    this.logger.info({ cwd, hasSession: !!sessionId }, 'Starting Claude execution');

    const queryOptions = this.buildQueryOptions(cwd, sessionId, abortController, outputsDir);

    const stream = query({
      prompt,
      options: queryOptions as any,
    });

    const abortPromise = new Promise<never>((_, reject) => {
      if (abortController.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      abortController.signal.addEventListener(
        'abort',
        () => {
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });

    const iterator = stream[Symbol.asyncIterator]();

    try {
      while (true) {
        const result = await Promise.race([iterator.next(), abortPromise]);
        if (result.done) break;
        yield result.value as SDKMessage;
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        this.logger.info('Claude execution aborted');
        try {
          iterator.return?.(undefined);
        } catch {
          /* ignore */
        }
        return;
      }
      throw err;
    }
  }
}

