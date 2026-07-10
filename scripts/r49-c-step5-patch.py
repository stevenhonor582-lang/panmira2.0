"""Apply R49-C1 step 5 patches - integrate BridgeCore"""
fp = '/home/ubuntu/panmira-N1/src/bridge/message-bridge.ts'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add BridgeCore import
old = "import { BridgeStream, buildContinuationPrompt as _buildContinuationPrompt } from './bridge-stream.js';\n"
new = "import { BridgeStream, buildContinuationPrompt as _buildContinuationPrompt } from './bridge-stream.js';\nimport { BridgeCore } from './bridge-core.js';\nimport type { BridgeCoreDelegates } from './bridge-core-delegates.js';\n"
assert old in content
content = content.replace(old, new)

# 2. Add core field
old = "  private stream!: BridgeStream;\n"
new = "  private stream!: BridgeStream;\n  private core!: BridgeCore;\n"
assert old in content
content = content.replace(old, new)

# 3. Add BridgeCoreDelegates interface implementation (declare satisfies)
# We need to add the interface declaration at the class level. For simplicity, declare at top of class.

# 4. Instantiate core in constructor (after stream)
old = """    this.stream = new BridgeStream({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
    });"""
new = """    this.stream = new BridgeStream({
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
    });
    this.core = new BridgeCore({
      config: this.config,
      logger: this.logger,
      defaultSender: sender,
      sessionManager: this.sessionManager,
      senderOverrides: this.senderOverrides,
      runningTasks: this.runningTasks,
      delegates: this.buildCoreDelegates(),
    });"""
assert old in content
content = content.replace(old, new)

# 5. Add buildCoreDelegates method - place it near the end of the class
# Find the location: after _autonomyViolationCount region or near similar lifecycle methods
# Put it before updateConfig method (line 2448 in original)
old = """  updateConfig(newConfig: BotConfigBase): void {"""
new = """  /** BridgeCore cross-wiring: core delegates back to MessageBridge for state changes. */
  private buildCoreDelegates(): BridgeCoreDelegates {
    return {
      setCommandHandlerDocSync: (docSync) => this.commandHandler.setDocSync(docSync),
      setSessionRegistry: (registry) => { this.sessionRegistry = registry; },
      setWorkspaceManager: (wm) => {
        this.workspaceManager = wm;
        this.memoryWriter.setWorkspaceManager(wm);
      },
      getOutputArchiver: () => this.outputArchiver,
      handleMessage: (msg) => this.handleMessage(msg),
      updateConfig: (newConfig) => this.updateConfig(newConfig),
    };
  }

  updateConfig(newConfig: BotConfigBase): void {"""
assert old in content
content = content.replace(old, new)

# 6. Replace getSender / setSenderOverride / clearSenderOverride / getDefaultSender / getSessionManager / isBusy / getRunningTasksInfo
# / setDocSync / setSessionRegistry / setWorkspaceManager / getOutputArchiver / handleMessage / updateConfig with facades

old = """  /** Inject the doc sync service for /sync commands. */
  setDocSync(docSync: DocSync): void {
    this.commandHandler.setDocSync(docSync);
  }

  /** Inject the session registry for cross-platform session sync. */
  setSessionRegistry(registry: SessionRegistry): void {
    this.sessionRegistry = registry;
  }

  /** Override the sender for a specific chatId (used by proxy_message). */
  setSenderOverride(chatId: string, sender: IMessageSender): void {
    this.senderOverrides.set(chatId, sender);
  }

  /** Remove a sender override after proxy task completes. */
  clearSenderOverride(chatId: string): void {
    this.senderOverrides.delete(chatId);
  }

  /** Get the effective sender for a chatId (override or default). */
  private getSender(chatId?: string): IMessageSender {
    if (!chatId) return this.sender;
    return this.senderOverrides.get(chatId) ?? this.sender;
  }

  /** Expose the default sender for ProxySender (needs original for downloads). */
  getDefaultSender(): IMessageSender {
    return this.sender;
  }

  /** Expose session manager for cross-platform session linking. */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  isBusy(chatId: string): boolean {
    return this.runningTasks.has(chatId);
  }

  /** Return info about all currently running tasks (for team status display). */
  getRunningTasksInfo(): Array<{ chatId: string; startTime: number }> {
    return Array.from(this.runningTasks.entries()).map(([chatId, task]) => ({
      chatId,
      startTime: task.startTime,
    }));
  }"""
new = """  /** Facade — 转发到 this.core (R49-C1 step 5 抽出 BridgeCore) */
  setDocSync(docSync: DocSync): void { this.core.setDocSync(docSync); }
  setSessionRegistry(registry: SessionRegistry): void { this.core.setSessionRegistry(registry); }
  setSenderOverride(chatId: string, sender: IMessageSender): void { this.core.setSenderOverride(chatId, sender); }
  clearSenderOverride(chatId: string): void { this.core.clearSenderOverride(chatId); }
  getDefaultSender(): IMessageSender { return this.core.getDefaultSender(); }
  getSessionManager(): SessionManager { return this.core.getSessionManager(); }
  isBusy(chatId: string): boolean { return this.core.isBusy(chatId); }
  getRunningTasksInfo(): Array<{ chatId: string; startTime: number }> { return this.core.getRunningTasksInfo(); }"""
assert old in content, "core methods block not found"
content = content.replace(old, new)

# Note: getSender is private, setWorkspaceManager is public, getOutputArchiver is public
# Replace those:
old = """  getOutputArchiver(): OutputArchiver {
    return this.outputArchiver;
  }

  /** Inject WorkspaceManager for proper document routing. */
  setWorkspaceManager(wm: import('../memory/workspace-manager.js').WorkspaceManager): void {
    this.workspaceManager = wm;
    this.memoryWriter.setWorkspaceManager(wm);
  }"""
new = """  getOutputArchiver(): OutputArchiver { return this.core.getOutputArchiver(); }
  setWorkspaceManager(wm: import('../memory/workspace-manager.js').WorkspaceManager): void { this.core.setWorkspaceManager(wm); }"""
assert old in content
content = content.replace(old, new)

# 7. Replace updateConfig with facade (it was already partially modified in step 3)
old = """  updateConfig(newConfig: BotConfigBase): void {
    this.config = newConfig;
    this.engine = createEngine(newConfig, this.logger);
    this.executor = this.engine.createExecutor();
    const engineName = resolveEngineName(newConfig);
    this.executor2.getEngineCache().set(engineName, { engine: this.engine, executor: this.executor });
  }"""
new = """  updateConfig(newConfig: BotConfigBase): void {
    this.config = newConfig;
    this.engine = createEngine(newConfig, this.logger);
    this.executor = this.engine.createExecutor();
    const engineName = resolveEngineName(newConfig);
    this.executor2.getEngineCache().set(engineName, { engine: this.engine, executor: this.executor });
  }"""
# Keep the implementation — handleMessage calls go through delegates, no facade needed for updateConfig
# Actually, the buildCoreDelegates references this.updateConfig directly, so no facade needed

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"OK step 5 patches applied. New length: {len(content)} chars")