/**
 * R49-C1: BridgeCore
 * 路由 / sender / state 相关方法
 * 抽出自 message-bridge.ts (步 5)
 */
import type { Logger } from '../utils/logger.js';
import type { BotConfigBase } from '../config.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { IncomingMessage } from '../types.js';
import type { IMessageSender } from './message-sender.interface.js';
import type { SessionManager } from '../engines/index.js';
import type { DocSync } from '../sync/doc-sync.js';
import type { OutputArchiver } from './output-archiver.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import type { RunningTask } from './bridge-types.js';
import type { BridgeCoreDelegates } from './bridge-core-delegates.js';

export interface BridgeCoreDeps {
  config: BotConfigBase;
  logger: Logger;
  /** Default sender (always available, used when no override) */
  defaultSender: IMessageSender;
  sessionManager: SessionManager;
  /** Sender overrides keyed by chatId — controlled by BridgeCore.setSenderOverride */
  senderOverrides: Map<string, IMessageSender>;
  /** Running tasks map — controlled by executeTask; read-only access for state queries */
  runningTasks: Map<string, RunningTask>;
  /** Delegate handleMessage access to other bridges (e.g. setDocSync to commandHandler) */
  delegates: BridgeCoreDelegates;
}

export class BridgeCore {
  constructor(private readonly deps: BridgeCoreDeps) {}

  /** Get the effective sender for a chatId (override or default). */
  getSender(chatId?: string): IMessageSender {
    if (!chatId) return this.deps.defaultSender;
    return this.deps.senderOverrides.get(chatId) ?? this.deps.defaultSender;
  }

  /** Expose the default sender for ProxySender (needs original for downloads). */
  getDefaultSender(): IMessageSender {
    return this.deps.defaultSender;
  }

  /** Override the sender for a specific chatId (used by proxy_message). */
  setSenderOverride(chatId: string, sender: IMessageSender): void {
    this.deps.senderOverrides.set(chatId, sender);
  }

  /** Remove a sender override after proxy task completes. */
  clearSenderOverride(chatId: string): void {
    this.deps.senderOverrides.delete(chatId);
  }

  /** Expose session manager for cross-platform session linking. */
  getSessionManager(): SessionManager {
    return this.deps.sessionManager;
  }

  isBusy(chatId: string): boolean {
    return this.deps.runningTasks.has(chatId);
  }

  /** Return info about all currently running tasks (for team status display). */
  getRunningTasksInfo(): Array<{ chatId: string; startTime: number }> {
    return Array.from(this.deps.runningTasks.entries()).map(([chatId, task]) => ({
      chatId,
      startTime: task.startTime,
    }));
  }

  /** Inject the doc sync service for /sync commands. */
  setDocSync(docSync: DocSync): void {
    this.deps.delegates.setCommandHandlerDocSync(docSync);
  }

  /** Inject the session registry for cross-platform session sync. */
  setSessionRegistry(registry: SessionRegistry): void {
    this.deps.delegates.setSessionRegistry(registry);
  }

  /** Inject WorkspaceManager for proper document routing. */
  setWorkspaceManager(wm: WorkspaceManager): void {
    this.deps.delegates.setWorkspaceManager(wm);
  }

  /** Get the OutputArchiver for external wiring (e.g. GroupCoordinator). */
  getOutputArchiver(): OutputArchiver {
    return this.deps.delegates.getOutputArchiver();
  }

  /**
   * Route an incoming message: permission check → command handler → execute query.
   * The full handleMessage body stays in message-bridge.ts for now (too entangled
   * with runningTasks mutation), but the public routing entry point delegates here.
   */
  async handleMessage(msg: IncomingMessage): Promise<void> {
    return this.deps.delegates.handleMessage(msg);
  }

  /** Update bot config at runtime (e.g. /config commands). */
  updateConfig(newConfig: BotConfigBase): void {
    this.deps.delegates.updateConfig(newConfig);
  }
}
