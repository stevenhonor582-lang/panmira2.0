import { pool } from "../../db/index.js";
import * as fs from 'node:fs';
import type * as http from 'node:http';
import { installSkillsToWorkDir, installSkillsWithStaging } from '../skills-installer.js';
import { webBotFromJson, feishuBotFromJson, telegramBotFromJson, wechatBotFromJson } from '../../config.js';
import { resolveEngineName } from '../../engines/index.js';
import { NullSender } from '../../web/null-sender.js';
import { MessageBridge } from '../../bridge/message-bridge.js';
import { startFeishuBot } from '../../feishu/feishu-bot-starter.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { initWorkspaceSkeleton } from '../../workspace-init.js';
import type { RouteContext } from './types.js';

export async function handleBotRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const { registry, logger, peerManager, memoryServerUrl, memoryAuthToken, ws, botConfigStore } = ctx;

  // GET /api/bots/:name/profile — detailed bot profile with stats
  if (method === 'GET' && /^\/api\/bots\/[^/]+\/profile$/.test(url)) {
    const botName = decodeURIComponent(url.split('/')[3]);
    const bot = registry.get(botName);
    if (!bot) {
      jsonResponse(res, 404, { error: `Bot not found: ${botName}` });
      return true;
    }
    const stats = bot.bridge.costTracker.getStats();
    const botStats = stats.byBot[botName];
    jsonResponse(res, 200, {
      name: bot.name,
      description: bot.config.description,
      specialties: bot.config.specialties,
      icon: bot.config.icon,
      platform: bot.platform,
      engine: resolveEngineName(bot.config),
      model: defaultModelForConfig(bot.config),
      workingDirectory: bot.config.claude.defaultWorkingDirectory,
      maxConcurrentTasks: bot.config.maxConcurrentTasks,
      budgetLimitDaily: bot.config.budgetLimitDaily,
      stats: botStats || { totalTasks: 0, completedTasks: 0, failedTasks: 0, totalCostUsd: 0 },
    });
    return true;
  }

  // GET /api/bots
  if (method === 'GET' && url === '/api/bots') {
    const localBots = registry.list();
    const runningNames = new Set(localBots.map((b) => b.name));

    // R36-3: 一次性查 bot_configs.agent_id(实例绑定) + 对应 agent.name
    // 这是入口"空闲/占用/已绑"状态的权威来源,避免前端扫全表错配。
    let agentNameById = new Map<string, string>();
    let agentBoundByName = new Map<string, string | null>();
    if (botConfigStore) {
      try {
        const result = await pool.query(
          `SELECT bc.name AS bot_name, bc.agent_id::text AS agent_id, a.name AS agent_name
             FROM bot_configs bc
             LEFT JOIN agent_instances a ON a.id::text = bc.agent_id::text`
        );
        for (const r of result.rows) {
          agentBoundByName.set(r.bot_name, r.agent_id ?? null);
          if (r.agent_id && r.agent_name) {
            agentNameById.set(r.agent_id, r.agent_name);
          }
        }
      } catch { /* best-effort,降级到原行为 */ }
    }

    // Enrich with bot_id/remark/display_name/agent_id(实例绑定) from DB
    if (botConfigStore) {
      try {
        const allRows = await botConfigStore.listAll();
        const rowMap = new Map(allRows.map(r => [r.name, r]));
        for (const bot of localBots) {
          const row = rowMap.get(bot.name);
          if (row) {
            (bot as any).remark = (row.configJson as any)?.remark || row.remark || '';
            (bot as any).bot_id = row.botId || '';
            (bot as any).display_name = row.displayName || ((bot as any).remark ? bot.name + '--' + (bot as any).remark : bot.name);
          }
          // R36-3: 注入实例绑定状态(权威来源)
          const boundAgentId = agentBoundByName.get(bot.name) ?? null;
          (bot as any).agent_id = boundAgentId;
          (bot as any).agent_name = boundAgentId ? agentNameById.get(boundAgentId) ?? null : null;
        }
      } catch { /* best-effort */ }
    }
    const peerBots = peerManager?.getPeerBots() ?? [];

    // Include paused bots from DB
    let pausedBots: any[] = [];
    if (botConfigStore) {
      try {
        const allRows = await botConfigStore.listAll();
        pausedBots = allRows
          .filter((r) => !runningNames.has(r.name))
          .map((r) => {
            const boundAgentId = agentBoundByName.get(r.name) ?? null;
            return {
              name: r.name,
              platform: r.platform,
              engine: 'paused',
              workingDirectory: (r.configJson as any).defaultWorkingDirectory || '',
              description: (r.configJson as any).description || '',
              remark: (r.configJson as any).remark || r.remark || '',
              bot_id: r.botId || '',
              display_name: r.displayName || ((r.configJson as any).remark ? r.name + '--' + (r.configJson as any).remark : r.name),
              paused: true,
              // R36-3: 暂停的 bot 也要带绑定状态,前端才能正确分类
              agent_id: boundAgentId,
              agent_name: boundAgentId ? agentNameById.get(boundAgentId) ?? null : null,
            };
          });
      } catch {
        /* ignore */
      }
    }

    jsonResponse(res, 200, { bots: [...localBots, ...pausedBots, ...peerBots] });
    return true;
  }

  // GET /api/peers
  if (method === 'GET' && url === '/api/peers') {
    jsonResponse(res, 200, { peers: peerManager?.getPeerStatuses() ?? [] });
    return true;
  }

  // POST /api/bots — create a new bot
  if (method === 'POST' && url === '/api/bots') {
    if (!botConfigStore) {
      jsonResponse(res, 400, { error: 'Bot CRUD requires database (BotConfigStore)' });
      return true;
    }
    const body = await parseJsonBody(req);
    const platform = body.platform as string;
    const name = body.name as string;
    const remark = (body.remark as string) || '';

    if (!platform || !name) {
      jsonResponse(res, 400, { error: 'Missing required fields: platform, name' });
      return true;
    }
    if (platform !== 'feishu' && platform !== 'telegram' && platform !== 'web') {
      jsonResponse(res, 400, { error: 'platform must be "feishu", "telegram", or "web"' });
      return true;
    }

    let entry: Record<string, unknown>;
    if (platform === 'feishu') {
      const appId = body.feishuAppId as string;
      const appSecret = body.feishuAppSecret as string;
      const workDir = body.defaultWorkingDirectory as string;
      if (!appId || !appSecret || !workDir) {
        jsonResponse(res, 400, { error: 'Feishu bot requires: feishuAppId, feishuAppSecret, defaultWorkingDirectory' });
        return true;
      }
      entry = {
        name,
        remark,
        ...(body.description ? { description: body.description } : {}),
        ...(body.engine ? { engine: body.engine } : {}),
        ...(body.codex ? { codex: body.codex } : {}),
        ...(body.kimi ? { kimi: body.kimi } : {}),
        ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.agentId ? { agentId: body.agentId } : {}),
        ...(body.openaiCompat ? { openaiCompat: body.openaiCompat } : {}),
        ...(body.apiKey ? { apiKey: body.apiKey } : {}),
        ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
        feishuAppId: appId,
        feishuAppSecret: appSecret,
        defaultWorkingDirectory: workDir,
        ...(body.maxTurns ? { maxTurns: body.maxTurns } : {}),
        ...(body.maxBudgetUsd ? { maxBudgetUsd: body.maxBudgetUsd } : {}),
        ...(body.model ? { model: body.model } : {}),
      };
    } else if (platform === 'telegram') {
      const token = body.telegramBotToken as string;
      const workDir = body.defaultWorkingDirectory as string;
      if (!token || !workDir) {
        jsonResponse(res, 400, { error: 'Telegram bot requires: telegramBotToken, defaultWorkingDirectory' });
        return true;
      }
      entry = {
        name,
        remark,
        ...(body.description ? { description: body.description } : {}),
        ...(body.engine ? { engine: body.engine } : {}),
        ...(body.codex ? { codex: body.codex } : {}),
        ...(body.kimi ? { kimi: body.kimi } : {}),
        ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.agentId ? { agentId: body.agentId } : {}),
        ...(body.openaiCompat ? { openaiCompat: body.openaiCompat } : {}),
        ...(body.apiKey ? { apiKey: body.apiKey } : {}),
        ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
        telegramBotToken: token,
        defaultWorkingDirectory: workDir,
        ...(body.maxTurns ? { maxTurns: body.maxTurns } : {}),
        ...(body.maxBudgetUsd ? { maxBudgetUsd: body.maxBudgetUsd } : {}),
        ...(body.model ? { model: body.model } : {}),
      };
    } else {
      const workDir = body.defaultWorkingDirectory as string;
      if (!workDir) {
        jsonResponse(res, 400, { error: 'Web bot requires: defaultWorkingDirectory' });
        return true;
      }
      entry = {
        name,
        remark,
        ...(body.description ? { description: body.description } : {}),
        ...(body.engine ? { engine: body.engine } : {}),
        ...(body.codex ? { codex: body.codex } : {}),
        ...(body.kimi ? { kimi: body.kimi } : {}),
        ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.agentId ? { agentId: body.agentId } : {}),
        ...(body.openaiCompat ? { openaiCompat: body.openaiCompat } : {}),
        defaultWorkingDirectory: workDir,
        ...(body.maxTurns ? { maxTurns: body.maxTurns } : {}),
        ...(body.maxBudgetUsd ? { maxBudgetUsd: body.maxBudgetUsd } : {}),
        ...(body.model ? { model: body.model } : {}),
      };
    }

    try {
      const workDir = body.defaultWorkingDirectory as string;
      fs.mkdirSync(workDir, { recursive: true });

      if (body.initWorkspace !== false) {
        const result = initWorkspaceSkeleton(workDir, name, (body.description as string) || name, logger);
        entry.knowledgeFolders = result.knowledgeFolders;
      }

      await botConfigStore.create(platform, entry);
      logger.info({ name, platform }, 'Bot added to DB');

      if (body.installSkills) {
        installSkillsWithStaging(workDir, logger, { platform: platform as 'feishu' | 'telegram' | 'web' });
      }

      let activated = false;
      if (platform === 'web') {
        const config = await webBotFromJson(entry as any, ctx.providerConfigStore ?? null);
        const sender = new NullSender();
        const bridge = new MessageBridge(
          config,
          logger,
          sender,
          memoryServerUrl || 'http://localhost:8100',
          memoryAuthToken,
          ctx.chatSessionStore,
        );
        registry.register({ name, platform: 'web', config, bridge, sender });
        wireActivityEvents(name, ctx);
        activated = true;
        logger.info({ name }, 'Web bot activated immediately');
        ws.handle?.broadcastBotList();
      } else if (platform === 'feishu') {
        try {
          const config = await feishuBotFromJson(entry as any, ctx.providerConfigStore ?? null);
          const handle = await startFeishuBot(
            config,
            logger,
            memoryServerUrl || 'http://localhost:8100',
            memoryAuthToken,
          );
          registry.register({
            name,
            platform: 'feishu',
            config,
            bridge: handle.bridge,
            sender: handle.sender,
            feishuClient: handle.feishuClient,
            feishuWsClient: handle.wsClient,
          });
          wireActivityEvents(name, ctx);
          activated = true;
          logger.info({ name }, 'Feishu bot hot-registered');
          ws.handle?.broadcastBotList();
        } catch (activateErr: any) {
          logger.warn(
            { name, err: activateErr?.message },
            'Feishu bot saved to DB but activation failed; will activate on next restart',
          );
        }
      }

      const message = activated ? 'Bot added and activated.' : 'Bot added. Will activate on next server restart.';
      jsonResponse(res, 201, { name, platform, workingDirectory: workDir, message });
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        jsonResponse(res, 409, { error: err.message });
      } else {
        throw err;
      }
    }
    return true;
  }

  // GET /api/memories — structured memories overview (RAG v1-v2.6)
  if (method === "GET" && url.split("?")[0] === "/api/memories") {
    const qp = new URL(url, `http://${req.headers.host || 'localhost'}`).searchParams;
    const botName = qp.get('bot') || undefined;
    try {
      // 2026-06-17: use bot_id (uuid) with name->bot_id subquery instead of deprecated agent_id.
      let query = `SELECT id, subject, subject_normalized, type, polarity, confidence,
               hit_count, last_hit_at, LEFT(content,200) AS preview, created_at
        FROM memories WHERE invalidated_at IS NULL AND subject_normalized IS NOT NULL`;
      const params: any[] = [];
      if (botName) {
        query += ` AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1)`;
        params.push(botName);
      }
      query += ` ORDER BY hit_count DESC, confidence DESC LIMIT 50`;
      const { rows } = await pool.query(query, params);
      jsonResponse(res, 200, { memories: rows });
    } catch (err: any) { jsonResponse(res, 500, { error: err.message }); }
    return true;
  }

  // GET /api/memories/stats — aggregate per type per bot
  if (method === "GET" && url.split("?")[0] === "/api/memories/stats") {
    try {
      // 2026-06-17: use bot_id (uuid FK) instead of the deprecated agent_id (text).
      const { rows } = await pool.query(
        `SELECT COALESCE(bc.name, m.bot_id::text) AS bot, m.type, COUNT(*) AS cnt,
                ROUND(AVG(m.confidence)::numeric,2) AS avg_conf, SUM(m.hit_count) AS total_hits
           FROM memories m LEFT JOIN bot_configs bc ON bc.bot_id = m.bot_id
          WHERE m.invalidated_at IS NULL AND m.subject_normalized IS NOT NULL
          GROUP BY 1,2 ORDER BY 3 DESC`
      );
      jsonResponse(res, 200, { stats: rows });
    } catch (err: any) { jsonResponse(res, 500, { error: err.message }); }
    return true;
  }

  // POST /api/bots/:name/pause — pause a running bot (disconnect)
  if (method === 'POST' && /^\/api\/bots\/[^/]+\/pause$/.test(url)) {
    const name = decodeURIComponent(url.split('/')[3]);
    const bot = registry.get(name);
    if (!bot) {
      jsonResponse(res, 404, { error: `Bot not found or not running: ${name}` });
      return true;
    }
    registry.deregister(name);
    if (botConfigStore) await botConfigStore.setActive(name, false);
    logger.info({ name }, 'Bot paused');
    ws.handle?.broadcastBotList();
    jsonResponse(res, 200, { name, paused: true });
    return true;
  }

  // POST /api/bots/:name/resume — resume a paused bot (reconnect)
  if (method === 'POST' && /^\/api\/bots\/[^/]+\/resume$/.test(url)) {
    const name = decodeURIComponent(url.split('/')[3]);
    if (registry.get(name)) {
      jsonResponse(res, 400, { error: `Bot already running: ${name}` });
      return true;
    }
    if (!botConfigStore) {
      jsonResponse(res, 400, { error: 'Resume requires database' });
      return true;
    }
    const row = await botConfigStore.findByName(name);
    if (!row) {
      jsonResponse(res, 404, { error: `Bot not found: ${name}` });
      return true;
    }

    await botConfigStore.setActive(name, true);
    const secrets = await botConfigStore.getAllSecrets(name);
    const merged = { ...row.configJson };
    if (secrets.feishu_app_secret) (merged as any).feishuAppSecret = secrets.feishu_app_secret;
    if (secrets.openai_api_key) (merged as any).openaiApiKey = secrets.openai_api_key;
    if (secrets.api_key) (merged as any).apiKey = secrets.api_key;
    if (secrets.telegram_bot_token) (merged as any).telegramBotToken = secrets.telegram_bot_token;

    try {
      if (row.platform === 'feishu') {
        const config = await feishuBotFromJson(merged as any, ctx.providerConfigStore ?? null);
        const handle = await startFeishuBot(
          config,
          logger,
          memoryServerUrl || 'http://localhost:8100',
          memoryAuthToken,
        );
        registry.register({
          name,
          platform: 'feishu',
          config,
          bridge: handle.bridge,
          sender: handle.sender,
          feishuClient: handle.feishuClient,
          feishuWsClient: handle.wsClient,
        });
        wireActivityEvents(name, ctx);
      } else if (row.platform === 'web') {
        const config = await webBotFromJson(merged as any, ctx.providerConfigStore ?? null);
        const sender = new NullSender();
        const bridge = new MessageBridge(
          config,
          logger,
          sender,
          memoryServerUrl || 'http://localhost:8100',
          memoryAuthToken,
          ctx.chatSessionStore,
        );
        registry.register({ name, platform: 'web', config, bridge, sender });
        wireActivityEvents(name, ctx);
      } else {
        jsonResponse(res, 400, { error: `Resume not supported for platform: ${row.platform}` });
        return true;
      }
      logger.info({ name }, 'Bot resumed');
      ws.handle?.broadcastBotList();
      jsonResponse(res, 200, { name, resumed: true });
    } catch (err: any) {
      logger.error({ name, err: err?.message }, 'Bot resume failed');
      jsonResponse(res, 500, { error: `Resume failed: ${err?.message}` });
    }
    return true;
  }

  // PUT /api/bots/:name — update an existing bot (DB + hot reload)
  if (method === 'PUT' && url.startsWith('/api/bots/')) {
    const name = decodeURIComponent(url.slice('/api/bots/'.length));
    if (!name) {
      jsonResponse(res, 400, { error: 'Missing bot name' });
      return true;
    }

    const body = await parseJsonBody(req);

    // Save to DB if available
    if (botConfigStore) {
      const updated = await botConfigStore.update(name, body);
      if (!updated) {
        jsonResponse(res, 404, { error: `Bot not found: ${name}` });
        return true;
      }
    }

    // Hot reload: rebuild config from DB row and apply to running bot
    if (botConfigStore) {
      try {
        const row = await botConfigStore.findByName(name);
        if (row) {
          const secrets = await botConfigStore.getAllSecrets(name);
          const merged = { ...row.configJson };
          if (secrets.feishu_app_secret) (merged as any).feishuAppSecret = secrets.feishu_app_secret;
          if (secrets.openai_api_key) (merged as any).openaiApiKey = secrets.openai_api_key;
          // api_key removed from bot_secrets in Phase 2 (now in provider_configs)
          if (secrets.telegram_bot_token) (merged as any).telegramBotToken = secrets.telegram_bot_token;
          if (secrets.wechat_bot_token) (merged as any).wechatBotToken = secrets.wechat_bot_token;

          let newConfig: import('../../config.js').BotConfigBase | undefined;
          // Phase 2: pass providerConfigStore so providerId resolves to provider record
          if (row.platform === 'feishu') {
            newConfig = await feishuBotFromJson(merged as any, ctx.providerConfigStore ?? null);
          } else if (row.platform === 'telegram') {
            newConfig = await telegramBotFromJson(merged as any, ctx.providerConfigStore ?? null);
          } else if (row.platform === 'web') {
            newConfig = await webBotFromJson(merged as any, ctx.providerConfigStore ?? null);
          }
          if (newConfig) {
            registry.updateConfig(name, newConfig);
            logger.info({ name }, 'Bot config hot-reloaded from DB');
          }
        }
      } catch (reloadErr: any) {
        logger.warn({ name, err: reloadErr?.message }, 'Hot reload failed; config saved to DB');
      }
    }

    logger.info({ name, updates: Object.keys(body) }, 'Bot config updated');
    ws.handle?.broadcastBotList();
    jsonResponse(res, 200, { name, updated: true });
    return true;
  }

  // GET /api/bots/:name
  if (method === 'GET' && url.startsWith('/api/bots/')) {
    const name = decodeURIComponent(url.slice('/api/bots/'.length));
    if (!name) {
      jsonResponse(res, 400, { error: 'Missing bot name' });
      return true;
    }

    const running = registry.get(name);
    const runningInfo = running
      ? { running: true, workingDirectory: running.config.claude.defaultWorkingDirectory }
      : { running: false };

    if (botConfigStore) {
      const row = await botConfigStore.findByName(name);
      if (row) {
        // Strip sensitive fields before sending to client
        const safeConfig = { ...row.configJson };
        delete (safeConfig as any).feishuAppSecret;
        delete (safeConfig as any).openaiApiKey;
        delete (safeConfig as any).apiKey;
        delete (safeConfig as any).telegramBotToken;
        delete (safeConfig as any).wechatBotToken;

        // Add credential hints for edit form (decrypted, user can verify)
        const secrets = await botConfigStore.getAllSecrets(name);
        if (secrets.feishu_app_secret) {
          (safeConfig as any).feishuAppSecret = secrets.feishu_app_secret;
        }
        if (secrets.api_key) {
          (safeConfig as any).apiKey = secrets.api_key;
        }
        if (secrets.openai_api_key) {
          (safeConfig as any).openaiApiKey = secrets.openai_api_key;
        }

        jsonResponse(res, 200, { name, platform: row.platform, ...runningInfo, config: safeConfig });
        return true;
      }
    }

    if (running) {
      jsonResponse(res, 200, { name, platform: running.platform, ...runningInfo });
      return true;
    }

    jsonResponse(res, 404, { error: `Bot not found: ${name}` });
    return true;
  }

  // DELETE /api/bots/:name
  if (method === 'DELETE' && url.startsWith('/api/bots/')) {
    const name = decodeURIComponent(url.slice('/api/bots/'.length));
    if (!name) {
      jsonResponse(res, 400, { error: 'Missing bot name' });
      return true;
    }

    try {
      let removed = false;
      if (botConfigStore) {
        removed = await botConfigStore.delete(name);
      }
      if (!removed && registry.get(name)) {
        removed = true;
      }
      if (!removed) {
        jsonResponse(res, 404, { error: `Bot not found: ${name}` });
        return true;
      }
      registry.deregister(name);
      logger.info({ name }, 'Bot removed');
      ws.handle?.broadcastBotList();
      jsonResponse(res, 200, { name, removed: true, message: 'Bot removed.' });
    } catch (err: any) {
      throw err;
    }
    return true;
  }

  return false;
}

function defaultModelForConfig(config: import('../../config.js').BotConfigBase): string | undefined {
  switch (resolveEngineName(config)) {
    case 'claude':
      return config.claude.model;
    case 'kimi':
      return config.kimi?.model;
    case 'codex':
      return config.codex?.model || config.codex?.displayModel;
    case 'openai-compat':
      return config.openaiCompat?.model;
  }
}

function wireActivityEvents(botName: string, ctx: RouteContext): void {
  const bot = ctx.registry.get(botName);
  if (!bot || !ctx.activityStore) return;
  bot.bridge.onActivityEvent = (event) => {
    ctx.activityStore!.record(event).then((recorded) => {
      ctx.ws.handle?.broadcastAll({ type: 'activity_event', event: recorded });
    });
  };
}
