/**
 * R49-C1: BridgeExecutor
 * Engine cache / SDK Core handle / 会话准备 相关方法
 * 抽出自 message-bridge.ts (步 3)
 */
import { join as pathJoin } from 'node:path';
import { existsSync as fsExists } from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import type { ExecutionHandle, Engine, Executor, EngineName, ExecutorOptions, ApiContext } from '../engines/index.js';
import { createEngine, resolveEngineName } from '../engines/index.js';
import type { UserRole } from '../config.js';
import type { SessionManager } from '../engines/index.js';
import { useSDKCore } from '../sdk-core/feature-flag.js';
import { createFeishuMcpServer } from '../feishu/mcp-server.js';
import type { IMessageSender } from './message-sender.interface.js';

export interface BridgeExecutorDeps {
  config: BotConfigBase;
  logger: Logger;
  sessionManager: SessionManager;
  getSender: (chatId: string) => IMessageSender;
  /** Default executor (legacy path) — set from MessageBridge.engine.createExecutor() at construction */
  defaultEngine: Engine;
  defaultExecutor: Executor;
}

export interface CreateSDKCoreHandleOpts {
  prompt: string;
  botName: string;
  abortController: AbortController;
  chatId: string;
  knowledgeContext?: string | null;
  systemPromptOverride?: string;
}

export interface PrepareSessionResult {
  session: ReturnType<SessionManager['getSession']>;
  engineName: EngineName;
}

/**
 * Bot name → English slug workspace directory mapping (V021).
 * Slug determines cwd passed to SDK Core binary.
 */
const SLUG_MAP: Record<string, string> = {
  '得一': 'deyi',
  '玄鉴': 'xuanjian',
  '不盈': 'buying',
  '守静': 'shoujing',
  '信言': 'xinyan',
};

/** Binary path candidates for SDK Core — checked in order. */
const BINARY_CANDIDATES = [
  pathJoin(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'),
  pathJoin(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs'),
];

export class BridgeExecutor {
  /** Lazy per-engine cache so a session override doesn't pay instantiation cost each turn. */
  private engineCache = new Map<EngineName, { engine: Engine; executor: Executor }>();

  constructor(private readonly deps: BridgeExecutorDeps) {
    const defaultEngineName = resolveEngineName(this.deps.config);
    this.engineCache.set(defaultEngineName, {
      engine: this.deps.defaultEngine,
      executor: this.deps.defaultExecutor,
    });
  }

  /** Expose engineCache for downstream deps (e.g. SessionManager). Read-only access. */
  getEngineCache(): Map<EngineName, { engine: Engine; executor: Executor }> {
    return this.engineCache;
  }

  /**
   * Pick the executor for a chat based on its session engine override
   * (set via `/model claude` or `/model kimi`), falling back to the bot's
   * configured engine. Executors are cached per-engine so repeated turns
   * on the same engine don't re-instantiate the SDK wrapper.
   */
  executorForChat(chatId: string): Executor {
    const session = this.deps.sessionManager.getSession(chatId);
    const name = session.engine ?? resolveEngineName(this.deps.config);
    let entry = this.engineCache.get(name);
    if (!entry) {
      const engine = createEngine(this.deps.config, this.deps.logger, name);
      const executor = engine.createExecutor();
      entry = { engine, executor };
      this.engineCache.set(name, entry);
    }
    return entry.executor;
  }

  /**
   * Gated entry point — picks SDK Core vs legacy executor based on feature flag.
   * R49-D: createSDKCoreHandle routes through QueryRunner; legacy path stays for fallback.
   */
  // chatId is optional — if absent, falls back to legacy executor (no SDK Core path).
  // SDK Core path requires chatId for Feishu MCP server construction.
  startExecutionGated(opts: {
    prompt: string;
    chatId?: string;
    abortController: AbortController;
    cwd?: string;
    sessionId?: string;
    outputsDir?: string;
    apiContext?: ApiContext;
    model?: string;
    maxTurns?: number;
    systemPromptOverride?: string;
    knowledgeContext?: string | null;
    userRole?: UserRole;
  }): ExecutionHandle {
    return useSDKCore(this.deps.config.name) && opts.chatId
      ? this.createSDKCoreHandle({
          prompt: opts.prompt,
          botName: this.deps.config.name,
          chatId: opts.chatId!,
          abortController: opts.abortController,
          knowledgeContext: opts.knowledgeContext,
          systemPromptOverride: opts.systemPromptOverride,
        })
      : this.executorForChat(opts.chatId || '').startExecution({
          prompt: opts.prompt,
          cwd: opts.cwd ?? '',
          sessionId: opts.sessionId,
          abortController: opts.abortController,
          outputsDir: opts.outputsDir,
          apiContext: opts.apiContext,
          model: opts.model,
          maxTurns: opts.maxTurns,
          systemPromptOverride: opts.systemPromptOverride,
          knowledgeContext: opts.knowledgeContext,
          userRole: opts.userRole,
        });
  }

  /**
   * Phase γ-3/γ-4: Create execution handle backed by SDK Core (QueryRunner).
   * Bypasses legacy executor + ensureIsolatedWorkspace.
   * Uses English slug cwd from bot_configs.english_slug (V021).
   * Phase γ-4: injects knowledgeContext (RAG memories/documents) into prompt.
   */
  createSDKCoreHandle(opts: CreateSDKCoreHandleOpts): ExecutionHandle {
    // Resolve binary path
    const claudeExe = BINARY_CANDIDATES.find((p) => fsExists(p)) || 'claude';

    // Build full prompt
    const sep = String.fromCharCode(10, 10, 45, 45, 45, 10, 10);
    const parts = [opts.systemPromptOverride, opts.knowledgeContext].filter(Boolean);
    const fullPrompt =
      parts.length > 0
        ? parts.join(sep) + sep + '用户问题: ' + opts.prompt
        : opts.prompt;

    // Spawn function (same as executor.ts createSpawnFn)
    const apiKey = this.deps.config.claude.apiKey;
    const baseUrl = this.deps.config.claude.baseUrl;
    const spawnFn = (options: {
      command: string;
      args: string[];
      cwd: string;
      env: Record<string, string | undefined>;
      signal: AbortSignal;
    }) => {
      const baseEnv =
        options.env && Object.keys(options.env).length > 0
          ? { ...process.env, ...options.env }
          : { ...process.env };
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(baseEnv)) {
        if (value === undefined) continue;
        if (key.startsWith('CLAUDE_')) continue;
        if (
          apiKey &&
          (key.startsWith('ANTHROPIC_API_KEY') ||
            key.startsWith('ANTHROPIC_AUTH_TOKEN') ||
            key.startsWith('ANTHROPIC_BASE_URL'))
        ) {
          continue;
        }
        env[key] = value;
      }
      if (apiKey) {
        env.ANTHROPIC_AUTH_TOKEN = apiKey;
        if (!baseUrl) env.ANTHROPIC_API_KEY = apiKey;
      }
      if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
      const child = nodeSpawn(options.command, options.args, {
        cwd: options.cwd,
        env,
        signal: options.signal,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Debug: capture stderr
      let stderrBuf = '';
      child.stderr?.on('data', (d: Buffer) => {
        stderrBuf += d.toString();
      });
      child.on('exit', (code: number | null) => {
        if (code !== 0) {
          this.deps.logger.error(
            { code, stderr: stderrBuf.slice(0, 500), command: options.command, cwd: options.cwd },
            'SDK Core binary exited non-zero',
          );
        }
      });
      return child;
    };

    // English slug cwd
    const slug = SLUG_MAP[opts.botName] || opts.botName;
    const cwd = `/home/ubuntu/workspace/${slug}`;

    // Call SDK query() with ESM import (NOT require)
    const stream = sdkQuery({
      prompt: fullPrompt,
      options: {
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd,
        abortController: opts.abortController,
        includePartialMessages: true,
        settingSources: baseUrl ? ['project'] : ['user', 'project'],
        spawnClaudeCodeProcess: spawnFn,
        executable: claudeExe,
        pathToClaudeCodeExecutable: claudeExe,
        systemPrompt: opts.systemPromptOverride || undefined,
        mcpServers: { feishu: createFeishuMcpServer(this.deps.getSender(opts.chatId), opts.chatId) },
      } as any,
    });

    return {
      stream: stream as unknown as ExecutionHandle['stream'],
      sendAnswer: () => {},
      resolveQuestion: () => {},
      finish: () => {
        opts.abortController.abort();
      },
    };
  }

  /**
   * Prepare session for execution. If the session has a different engine than the
   * one Claude remembers, reset the session so we don't resume across engines.
   */
  prepareSessionForExecution(chatId: string): PrepareSessionResult {
    const session = this.deps.sessionManager.getSession(chatId);
    const engineName = session.engine ?? resolveEngineName(this.deps.config);
    if (session.sessionId && session.sessionIdEngine && session.sessionIdEngine !== engineName) {
      this.deps.sessionManager.resetSession(chatId);
    }
    return { session: this.deps.sessionManager.getSession(chatId), engineName };
  }
}
