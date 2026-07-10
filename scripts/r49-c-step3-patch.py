"""Apply R49-C1 step 3 patches to message-bridge.ts - integrate BridgeExecutor"""
import re

fp = '/home/ubuntu/panmira-N1/src/bridge/message-bridge.ts'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# --- 1. Remove unused imports (now in bridge-executor.ts) ---
# But we still need: createEngine, resolveEngineName, Engine, Executor, ExecutionHandle, EngineName
# Most are still used by other parts. Let's check.

# Remove: nodeSpawn, fsExists, pathJoin (only used by createSDKCoreHandle)
old = "import { spawn as nodeSpawn } from 'node:child_process';\nimport { existsSync as fsExists } from 'node:fs';\nimport { join as pathJoin } from 'node:path';\n"
new = ""
assert old in content
content = content.replace(old, new)

# Remove: sdkQuery, useSDKCore, createFeishuMcpServer (moved to bridge-executor.ts)
old = "import { useSDKCore } from '../sdk-core/feature-flag.js';\n"
new = ""
assert old in content
content = content.replace(old, new)

old = "import { createFeishuMcpServer } from '../feishu/mcp-server.js';\n"
new = ""
assert old in content
content = content.replace(old, new)

old = "import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';\n"
new = ""
assert old in content
content = content.replace(old, new)

# Add BridgeExecutor import
old = "import { BridgeCard } from './bridge-card.js';\n"
new = "import { BridgeCard } from './bridge-card.js';\nimport { BridgeExecutor } from './bridge-executor.js';\n"
assert old in content
content = content.replace(old, new)

# --- 2. Remove engineCache field ---
old = "  /** Lazy per-engine cache so a session override doesn't pay instantiation cost each turn. */\n  private engineCache = new Map<EngineName, { engine: Engine; executor: Executor }>();\n"
new = ""
assert old in content
content = content.replace(old, new)

# --- 3. Add executor field ---
old = "  private observer!: BridgeObserver;\n  private card!: BridgeCard;\n"
new = "  private observer!: BridgeObserver;\n  private card!: BridgeCard;\n  private executor2!: BridgeExecutor;\n"
assert old in content
content = content.replace(old, new)

# --- 4. Remove engineCache.set() in constructor ---
old = "    this.engineCache.set(defaultEngineName, { engine: this.engine, executor: this.executor });\n"
new = ""
assert old in content
content = content.replace(old, new)

# --- 5. Add executor2 instantiation in constructor (after card) ---
old = """    this.card = new BridgeCard({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
      getRunningTask: (chatId) => this.runningTasks.get(chatId),
    });"""
new = """    this.card = new BridgeCard({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
      getRunningTask: (chatId) => this.runningTasks.get(chatId),
    });
    this.executor2 = new BridgeExecutor({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
      defaultEngine: this.engine,
      defaultExecutor: this.executor,
    });"""
assert old in content
content = content.replace(old, new)

# --- 6. Fix _sessionDeps getter (engineCache → executor2.getEngineCache()) ---
old = """      engineCache: this.engineCache,
      sessionRegistry: this.sessionRegistry,
      getSender: (chatId: string) => this.getSender(chatId),
    };
  }"""
new = """      engineCache: this.executor2.getEngineCache(),
      sessionRegistry: this.sessionRegistry,
      getSender: (chatId: string) => this.getSender(chatId),
    };
  }"""
assert old in content
content = content.replace(old, new)

# --- 7. Replace startExecutionGated with thin facade ---
old = """  private startExecutionGated(opts: Record<string, any>): ExecutionHandle {
    return useSDKCore(this.config.name)
      ? this.createSDKCoreHandle({ prompt: opts.prompt, botName: this.config.name, chatId: opts.chatId,
          abortController: opts.abortController, knowledgeContext: opts.knowledgeContext,
          systemPromptOverride: opts.systemPromptOverride })
      : this.executorForChat(opts.chatId).startExecution({
          prompt: opts.prompt, cwd: opts.cwd, sessionId: opts.sessionId,
          abortController: opts.abortController, outputsDir: opts.outputsDir,
          apiContext: opts.apiContext, model: opts.model, maxTurns: opts.maxTurns,
          systemPromptOverride: opts.systemPromptOverride,
          knowledgeContext: opts.knowledgeContext, userRole: opts.userRole });
  }"""
new = """  private startExecutionGated(opts: Record<string, any>): ExecutionHandle {
    return this.executor2.startExecutionGated(opts);
  }"""
assert old in content, "startExecutionGated block not found"
content = content.replace(old, new)

# --- 8. Replace executorForChat with thin facade ---
old = """  private executorForChat(chatId: string): Executor {
    const session = this.sessionManager.getSession(chatId);
    const name = session.engine ?? resolveEngineName(this.config);
    let entry = this.engineCache.get(name);
    if (!entry) {
      const engine = createEngine(this.config, this.logger, name);
      const executor = engine.createExecutor();
      entry = { engine, executor };
      this.engineCache.set(name, entry);
    }
    return entry.executor;
  }"""
new = """  private executorForChat(chatId: string): Executor {
    return this.executor2.executorForChat(chatId);
  }"""
assert old in content
content = content.replace(old, new)

# --- 9. Replace createSDKCoreHandle with thin facade ---
old_start = "  /**\n   * Phase γ-3/γ-4: Create execution handle backed by SDK Core (QueryRunner).\n"
old_end = """      finish: () => { opts.abortController.abort(); },
    };
  }


  private prepareSessionForExecution(chatId: string) {
    const session = this.sessionManager.getSession(chatId);
    const engineName = session.engine ?? resolveEngineName(this.config);
    if (session.sessionId && session.sessionIdEngine && session.sessionIdEngine !== engineName) {
      this.sessionManager.resetSession(chatId);
    }
    return { session: this.sessionManager.getSession(chatId), engineName };
  }"""
new_block = """  private createSDKCoreHandle(opts: {
    prompt: string;
    botName: string;
    abortController: AbortController;
    chatId: string;
    knowledgeContext?: string | null;
    systemPromptOverride?: string;
  }): ExecutionHandle {
    return this.executor2.createSDKCoreHandle(opts);
  }


  private prepareSessionForExecution(chatId: string) {
    return this.executor2.prepareSessionForExecution(chatId);
  }"""
assert old_start in content and old_end in content, "createSDKCoreHandle block not found"
# Find span: from old_start to old_end
s_idx = content.index(old_start)
e_idx = content.index(old_end) + len(old_end)
content = content[:s_idx] + new_block + content[e_idx:]

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"OK step 3 patches applied. New length: {len(content)} chars")