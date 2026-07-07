import * as lark from '@larksuiteoapi/node-sdk';
import type { BotConfig } from '../config.js';
import type { Logger } from '../utils/logger.js';
import { createEventDispatcher } from './event-handler.js';
import { MessageSender } from './message-sender.js';
import { FeishuSenderAdapter } from './feishu-sender-adapter.js';
import { MessageBridge } from '../bridge/message-bridge.js';
import type { ChatSessionStore } from '../db/chat-session-store.js';
import type { GroupCoordinator } from '../api/group-coordinator.js';
import { pool } from '../db/index.js';
import { triggerPipelineForBot } from '../services/pipeline-bot-trigger.js';
import type { DiscoveredGroupStore } from '../db/discovered-group-store.js';

export interface FeishuBotHandle {
  name: string;
  bridge: MessageBridge;
  wsClient: lark.WSClient;
  config: BotConfig;
  sender: FeishuSenderAdapter;
  feishuClient: lark.Client;
}


/** Look up bot_configs.agent_template_id for this bot (cached per bot). */
const botAgentTemplateCache = new Map<string, string | null>();
async function getBotAgentTemplateId(botName: string): Promise<string | null> {
  if (botAgentTemplateCache.has(botName)) return botAgentTemplateCache.get(botName)!;
  try {
    const r = await pool.query('SELECT agent_template_id FROM bot_configs WHERE name = $1 AND is_active = true LIMIT 1', [botName]);
    const id = r.rows[0]?.agent_template_id ?? null;
    botAgentTemplateCache.set(botName, id);
    return id;
  } catch {
    botAgentTemplateCache.set(botName, null);
    return null;
  }
}

/** Try to trigger a matching pipeline; on success, send the result and stop. Fall back to MessageBridge otherwise. */
async function tryPipelineThenBridge(
  botConfig: any,
  botLogger: any,
  rawSender: any,
  msg: any,
  bridge: any,
): Promise<void> {
  const agentTemplateId = await getBotAgentTemplateId(botConfig.name);
  if (agentTemplateId && msg.text && msg.chatId) {
    const runIdHint = `bot-${msg.messageId || Date.now()}`;
    // L10: 把 bot / chat 上下文传给 pipeline-bot-trigger,
    //      让 WS 进度事件带上 botId / chatId,前端可按 bot 过滤。
    const result = await triggerPipelineForBot(
      agentTemplateId,
      msg.text,
      runIdHint,
      undefined,
      'first',
      { botId: botConfig.name, chatId: msg.chatId },
    );
    if (result) {
      botLogger.info(
        { bot: botConfig.name, runId: result.runId, outputLen: result.output.length },
        'Pipeline triggered by bot message — sending response',
      );
      const text = result.output.trim() || '(pipeline returned empty response)';
      try {
        await rawSender.sendText(msg.chatId, text);
      } catch (e: any) {
        botLogger.warn({ err: e?.message }, 'Failed to send pipeline response; falling back to bridge');
        await bridge.handleMessage(msg);
      }
      return;
    }
  }
  // Fallback: standard bot flow
  await bridge.handleMessage(msg);
}

export async function startFeishuBot(
  botConfig: BotConfig,
  logger: Logger,
  memoryServerUrl: string,
  memorySecret?: string,
  coordinator?: GroupCoordinator,
  sessionStore?: ChatSessionStore,
  discoveredGroupsStore?: DiscoveredGroupStore,
  feishuServiceClient?: any,
): Promise<FeishuBotHandle> {
  const botLogger = logger.child({ bot: botConfig.name });

  botLogger.info('Starting Feishu bot...');

  const clientDomain = (botConfig.feishu as any).domain === 'Lark' ? lark.Domain.Lark : lark.Domain.Feishu;
  const client = new lark.Client({
    appId: botConfig.feishu.appId,
    appSecret: botConfig.feishu.appSecret,
    domain: clientDomain,
    disableTokenCache: false,
  });

  let botOpenId: string | undefined;
  try {
    const botInfo: any = await client.request({ method: 'GET', url: '/open-apis/bot/v3/info' });
    botOpenId = botInfo?.bot?.open_id;
    if (botOpenId) {
      botLogger.info({ botOpenId }, 'Bot info fetched');
    } else {
      botLogger.warn(
        'Could not get bot open_id. Ensure the Feishu app has Bot capability enabled and the app version is published.',
      );
    }
  } catch (err: any) {
    botLogger.warn({ err: err?.message || err }, 'Failed to fetch bot info');
  }

  const rawSender = new MessageSender(client, botLogger);
  const sender = new FeishuSenderAdapter(rawSender);
  const bridge = new MessageBridge(botConfig, botLogger, sender, memoryServerUrl, memorySecret, sessionStore);
  // 工单 9 (2026-07-06): 预热 contextWindow cache(Layer 1: DB 测量值)
  bridge.refreshContextWindowCache().catch((err) => {
    botLogger.warn({ err: err.message }, 'Initial contextWindow cache refresh failed');
  });

  const dispatcher = createEventDispatcher(
    botConfig,
    botLogger,
    (msg) => {
      // Phase 3 #2: try pipeline trigger before falling back to MessageBridge
      tryPipelineThenBridge(botConfig, botLogger, rawSender, msg, bridge).catch((err) => {
        botLogger.error({ err, msg }, 'Unhandled error in pipeline-then-bridge dispatcher');
      });
    },
    botOpenId,
    rawSender,
    (event) => {
      bridge.handleCardAction(event).catch((err) => {
        botLogger.error({ err, event }, 'Unhandled error in card action handler');
      });
    },
    coordinator,
    botConfig.name,
    discoveredGroupsStore,
    feishuServiceClient,
  );

  const wsClient = new lark.WSClient({
    appId: botConfig.feishu.appId,
    appSecret: botConfig.feishu.appSecret,
    domain: clientDomain,
    loggerLevel: lark.LoggerLevel.info,
  });

  await wsClient.start({ eventDispatcher: dispatcher });

  botLogger.info('Feishu bot is running');
  botLogger.info(
    {
      defaultWorkingDirectory: botConfig.claude.defaultWorkingDirectory,
      maxTurns: botConfig.claude.maxTurns ?? 'unlimited',
      maxBudgetUsd: botConfig.claude.maxBudgetUsd ?? 'unlimited',
    },
    'Configuration',
  );

  return { name: botConfig.name, bridge, wsClient, config: botConfig, sender, feishuClient: client };
}
