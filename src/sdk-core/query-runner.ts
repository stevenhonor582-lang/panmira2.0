/**
 * SDK Query Runner
 *
 * Integrator for SDK Core — combines session, system_prompt, agents, hooks,
 * and can-use-tool decisions into a single SDK query() call.
 *
 * Replaces panmira 1.0's scattered query() calls in executor.ts:507,610.
 *
 * @module sdk-core/query-runner
 */

import { query, type Query, type SDKMessage, type Options, type SpawnOptions, type SpawnedProcess, type RewindFilesResult } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger, type Logger } from '../utils/logger.js';
import { SDKSessionManager, type BotRecord } from './session-manager.js';
import { pool } from '../db/index.js';
import { SystemPromptInjector } from './system-prompt-injector.js';
import { AgentDefinitionBuilder } from './agent-definition-builder.js';
import { HookRegistry } from './hook-registry.js';
import { CanUseToolDecider, type BotPermissions } from './can-use-tool.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/query-runner' });


// === Claude binary path + spawn helper (from executor.ts) ===
function resolveClaudePath(): string {
  if (process.env.CLAUDE_EXECUTABLE_PATH) return process.env.CLAUDE_EXECUTABLE_PATH;
  const candidates = [
    join(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude"),
    join(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs"),
  ];
  for (const p of candidates) { if (existsSync(p)) return p; }
  return "claude";
}
const CLAUDE_EXECUTABLE = resolveClaudePath();
const ALWAYS_FILTERED = ["CLAUDE_"];
const AUTH_ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"];

function createSpawnFn(apiKey?: string, baseUrl?: string) {
  return (options: SpawnOptions): SpawnedProcess => {
    const exec = options.command;
    const baseEnv = options.env && Object.keys(options.env).length > 0
      ? { ...process.env, ...options.env } : { ...process.env };
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value === undefined) continue;
      if (ALWAYS_FILTERED.some((p) => key.startsWith(p))) continue;
      if (apiKey && AUTH_ENV_VARS.some((v) => key.startsWith(v))) continue;
      env[key] = value;
    }
    if (apiKey) { env.ANTHROPIC_AUTH_TOKEN = apiKey; if (!baseUrl) env.ANTHROPIC_API_KEY = apiKey; }
    if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
    const child = spawn(exec, options.args, { cwd: options.cwd, env, signal: options.signal, stdio: ["pipe", "pipe", "pipe"] });
    return child as unknown as SpawnedProcess;
  };
}

// === Typed Errors ===

/** Thrown when SDK query stream fails or yields no session_id. */
export class QueryExecutionError extends Error {
  constructor(
    message: string,
    public readonly botName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

// === Types ===

export interface QueryRunnerOptions {
  /** Bot Chinese name (得一 / 玄鉴 / etc.) */
  readonly botName: string;
  /** User prompt text */
  readonly prompt: string;
  /** Whether to continue previous session (default: true) */
  readonly continue?: boolean;
  /** Optional abort controller */
  readonly abortController?: AbortController;
  /**
   * Extra SDK options to merge into the final options envelope.
   * Used by createSDKCoreHandle for mcpServers (feishu) and other
   * per-bot customizations that should NOT live in QueryRunner's
   * default build path. R49-D step 2.
   */
  readonly extras?: Readonly<Record<string, unknown>>;
}

/**
 * R49-D step 4: rewind a previous session to a user message checkpoint.
 *
 * Opens the session via SDK query() with options.resume, then calls
 * Query.rewindFiles() with the target userMessageId. Requires
 * enableFileCheckpointing: true (already set by buildOptions).
 */
export interface RewindFilesRequest {
  /** Bot Chinese name (same bot context as the original session). */
  readonly botName: string;
  /** SDK session id returned from runQuery(). */
  readonly sessionId: string;
  /** UUID of the user message to rewind to. */
  readonly userMessageId: string;
  /** If true, returns a preview of changes without modifying files. */
  readonly dryRun?: boolean;
}

export interface QueryResult {
  /** SDK session ID */
  readonly sessionId: string;
  /** Resolved bot record */
  readonly bot: BotRecord;
  /** All streamed messages */
  readonly messages: SDKMessage[];
}

// === Query Runner ===

/**
 * Integrates SDK Core modules into a single query() call.
 *
 * Usage:
 * ```ts
 * const runner = QueryRunner.createDefault();
 * const result = await runner.runQuery({
 *   botName: '得一',
 *   prompt: '帮我写营销方案',
 * });
 * ```
 */
export class QueryRunner {
  constructor(
    private readonly sessionManager: SDKSessionManager,
    private readonly systemPromptInjector: SystemPromptInjector,
    private readonly agentDefinitionBuilder: AgentDefinitionBuilder,
    private readonly hookRegistry: HookRegistry,
    private readonly canUseToolDecider: CanUseToolDecider,
    private readonly apiKey?: string,
    private readonly baseUrl?: string,
  ) {
    this.hookRegistry.registerDefaults();
  }

  /**
   * Run a query for a bot, returning the session ID and all messages.
   *
   * @param opts - Query options
   * @returns Session result with messages
   * @throws {QueryExecutionError} if SDK query fails
   */
  async runQuery(opts: QueryRunnerOptions): Promise<QueryResult> {
    const bot = await this.sessionManager.resolveBot(opts.botName);
    const options = await this.buildOptions(bot, opts);

    LOG.info(
      { bot_name: bot.name, cwd: options.cwd, prompt_length: opts.prompt.length },
      'Query started',
    );

    const messages = await this.executeStream(opts.prompt, options, bot);
    const sessionId = this.extractSessionId(messages, bot);

    // R49-D step 3: capture SDK modelUsage + usage -> task_metrics.
    // recordUsageSafely swallows errors internally so the main return
    // path is never blocked by observability failures.
    await this.recordUsageSafely(bot, messages).catch((err: unknown) => {
      LOG.warn({ bot_name: bot.name, err: String(err) }, 'usage record failed');
    });

    LOG.info(
      { bot_name: bot.name, session_id: sessionId, message_count: messages.length },
      'Query completed',
    );

    return { sessionId, bot, messages };
  }

  /**
   * Default factory — creates QueryRunner with all SDK Core modules
   * configured with sensible defaults.
   */
  static createDefault(opts?: { permissions?: Partial<BotPermissions>; apiKey?: string; baseUrl?: string }): QueryRunner {
    const deciderOpts = opts?.permissions ? { permissions: opts.permissions } : {};
    return new QueryRunner(
      new SDKSessionManager(),
      new SystemPromptInjector(),
      new AgentDefinitionBuilder(),
      new HookRegistry(),
      new CanUseToolDecider(deciderOpts),
      opts?.apiKey,
      opts?.baseUrl,
    );
  }

  /**
   * Run a query for a bot, streaming messages as they arrive.
   * Used by message-bridge for real-time card rendering.
   *
   * @param opts - Query options
   * @yields SDKMessage - Each message from the SDK stream
   * @throws {BotNotFoundError} if bot not found
   * @throws {QueryExecutionError} if SDK stream fails
   */
  async *runQueryStream(opts: QueryRunnerOptions): AsyncGenerator<SDKMessage, void, unknown> {
    const bot = await this.sessionManager.resolveBot(opts.botName);
    const options = await this.buildOptions(bot, opts);

    LOG.info(
      { bot_name: bot.name, cwd: options.cwd, prompt_length: opts.prompt.length },
      'Query stream started',
    );

    try {
      const stream = query({ prompt: opts.prompt, options });
      for await (const message of stream) {
        yield message;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new QueryExecutionError(`SDK stream failed: ${msg}`, bot.name, err);
    }

    LOG.info({ bot_name: bot.name }, 'Query stream completed');
  }

  /**
   * R49-D step 4: rewind a session to a previous user message checkpoint.
   *
   * Opens the session via SDK query({options: { resume: sessionId,
   * enableFileCheckpointing: true }}) and calls Query.rewindFiles().
   * The Query handles both message streaming and the control call; we
   * iterate the stream to completion so the SDK releases session resources
   * before returning.
   *
   * Frontend can invoke this via the bridge to expose an "undo to
   * checkpoint" affordance in card-rendered UIs.
   *
   * @param req - rewind request (botName, sessionId, userMessageId, dryRun?)
   * @returns RewindFilesResult from the SDK
   * @throws {QueryExecutionError} if canRewind=false or SDK query fails
   */
  async rewindFiles(req: RewindFilesRequest): Promise<RewindFilesResult> {
    const bot = await this.sessionManager.resolveBot(req.botName);

    const handle = query({
      prompt: '',
      options: {
        cwd: this.sessionManager.buildSessionConfig(bot, false).cwd,
        resume: req.sessionId,
        enableFileCheckpointing: true,
        settingSources: this.baseUrl ? ['project'] : ['user', 'project'],
        spawnClaudeCodeProcess: createSpawnFn(this.apiKey, this.baseUrl),
        executable: CLAUDE_EXECUTABLE,
        pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      } as Options,
    }) as unknown as Query & { rewindFiles: (id: string, opts?: { dryRun?: boolean }) => Promise<RewindFilesResult> };

    // Drain the stream so the SDK finishes rewind bookkeeping. We don't
    // surface messages - this call is a control request, not a chat turn.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _msg of handle as unknown as AsyncIterable<SDKMessage>) { /* noop */ }
    } catch {
      // rewindFiles() is what returns the verdict; drain errors do not block it.
    }

    let result: RewindFilesResult;
    try {
      result = await handle.rewindFiles(req.userMessageId, { dryRun: req.dryRun });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new QueryExecutionError(`rewindFiles failed: ${msg}`, bot.name, err);
    }

    LOG.info(
      { bot_name: bot.name, session_id: req.sessionId, user_message_id: req.userMessageId, can_rewind: result.canRewind, dry_run: req.dryRun },
      'rewindFiles completed',
    );

    if (!result.canRewind) {
      throw new QueryExecutionError(
        `rewindFiles rejected: ${result.error ?? 'unknown reason'}`,
        bot.name,
      );
    }
    return result;
  }

  // === Private ===

  private async buildOptions(
    bot: BotRecord,
    opts: QueryRunnerOptions,
  ): Promise<Record<string, unknown>> {
    const sessionConfig = this.sessionManager.buildSessionConfig(bot, false);
    const systemPrompt = await this.systemPromptInjector.inject(bot.agentId);
    // R49-D step 1: build agent map from DB so SDK can resolve Task tool subagents
    const agentsMap = await this.agentDefinitionBuilder.buildBusinessExperts();

    const base: Record<string, unknown> = {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: sessionConfig.cwd,
      abortController: opts.abortController ?? new AbortController(),
      includePartialMessages: true,
      settingSources: this.baseUrl ? ["project"] : ["user", "project"],
      spawnClaudeCodeProcess: createSpawnFn(this.apiKey, this.baseUrl),
      executable: CLAUDE_EXECUTABLE,
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      systemPrompt: systemPrompt || undefined,
      // R49-D step 1: wire SDK Core deps into query() options:
      //   hooks       -> 28 hook events via HookRegistry
      //   canUseTool  -> per-bot allow/deny policy via CanUseToolDecider
      //   agents      -> business expert subagents from agent_instances table
      //   enableFileCheckpointing -> Query.rewindFiles() (R49-D step 4)
      hooks: this.hookRegistry.all,
      canUseTool: this.canUseToolDecider.decide,
      agents: agentsMap,
      enableFileCheckpointing: true,
    };

    // R49-D step 2: bridge can inject per-bot customizations (mcpServers etc.)
    // without re-implementing the SDK query() call. extras override defaults.
    return opts.extras ? { ...base, ...opts.extras } : base;
  }


  private async executeStream(
    prompt: string,
    options: Options,
    bot: BotRecord,
  ): Promise<SDKMessage[]> {
    const messages: SDKMessage[] = [];
    try {
      const stream = query({ prompt, options });
      for await (const message of stream) {
        messages.push(message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new QueryExecutionError(
        `SDK query failed: ${msg}`,
        bot.name,
        err,
      );
    }
    return messages;
  }

  private extractSessionId(messages: SDKMessage[], bot: BotRecord): string {
    for (const message of messages) {
      const sessionId = (message as { session_id?: string }).session_id;
      if (sessionId) return sessionId;
    }
    throw new QueryExecutionError(
      'No session_id in SDK stream',
      bot.name,
    );
  }

  // === R49-D step 3: SDK usage -> task_metrics ===

  /**
   * Walk the stream, find the final SDKResultMessage (subtype=success|error),
   * and persist its modelUsage + usage + total_cost_usd into task_metrics.
   *
   * Tags layout:
   *   {
   *     bot_name, session_id, num_turns, duration_ms, duration_api_ms,
   *     total_cost_usd, modelUsage: { [modelName]: ModelUsage },
   *     usage: NonNullableUsage, subtype
   *   }
   *
   * Fire-and-forget wrapper used by runQuery — never throws.
   */
  private async recordUsageSafely(bot: BotRecord, messages: SDKMessage[]): Promise<void> {
    try {
    const resultMsg = messages.find(
      (m): m is SDKMessage & { type: 'result' } =>
        (m as { type?: string }).type === 'result',
    );
    if (!resultMsg) return;

    const r = resultMsg as unknown as {
      subtype?: string;
      num_turns?: number;
      duration_ms?: number;
      duration_api_ms?: number;
      total_cost_usd?: number;
      session_id?: string;
      usage?: unknown;
      modelUsage?: Record<string, unknown>;
    };

    const tags = {
      bot_name: bot.name,
      session_id: r.session_id,
      subtype: r.subtype,
      num_turns: r.num_turns,
      duration_ms: r.duration_ms,
      duration_api_ms: r.duration_api_ms,
      total_cost_usd: r.total_cost_usd,
      usage: r.usage,
      modelUsage: r.modelUsage,
    };

    await pool.query(
      `INSERT INTO task_metrics (metric_name, metric_value, tags)
       VALUES ($1, $2, $3)`,
      ['sdk_usage', r.total_cost_usd ?? 0, JSON.stringify(tags)],
    );

    LOG.debug(
      { bot_name: bot.name, session_id: r.session_id, num_models: Object.keys(r.modelUsage ?? {}).length },
      'sdk_usage recorded',
    );
    } catch (err: unknown) {
      // Never throw out of recordUsageSafely - it would block the main return path.
      LOG.warn({ bot_name: bot.name, err: String(err) }, 'sdk_usage record threw');
    }
  }
}
