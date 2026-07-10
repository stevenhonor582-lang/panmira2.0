/**
 * BridgeCoreDelegates — interface for cross-bridge wiring callbacks.
 * BridgeCore only needs to forward state-changing public API calls; this interface
 * keeps BridgeCore free of message-bridge.ts import cycles.
 */
import type { BotConfigBase } from '../config.js';
import type { DocSync } from '../sync/doc-sync.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import type { IncomingMessage } from '../types.js';
import type { OutputArchiver } from './output-archiver.js';

export interface BridgeCoreDelegates {
  setCommandHandlerDocSync(docSync: DocSync): void;
  setSessionRegistry(registry: SessionRegistry): void;
  setWorkspaceManager(wm: WorkspaceManager): void;
  getOutputArchiver(): OutputArchiver;
  handleMessage(msg: IncomingMessage): Promise<void>;
  updateConfig(newConfig: BotConfigBase): void;
}
