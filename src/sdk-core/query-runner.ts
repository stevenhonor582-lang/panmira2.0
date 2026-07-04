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

import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, type Logger } from '../utils/logger.js';
import { SDKSessionManager, type BotRecord } from './session-manager.js';
import { SystemPromptInjector } from './system-prompt-injector.js';
import { AgentDefinitionBuilder } from './agent-definition-builder.js';
import { HookRegistry } from './hook-registry.js';
import { CanUseToolDecider, type BotPermissions } from './can-use-tool.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/query-runner' });

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
  static createDefault(permissions?: Partial<BotPermissions>): QueryRunner {
    const deciderOpts = permissions ? { permissions } : {};
    return new QueryRunner(
      new SDKSessionManager(),
      new SystemPromptInjector(),
      new AgentDefinitionBuilder(),
      new HookRegistry(),
      new CanUseToolDecider(deciderOpts),
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

  // === Private ===

  private async buildOptions(
    bot: BotRecord,
    opts: QueryRunnerOptions,
  ): Promise<Options> {
    const sessionConfig = this.sessionManager.buildSessionConfig(
      bot,
      opts.continue ?? true,
    );
    const systemPrompt = await this.systemPromptInjector.inject(bot.agentId);
    const businessExperts = await this.agentDefinitionBuilder.buildBusinessExperts();

    return {
      cwd: sessionConfig.cwd,
      persistSession: sessionConfig.persistSession,
      continue: sessionConfig.continue,
      settingSources: [],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: systemPrompt,
      },
      agents: Object.keys(businessExperts).length > 0 ? businessExperts : undefined,
      hooks: this.hookRegistry.all,
      canUseTool: this.canUseToolDecider.decide,
      abortController: opts.abortController ?? new AbortController(),
    };
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
}
