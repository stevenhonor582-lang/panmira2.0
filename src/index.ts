import * as path from 'node:path';
import * as lark from '@larksuiteoapi/node-sdk';
import { loadAppConfigFromDB, type BotConfig } from './config.js';
import { createLogger, type Logger } from './utils/logger.js';
import { startFeishuBot, type FeishuBotHandle } from './feishu/feishu-bot-starter.js';
import { MessageBridge } from './bridge/message-bridge.js';
import type { IMessageSender } from './bridge/message-sender.interface.js';
import type { BotConfigBase } from './config.js';
import { startTelegramBot } from './telegram/telegram-bot.js';
import { startWechatBot } from './wechat/wechat-bot.js';
import { BotRegistry } from './api/bot-registry.js';
import { NullSender } from './web/null-sender.js';
import { PeerManager } from './api/peer-manager.js';
import { TaskScheduler } from './scheduler/task-scheduler.js';
import { startApiServer } from './api/http-server.js';
import { startMemoryServer } from './memory/memory-server.js';
import { WorkspaceManager } from './memory/workspace-manager.js';
import { DocSync } from './sync/doc-sync.js';
import { MemoryClient } from './memory/memory-client.js';

import { pool } from './db/index.js';
import { runPreflight, validateBotConsistency } from './utils/preflight.js';
import { SessionRegistry } from './session/session-registry.js';
import { ChatSessionStore } from './db/chat-session-store.js';
import { ScheduledTaskStore } from './db/scheduled-task-store.js';
import { AgentBus } from './api/agent-bus.js';
import { GroupSessionManager } from './api/group-session.js';
import { GroupCoordinator } from './api/group-coordinator.js';
import { BindingEngine } from './api/routing-bindings.js';
import { IntentRouter } from './api/intent-router.js';
import { CoordinatorConfigStore } from './db/coordinator-config-store.js';
import * as fs from 'node:fs';
import { DiscoveredGroupStore } from './db/discovered-group-store.js';

async function backfillEmbedDocuments(embedder: any, logger: Logger): Promise<void> {
  const { rows } = await pool.query(
    "SELECT id, title, content FROM documents WHERE embedding IS NULL AND content != ''",
  );
  if (rows.length === 0) return;

  logger.info({ count: rows.length }, 'Starting embedding backfill...');
  let backfilled = 0;

  for (const row of rows) {
    try {
      const text = `${row.title}\n${row.content}`.slice(0, 2000);
      const embedding = await embedder.embed(text);
      if (embedding.every((v: number) => v === 0)) continue;
      await pool.query('UPDATE documents SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), row.id]);
      backfilled++;
    } catch (err: any) {
      logger.warn({ err: err.message, docId: row.id }, 'Backfill embedding failed for doc');
    }
  }

  logger.info({ backfilled, total: rows.length }, 'Embedding backfill completed');
}

async function seedDefaultAgents(logger: Logger): Promise<void> {
  const { rows } = await pool.query('SELECT count(*)::int as cnt FROM agents');
  if (rows[0]?.cnt > 0) return;

  const seedPath = path.join(process.cwd(), 'config', 'default-agents.json');
  if (!fs.existsSync(seedPath)) {
    logger.warn('No default-agents.json found, skipping seed');
    return;
  }

  try {
    const agents = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

    // Map knowledge_folders names → folder UUIDs (agents.knowledge_folders must be UUIDs).
    // Falls back to the original name string if the folder is not yet created.
    const { rows: folderRows } = await pool.query(
      "SELECT id, name FROM folders WHERE visibility = 'shared'",
    );
    const nameToId = new Map<string, string>();
    for (const f of folderRows) nameToId.set(f.name, f.id);

    for (const agent of agents) {
      const folderIds: string[] = [];
      for (const name of agent.knowledge_folders || []) {
        const id = nameToId.get(name);
        if (id) folderIds.push(id);
        else logger.warn({ agent: agent.name, folder: name }, 'seedDefaultAgents: folder not found, skipping');
      }

      await pool.query(
        `INSERT INTO agents (name, description, role_template, system_prompt, skills, knowledge_folders)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          agent.name,
          agent.description,
          agent.role_template ?? agent.role ?? null,
          agent.system_prompt,
          JSON.stringify(agent.skills),
          JSON.stringify(folderIds),
        ],
      );
    }
    logger.info({ count: agents.length }, 'Default agent templates seeded');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to seed default agents (non-critical)');
  }
}

async function main() {
  const { config: appConfig, botConfigStore } = await loadAppConfigFromDB();
  const chatSessionStore = new ChatSessionStore();
  const scheduledTaskStore = new ScheduledTaskStore();
  const discoveredGroupsStore = new DiscoveredGroupStore();
  const logger = createLogger(appConfig.log.level);

  // ── Preflight: validate environment before starting ──
  const preflight = await runPreflight(logger);
  if (!preflight.pass) {
    logger.fatal({ failures: preflight.checks.filter(c => c.status === 'fail') }, 'Preflight check failed — aborting startup');
    process.exit(1);
  }

  // Auto-migrate: sync DB schema with schema.ts definitions
  try {
    const { runAutoMigrate } = await import('./db/auto-migrate.js');
    await runAutoMigrate(logger);
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Auto-migrate failed (non-critical)');
  }

  // Seed default agent templates on first startup
  await seedDefaultAgents(logger);

  // Ensure MEMORY_SECRET env var is available for Claude subprocesses (used by metamemory skill)
  if (appConfig.memory.secret && !process.env.MEMORY_SECRET) {
    process.env.MEMORY_SECRET = appConfig.memory.secret;
  }

  const feishuCount = appConfig.feishuBots.length;
  const telegramCount = appConfig.telegramBots.length;
  const wechatCount = appConfig.wechatBots.length;
  logger.info(
    {
      feishuBots: feishuCount,
      telegramBots: telegramCount,
      wechatBots: wechatCount,
      memoryServerUrl: appConfig.memoryServerUrl,
    },
    'Starting Panmira gateway...',
  );

  // Create bot registry
  const registry = new BotRegistry();

  // Separate proxyOnly bots (no Feishu WS) from normal bots
  const normalFeishuBots = appConfig.feishuBots.filter((b) => !b.proxyOnly);
  const proxyOnlyFeishuBots = appConfig.feishuBots.filter((b) => b.proxyOnly);

  // Initialize Agent Bus, Group Session Manager, and Coordinator for multi-bot collaboration
  const agentBus = new AgentBus(registry, logger);
  const groupSessionManager = new GroupSessionManager(logger);
  const bindingEngine = new BindingEngine(logger);
  const coordinatorConfigStore = new CoordinatorConfigStore();
  const groupCoordinator = new GroupCoordinator(
    registry,
    agentBus,
    groupSessionManager,
    new IntentRouter(logger),
    logger,
    bindingEngine,
    coordinatorConfigStore,
  );
  await groupCoordinator.reloadFromDB();

  // Create Feishu service client early (needed for group name resolution at startup)
  let feishuServiceClient: lark.Client | undefined;
  if (appConfig.feishuService) {
    feishuServiceClient = new lark.Client({
      appId: appConfig.feishuService.appId,
      appSecret: appConfig.feishuService.appSecret,
      disableTokenCache: false,
    });
    logger.info('Feishu service client initialized');
  }

  // Start bots independently so a single platform/API timeout does not
  // take down the whole Panmira process.
  const feishuHandles =
    normalFeishuBots.length > 0
      ? await startBotsSafely(
          normalFeishuBots,
          (bot) =>
            startFeishuBot(
              bot,
              logger,
              appConfig.memoryServerUrl,
              appConfig.memory.secret || undefined,
              groupCoordinator,
              chatSessionStore,
              discoveredGroupsStore,
              feishuServiceClient,
            ),
          logger,
          'feishu',
        )
      : [];

  // Register proxyOnly bots with NullSender — they receive messages via WS proxy_message only
  for (const botConfig of proxyOnlyFeishuBots) {
    const botLogger = logger.child({ bot: botConfig.name });
    const sender = new NullSender();
    const bridge = new MessageBridge(
      botConfig,
      botLogger,
      sender,
      appConfig.memoryServerUrl,
      appConfig.memory.secret || undefined,
      chatSessionStore,
    );
    registry.register({ name: botConfig.name, platform: 'feishu', config: botConfig, bridge, sender });
    botLogger.info('Registered as proxyOnly bot (no Feishu WS connection)');
  }

  const telegramHandles =
    telegramCount > 0
      ? await startBotsSafely(
          appConfig.telegramBots,
          (bot) =>
            startTelegramBot(
              bot,
              logger,
              appConfig.memoryServerUrl,
              appConfig.memory.secret || undefined,
              chatSessionStore,
            ),
          logger,
          'telegram',
        )
      : [];

  const wechatHandles =
    wechatCount > 0
      ? await startBotsSafely(
          appConfig.wechatBots,
          (bot) =>
            startWechatBot(
              bot,
              logger,
              appConfig.memoryServerUrl,
              appConfig.memory.secret || undefined,
              chatSessionStore,
            ),
          logger,
          'wechat',
        )
      : [];

  // Register all bots in the registry
  for (const handle of feishuHandles) {
    registry.register({
      name: handle.name,
      platform: 'feishu',
      config: handle.config,
      bridge: handle.bridge,
      sender: handle.sender,
      feishuClient: handle.feishuClient,
    });
  }

  for (const handle of telegramHandles) {
    registry.register({
      name: handle.name,
      platform: 'telegram',
      config: handle.config,
      bridge: handle.bridge,
      sender: handle.sender,
    });
  }

  // Register web-only bots (no IM platform — accessible via Web UI only)
  for (const webConfig of appConfig.webBots) {
    const botLogger = logger.child({ bot: webConfig.name });
    const sender = new NullSender();
    const bridge = new MessageBridge(
      webConfig,
      botLogger,
      sender,
      appConfig.memoryServerUrl,
      appConfig.memory.secret || undefined,
      chatSessionStore,
    );
    registry.register({ name: webConfig.name, platform: 'web', config: webConfig, bridge, sender });
  }

  for (const handle of wechatHandles) {
    registry.register({
      name: handle.name,
      platform: 'wechat',
      config: handle.config,
      bridge: handle.bridge,
      sender: handle.sender,
    });
  }

  const allNames = [
    ...feishuHandles.map((h) => h.name),
    ...proxyOnlyFeishuBots.map((b) => b.name),
    ...telegramHandles.map((h) => h.name),
    ...appConfig.webBots.map((b) => b.name),
    ...wechatHandles.map((h) => h.name),
  ];
  logger.info({ bots: allNames }, 'All bots started');

  // Create task scheduler
  const scheduler = new TaskScheduler(registry, logger, scheduledTaskStore);

  // Initialize peer manager for cross-instance bot discovery
  let peerManager: PeerManager | undefined;
  if (appConfig.peers.length > 0) {
    peerManager = new PeerManager(appConfig.peers, logger);
    await peerManager.refreshAll();
    const statuses = peerManager.getPeerStatuses();
    const healthyCount = statuses.filter((s) => s.healthy).length;
    logger.info({ peerCount: statuses.length, healthyPeers: healthyCount }, 'Peer manager initialized');
  }

  // Start embedded MetaMemory server
  let memoryServer: ReturnType<typeof startMemoryServer> | undefined;
  if (appConfig.memory.enabled) {
    memoryServer = startMemoryServer({
      port: appConfig.memory.port,
      databaseDir: appConfig.memory.databaseDir,
      secret: appConfig.memory.secret || undefined,
      adminToken: appConfig.memory.adminToken,
      readerToken: appConfig.memory.readerToken,
      logger,
    });
  }

  // Initialize workspace manager and ensure all workspaces exist
  let workspaceManager: WorkspaceManager | undefined;
  if (memoryServer) {
    workspaceManager = new WorkspaceManager(memoryServer.storage, logger);
    await workspaceManager.ensureOrgWorkspace();
    for (const botName of allNames) {
      await workspaceManager.ensureBotWorkspace(botName);
      await workspaceManager.ensureBotProject(botName, '默认');
    }
    logger.info({ botCount: allNames.length }, 'Bot/Org工作空间已初始化');

    // Build initial index documents for org + every bot so the 索引/
    // folder always has an up-to-date _索引 entry from the first request.
    // Without this the index is empty until a document is added (which
    // never happens for static knowledge bases).
    const orgWs = await workspaceManager.ensureOrgWorkspace();
    await workspaceManager.rebuildIndex(orgWs, 'org');
    for (const botName of allNames) {
      const ws = await workspaceManager.ensureBotWorkspace(botName);
      await workspaceManager.rebuildIndex(ws, `bot:${botName}`);
    }
    logger.info({ scope: 'org+bots' }, '索引 文档已初始化');

    // Validate bot-agent consistency and auto-fix mismatches
    await validateBotConsistency(allNames, registry, logger);

    // Sync knowledgeFolders from bot_configs to agents (single source of truth)
    let syncCount = 0;
    for (const botName of allNames) {
      const botInfo = registry.get(botName);
      const agentId = botInfo?.config.agentId;
      const knowledgeFolders = botInfo?.config.knowledgeFolders;
      if (!agentId || !knowledgeFolders || knowledgeFolders.length === 0) continue;
      await pool.query('UPDATE agents SET knowledge_folders = $1 WHERE id = $2', [
        JSON.stringify(knowledgeFolders),
        agentId,
      ]);
      syncCount++;
    }
    logger.info({ syncCount }, '知识库文件夹已从bot_configs同步到agents');

    // Backfill embeddings for existing documents without vectors (background, non-blocking)
    const { DocEmbedder } = await import('./memory/doc-embedder.js');
    const backfillEmbedder = new DocEmbedder(logger);
    backfillEmbedDocuments(backfillEmbedder, logger).catch((err) => {
      logger.warn({ err: err.message }, 'Embedding backfill failed (non-critical)');
    });
  }

  // Initialize group workspaces after Feishu client is available (for name resolution)
  if (workspaceManager) {
    const discoveredGroups = await discoveredGroupsStore.list();
    // Eagerly resolve group names from Feishu API before creating workspaces
    if (feishuServiceClient) {
      for (const g of discoveredGroups.filter((g) => !g.chatName)) {
        try {
          const resp = await feishuServiceClient.im.v1.chat.get({ path: { chat_id: g.chatId } });
          const name = resp?.data?.name;
          if (name) {
            g.chatName = name;
            await discoveredGroupsStore.updateName(g.chatId, name);
          }
        } catch {
          /* ignore */
        }
      }
    }
    for (const group of discoveredGroups) {
      await workspaceManager.ensureGroupWorkspace(group.chatId, group.chatName || undefined);
    }
    logger.info({ groupCount: discoveredGroups.length }, '群协作空间已初始化');
  }

  // Initialize wiki sync service (uses dedicated service app credentials)
  let docSync: DocSync | undefined;
  if (appConfig.feishuService && process.env.WIKI_SYNC_ENABLED !== 'false') {
    const syncMemoryClient = new MemoryClient(appConfig.memoryServerUrl, logger, appConfig.memory.secret || undefined);
    docSync = new DocSync(
      {
        feishuAppId: appConfig.feishuService.appId,
        feishuAppSecret: appConfig.feishuService.appSecret,
        databaseDir: appConfig.memory.databaseDir,
        wikiSpaceName: process.env.WIKI_SPACE_NAME || 'MetaMemory',
        wikiSpaceId: process.env.WIKI_SPACE_ID || undefined,
        throttleMs: process.env.WIKI_SYNC_THROTTLE_MS ? parseInt(process.env.WIKI_SYNC_THROTTLE_MS, 10) : undefined,
      },
      syncMemoryClient,
      logger,
    );
    // Inject into all Feishu bot bridges
    for (const handle of feishuHandles) {
      handle.bridge.setDocSync(docSync);
    }
    // Enable auto wiki sync on MetaMemory changes (debounced)
    if (process.env.WIKI_AUTO_SYNC !== 'false') {
      const debounceMs = process.env.WIKI_AUTO_SYNC_DEBOUNCE_MS
        ? parseInt(process.env.WIKI_AUTO_SYNC_DEBOUNCE_MS, 10)
        : 5000;
      docSync.startAutoSync(debounceMs);
    }
    logger.info('Wiki sync service initialized (auto-sync enabled, /sync for manual trigger)');
  }

  // Initialize cross-platform session registry
  const sessionRegistry = new SessionRegistry(logger);
  // Inject into all bot bridges
  for (const info of registry.list()) {
    const bot = registry.get(info.name);
    if (bot) bot.bridge.setSessionRegistry(sessionRegistry);
  }

  // Wire OutputArchiver into GroupCoordinator for group collaboration archiving
  for (const entry of registry.list()) {
    const bot = registry.get(entry.name);
    if (bot) {
      groupCoordinator.setOutputArchiver(bot.bridge.getOutputArchiver());
      if (workspaceManager) {
        bot.bridge.setWorkspaceManager(workspaceManager);
      }
    }
  }
  if (workspaceManager) {
    groupCoordinator.setWorkspaceManager(workspaceManager);
  }

  // Resolve bots config path for API-driven bot CRUD
  // botsConfigPath removed — Panmira uses DB-only configuration

  // Recover: notify chats that had tasks interrupted by a previous restart
  const allBridgesForRecovery = [
    ...feishuHandles.map((h) => h.bridge),
    ...telegramHandles.map((h) => h.bridge),
    ...wechatHandles.map((h) => h.bridge),
  ];
  for (const bridge of allBridgesForRecovery) {
    try {
      const count = await bridge.notifyOrphanedTasks();
      if (count > 0) {
        logger.info({ count }, 'Sent task recovery notifications');
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed to check for orphaned tasks');
    }
  }

  // Start API server
  const { server: apiServer, broadcastAll } = await startApiServer({
    port: appConfig.api.port,
    secret: appConfig.api.secret,
    registry,
    scheduler,
    logger,
    docSync,
    feishuServiceClient,
    peerManager,
    memoryServerUrl: appConfig.memoryServerUrl,
    memoryAuthToken:
      appConfig.memory.adminToken || appConfig.memory.readerToken || appConfig.memory.secret || undefined,
    sessionRegistry,
    botConfigStore,
    chatSessionStore,
    agentBus,
    groupSessionManager,
    bindingEngine,
    coordinatorConfigStore,
    groupCoordinator,
    discoveredGroupsStore,
    workspaceManager,
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down...');

    // Immediately notify all active chat users about restart
    broadcastAll({ type: 'server_shutdown', reason: signal, message: 'Server is restarting...' });

    // Immediately destroy all bridges — sends error cards to active chats
    // so users see "会话因重启中断" instead of a hung "thinking" state.
    // This must happen BEFORE PM2 kill_timeout (15s) expires.
    const allBridges = [
      ...feishuHandles.map((h) => h.bridge),
      ...telegramHandles.map((h) => h.bridge),
      ...wechatHandles.map((h) => h.bridge),
    ];
    for (const bridge of allBridges) {
      bridge.destroy();
    }

    scheduler.destroy();
    if (peerManager) {
      peerManager.destroy();
    }

    // Give running tasks a brief window to flush (5s max), then proceed
    const busyBridges = allBridges.filter((b) => b.getRunningTasksInfo().length > 0);
    if (busyBridges.length > 0) {
      logger.info({ count: busyBridges.length }, 'Waiting briefly for tasks to flush...');
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    }

    apiServer.close();
    if (docSync) {
      docSync.destroy();
    }
    sessionRegistry.close();
    if (memoryServer) {
      memoryServer.server.close();
      memoryServer.storage.close();
    }
    for (const handle of telegramHandles) {
      handle.bot.stop();
    }
    for (const handle of wechatHandles) {
      handle.stop();
    }
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch {
      /* ignore */
    }
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown('SIGINT').catch((err) => { logger.error({ err }, 'Shutdown error on SIGINT'); process.exit(1); }); });
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch((err) => { logger.error({ err }, 'Shutdown error on SIGTERM'); process.exit(1); }); });
}

async function startBotsSafely<TConfig extends BotConfigBase, THandle>(
  bots: TConfig[],
  starter: (bot: TConfig) => Promise<THandle>,
  logger: Logger,
  platform: 'feishu' | 'telegram' | 'wechat',
): Promise<THandle[]> {
  const results = await Promise.allSettled(bots.map((bot) => starter(bot)));
  const handles: THandle[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const bot = bots[i];
    if (!result || !bot) continue;

    if (result.status === 'fulfilled') {
      handles.push(result.value);
      continue;
    }

    logger.error(
      { err: result.reason, botName: bot.name, platform },
      'Failed to start bot; continuing with remaining bots',
    );
  }

  return handles;
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
