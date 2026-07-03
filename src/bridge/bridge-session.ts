import { syncTurn as nextcrmSyncTurn } from '../sync/nextcrm-sync.js';
import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import type { Engine, Executor, EngineName } from '../engines/index.js';
import { createEngine, resolveEngineName, SessionManager } from '../engines/index.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { IMessageSender } from './message-sender.interface.js';

export interface SessionHelperDeps {
  config: BotConfigBase;
  logger: Logger;
  sessionManager: SessionManager;
  engineCache: Map<EngineName, { engine: Engine; executor: Executor }>;
  sessionRegistry?: SessionRegistry;
  getSender: (chatId?: string) => IMessageSender;
}

export function executorForChat(deps: SessionHelperDeps, chatId: string): Executor {
  const session = deps.sessionManager.getSession(chatId);
  const name: EngineName = session.engine ?? resolveEngineName(deps.config);
  let entry = deps.engineCache.get(name);
  if (!entry) {
    const engine = createEngine(deps.config, deps.logger, name);
    const executor = engine.createExecutor();
    entry = { engine, executor };
    deps.engineCache.set(name, entry);
    deps.logger.info({ engine: name, chatId }, 'Instantiated engine on demand for session override');
  }
  return entry.executor;
}

export function prepareSessionForExecution(deps: SessionHelperDeps, chatId: string) {
  const session = deps.sessionManager.getSession(chatId);
  const engineName: EngineName = session.engine ?? resolveEngineName(deps.config);

  if (session.sessionId && session.sessionIdEngine && session.sessionIdEngine !== engineName) {
    deps.logger.info(
      { chatId, sessionIdEngine: session.sessionIdEngine, engine: engineName },
      'Clearing session id from a different engine',
    );
    deps.sessionManager.resetSession(chatId);
  }

  if (session.model && session.modelEngine && session.modelEngine !== engineName) {
    deps.logger.info(
      { chatId, modelEngine: session.modelEngine, engine: engineName },
      'Clearing model override from a different engine',
    );
    deps.sessionManager.setSessionModel(chatId, undefined);
  }

  return {
    session: deps.sessionManager.getSession(chatId),
    engineName,
  };
}

export async function recordSession(
  deps: SessionHelperDeps,
  chatId: string,
  prompt: string,
  responseText: string | undefined,
  claudeSessionId: string | undefined,
  costUsd: number | undefined,
  durationMs: number | undefined,
): Promise<void> {
  if (!deps.sessionRegistry) return;
  try {
    await deps.sessionRegistry.createOrUpdate({
      chatId,
      botName: deps.config.name,
      claudeSessionId,
      workingDirectory: deps.sessionManager.getSession(chatId).workingDirectory,
      prompt,
      responseText,
      costUsd,
      durationMs,
    });
    // Phase B: 异步回写 NextCRM(绝不 await 阻塞,绝不抛)
    void nextcrmSyncTurn({
      botName: deps.config.name,
      chatId,
      prompt,
      responseText,
      claudeSessionId,
      costUsd,
      durationMs,
      logger: deps.logger,
    }).catch((e) => deps.logger.warn({ err: e, chatId }, 'nextcrm-sync syncTurn threw (swallowed)'));
  } catch (err) {
    deps.logger.warn({ err, chatId }, 'Failed to record session in registry');
  }
}
