import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as net from 'node:net';
import { RateLimiter } from './rate-limiter.js';
import * as path from 'node:path';
import type * as lark from '@larksuiteoapi/node-sdk';
import type { Logger } from '../utils/logger.js';
import type { BotRegistry } from './bot-registry.js';
import type { TaskScheduler } from '../scheduler/task-scheduler.js';
import type { DocSync } from '../sync/doc-sync.js';
import type { PeerManager } from './peer-manager.js';

import { AsyncTaskStore } from './async-task-store.js';
import { setupWebSocketServer, serveStaticFiles, type WebSocketHandle } from '../web/ws-server.js';
import { setPipelineWsHandle } from './pipeline-events.js';
import { IntentRouter } from './intent-router.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { BudgetManager } from './budget-manager.js';
import { BudgetStore } from '../db/budget-store.js';
import { TeamManager } from './team-manager.js';
import { VoiceMeetingService } from './voice-meeting.js';
import { VoiceIdentityStore } from './voice-identity.js';
import { VoiceIdentityDBStore } from '../db/voice-identity-store.js';
import { RtcVoiceChatService } from './rtc-voice-chat.js';
import { ActivityStore } from './activity-store.js';
import { SkillHubStore } from './skill-hub-store.js';
import { UserStore } from '../db/user-store.js';
import { AgentStore } from '../db/agent-store.js';
import { ProviderConfigStore } from '../db/provider-config-store.js';
import { DiscoveredGroupStore } from '../db/discovered-group-store.js';
import { handleAuthRoutes } from './routes/auth-routes.js';
import { handleOAuthRoutes } from './routes/oauth-routes.js';
import { handleResourceRoutes } from './routes/resource-routes.js';
import { handleRuntimeRoutes } from './routes/runtime-routes.js';
import { handleSkillDagRoutes } from './routes/skill-dag-routes.js';
import { handleScheduledJobsRoutes } from './routes/scheduled-jobs-routes.js';
import { handleAgentRunLogsRoutes } from "./routes/agent-run-logs-routes.js";
import { handlePipelineRoutes } from "./routes/pipeline-routes.js";
// R20: AI DAG generator — must dispatch before pipeline-routes (:id regex)
import { handlePipelineAiGenerate } from "./routes/pipeline-ai-generate-routes.js";
import { handleAdminCacheRoutes } from "./routes/admin-cache-routes.js";
import { handleR9MockEndpoints } from './routes/r9-mock-endpoints-routes.js';
import { handleR10DataRoutes } from './routes/r10-data-routes.js';
import { handleDashboardAggregateRoutes } from './routes/dashboard-aggregate-routes.js';
import { handleBillingAggregateRoutes } from './routes/billing-aggregate-routes.js'; // R14-D
import { handleAdminRateLimitRoutes } from "./routes/admin-ratelimit-routes.js";
import { handleKnowledgeBaseRoutes } from './routes/knowledge-base-routes.js';
import { handleAgentKnowledgeRoutes } from './routes/agent-knowledge-routes.js';
import { handleAgentRunRoutes } from './routes/agent-run-routes.js';
import { handleOAuthClientRoutes } from './routes/oauth-client-routes.js';
import { handleReportsRoutes } from './routes/reports-routes.js';
import { handleDashboardRoutes } from './routes/dashboard-routes.js';
import { handleModelsPoolRoutes } from './routes/models-pool-routes.js';
import { handleAgentsCrudRoutes } from './routes/agents-crud-routes.js';
import { handleChannelsRoutes } from './routes/channels-routes.js';
import { handleMonitoringRoutes } from './routes/monitoring-routes.js';
// IA v6: 新路由(2026-07-08)
import { handleOverviewRoutes } from './routes/overview-routes.js';
import { handlePeopleRoutes } from './routes/people-routes.js';
import { handleEmployeesRoutes } from './routes/employees-routes.js';
import { handleHrRoutes } from './routes/hr-routes.js'; // R52-SCHEMA: 数字 HR CRUD
import { handleDigitalEmployeeRoutes } from './routes/digital-employee-routes.js'; // R52-SCHEMA: 招聘/提炼
import { handleV3HealthRoutes } from './routes/v3-health-routes.js';
import { handleV3ListRoutes } from './routes/v3-list-routes.js';
import { handleV3OpenApiRoutes } from './routes/v3-openapi-routes.js'; // R49-B Step 6
import { markV1Deprecated, hookResForDeprecation } from './middleware/v1-deprecation.js'; // R49-B Step 7
import { handleTasksRoutes } from './routes/tasks-routes.js';
import { handleFoundationRoutes } from './routes/foundation-routes.js';
import { handleFoundationMemoryRoutes } from './routes/foundation-memory-routes.js';
import { handleFoundationKbRoutes } from './routes/foundation-kb-routes.js';
import { handleChannelsRoutesV6 } from './routes/channels-routes.js';
import { handleRoutingRulesRoutes } from './routes/routing-rules-routes.js';
import { handleModelsV6Routes } from './routes/models-routes.js';
import { addDeprecationHeader } from './routes/helpers.js';
import { handleOpsRoutes } from './routes/ops-routes.js';
import { handleTenantQuotaRoutes } from './routes/tenant-quota-routes.js';
import { handleMaintenanceRoutes } from './routes/maintenance-routes.js';
import { handleChannelUsageRoutes } from './routes/channel-usage-routes.js';
import { handleEmbeddingJobsRoutes } from './routes/embedding-jobs-routes.js';
import { handleReportsExportRoutes } from './routes/reports-export-routes.js';
import { verifyAccessToken } from './middleware.js';
import { metrics as _metrics } from '../utils/metrics.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { AgentBus } from './agent-bus.js';
import type { GroupSessionManager } from './group-session.js';
import { BindingEngine } from './routing-bindings.js';
import {
  jsonResponse,
  handleVoiceRoutes,
  handleFileRoutes,
  handleTeamRoutes,
  handleTaskRoutes,
  handleBotRoutes,
  handleSyncRoutes,
  handleRtcRoutes,
  handleSessionRoutes,
  handleSkillHubRoutes,
  handleSkillCatalogRoutes,
  handleProjectRoutes,
  handleBindingRoutes,
  handleProviderRoutes,
  handleMemoryRoutes,
  handleAdminMemoryRoutes,
  handleGenerateRoutes,
  handleWorkspaceRoutes,
  handleTemplateRoutes,
  handleKnowledgeRoutes,
} from './routes/index.js';
import type { RouteContext } from './routes/index.js';

interface ApiServerOptions {
  port: number;
  secret?: string;
  registry: BotRegistry;
  scheduler: TaskScheduler;
  logger: Logger;
  docSync?: DocSync;
  feishuServiceClient?: lark.Client;
  peerManager?: PeerManager;
  memoryServerUrl?: string;
  memoryAuthToken?: string;
  circuitBreaker?: CircuitBreaker;
  budgetManager?: BudgetManager;
  teamManager?: TeamManager;
  sessionRegistry?: SessionRegistry;
  botConfigStore?: import('../db/bot-config-store.js').BotConfigStore;
  chatSessionStore?: import('../db/chat-session-store.js').ChatSessionStore;
  agentBus?: AgentBus;
  groupSessionManager?: GroupSessionManager;
  bindingEngine?: BindingEngine;
  coordinatorConfigStore?: import('../db/coordinator-config-store.js').CoordinatorConfigStore;
  groupCoordinator?: import('./group-coordinator.js').GroupCoordinator;
  discoveredGroupsStore?: DiscoveredGroupStore;
  workspaceManager?: import('../memory/workspace-manager.js').WorkspaceManager;
}

const startTime = Date.now();
const rateLimiter = new RateLimiter(60000, 600); // 600 req/min per IP (allow 6 parallel fetches × 100 reloads/min)
// Expose start time for metrics route
(globalThis as any).__panmira_start_time = startTime;

export interface ApiServerResult { server: http.Server; broadcastAll: (msg: Record<string, unknown>) => void; }

export async function startApiServer(options: ApiServerOptions): Promise<ApiServerResult> {
  const {
    port,
    secret,
    registry,
    scheduler,
    logger,
    docSync,
    feishuServiceClient,
    peerManager,
    memoryServerUrl,
    memoryAuthToken,
  } = options;
  const host = secret ? '0.0.0.0' : '127.0.0.1';

  // Initialize shared services
  const asyncTaskStore = new AsyncTaskStore();
  await asyncTaskStore.init();
  const intentRouter = new IntentRouter(logger);
  const circuitBreaker = options.circuitBreaker ?? new CircuitBreaker(logger);
  await circuitBreaker.init();
  const budgetManager = options.budgetManager ?? new BudgetManager(logger, new BudgetStore());
  const teamManager = options.teamManager ?? new TeamManager(logger);

  function readBody(incoming: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (c: Buffer) => chunks.push(c));
      incoming.on('end', () => resolve(Buffer.concat(chunks).toString()));
      incoming.on('error', reject);
    });
  }
  const meetingService = new VoiceMeetingService(registry, logger);
  const voiceIdentityStore = new VoiceIdentityStore(logger, new VoiceIdentityDBStore());
  const activityStore = new ActivityStore(logger);
  const skillHubStore = new SkillHubStore(path.join(process.cwd(), 'data'), logger);
  const userStore = new UserStore();
  const agentStore = new AgentStore();
  const providerConfigStore = new ProviderConfigStore();
  const discoveredGroupsStore = options.discoveredGroupsStore ?? new DiscoveredGroupStore();
  const rtcService = new RtcVoiceChatService(logger);
  if (rtcService.isConfigured()) {
    logger.info('RTC voice chat service enabled');
  }

  const ws: { handle?: WebSocketHandle } = {};

  // Build route context (shared across all route handlers)
  const ctx: RouteContext = {
    registry,
    scheduler,
    logger,
    docSync,
    feishuServiceClient,
    peerManager,
    memoryServerUrl,
    memoryAuthToken,
    asyncTaskStore,
    intentRouter,
    circuitBreaker,
    budgetManager,
    teamManager,
    meetingService,
    voiceIdentityStore,
    rtcService: rtcService.isConfigured() ? rtcService : undefined,
    ws,
    sessionRegistry: options.sessionRegistry,
    botConfigStore: options.botConfigStore,
    chatSessionStore: options.chatSessionStore,
    activityStore,
    skillHubStore,
    agentBus: options.agentBus,
    groupSessionManager: options.groupSessionManager,
    bindingEngine: options.bindingEngine,
    coordinatorConfigStore: options.coordinatorConfigStore,
    groupCoordinator: options.groupCoordinator,
    discoveredGroupsStore,
    providerConfigStore,
    workspaceManager: options.workspaceManager,
  };

  // Route handlers in priority order
  const routeHandlers = [
    handleVoiceRoutes,
    handleFileRoutes,
    handleTeamRoutes,
    handleTaskRoutes,
    handleBotRoutes,
    handleSyncRoutes,
    handleRtcRoutes,
    handleSessionRoutes,
    handleSkillCatalogRoutes,
    handleProjectRoutes,
    handleBindingRoutes,
    handleProviderRoutes,
    handleSkillHubRoutes,
    handleMemoryRoutes,
    handleAdminMemoryRoutes,
    handleR9MockEndpoints,
    handleR10DataRoutes,
    handleDashboardAggregateRoutes,
    handleBillingAggregateRoutes,

    handleGenerateRoutes,
    handleWorkspaceRoutes,
    handleTemplateRoutes,
    handleKnowledgeRoutes,
  ];

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    let url = req.url || '/';

    // R51-C2: 兼容 trailing slash (Next.js rewrite + 浏览器 fetch /api/foo/ 都到 /api/foo/)
    // 保留 query string,只去掉 path 末尾的 /
    {
      const qIdx = url.indexOf('?');
      const pathOnly = qIdx >= 0 ? url.slice(0, qIdx) : url;
      const query = qIdx >= 0 ? url.slice(qIdx) : '';
      if (pathOnly.length > 1 && pathOnly.endsWith('/')) {
        url = pathOnly.replace(/\/+$/, '') + query;
      }
    }

    // Security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Redirect root to /web/ (frontend)
    if (url === '/' || url === '') {
      res.writeHead(302, { Location: '/web/' });
      res.end();
      return;
    }

    // Redirect /admin/* to /web/settings (admin merged into settings page)
    if (url.startsWith('/admin') && !url.startsWith('/api/admin')) {
      res.writeHead(302, { Location: '/web/settings' });
      res.end();
      return;
    }

    // P9: v1→v2 URL alias (BLOCKER fix 2026-07-08)
    // 5 个 v1 路径 → v2 (Q3 frontend 还在用 v1)
    if (url.startsWith('/api/skill-dags')) {
      url = '/api/v2/admin' + url.slice(4);
    } else if (url.startsWith('/api/pipelines')) {
      url = '/api/v2/admin' + url.slice(4);
    } else if (url.startsWith('/api/scheduled-jobs')) {
      url = '/api/v2/admin' + url.slice(4);
    } else if (url.startsWith('/api/embedding-jobs')) {
      url = '/api/v2/admin' + url.slice(4);
    } else if (url.startsWith('/api/tenants/') && url.includes('/quotas')) {
      url = '/api/v2/admin' + url.slice(4);
    }

    // Security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Request ID for log tracing
    const requestId = crypto.randomUUID().slice(0, 8);
    res.setHeader('X-Request-Id', requestId);

    // Prometheus metrics endpoint
    if (method === 'GET' && url === '/metrics') {
      _metrics.setGauge('panmira_uptime_seconds', process.uptime());
      const body = _metrics.serialize();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(body);
      return;
    }

    // Rate limiting (by IP, exempt health/metrics)
    if (url !== '/api/health' && url !== '/api/v3/health' && !url.startsWith('/api/v3/openapi') && url !== '/metrics' && !url.startsWith('/memory/')) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';
      const { allowed, remaining, resetIn } = rateLimiter.check(clientIp);
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
      if (!allowed) {
        jsonResponse(res, 429, { error: 'Too many requests', retryAfter: Math.ceil(resetIn / 1000) });
        return;
      }
    }

    // Auth check (exempt /web/, /memory/, /admin/, /api/admin, /api/auth, /api/v1/memory)
    if (
      secret &&
      !url.startsWith('/web') &&
      !url.startsWith('/memory') &&
      !url.startsWith('/api/admin') &&
      !url.startsWith('/api/auth') &&
      !url.startsWith('/api/v1/memory') &&
      url !== '/api/v3/health' &&
      !url.startsWith('/api/v3/openapi') &&
      !url.startsWith('/oauth') &&
      url !== '/.well-known/oauth-authorization-server' &&
      !url.startsWith('/api/reports') &&
      !url.startsWith('/api/v2/admin') && !url.startsWith('/api/v2/agents')
    ) {
      const auth = req.headers.authorization;
      const urlToken = url.includes('token=')
        ? new URL(url, `http://${req.headers.host || 'localhost'}`).searchParams.get('token')
        : null;

      // Dual auth: JWT first, then legacy API_SECRET fallback
      let authorized = false;
      if (auth?.startsWith('Bearer ')) {
        const token = auth.slice(7);
        const jwtPayload = await verifyAccessToken(token);
        if (jwtPayload) {
          authorized = true;
          (req as any).user = jwtPayload;
        } else if (token === secret) {
          authorized = true;
        }
      }
      if (!authorized && urlToken === secret) {
        authorized = true;
      }
      if (!authorized) {
        jsonResponse(res, 401, { error: 'Unauthorized' });
        return;
      }
    }

    // R49-B Step 7: 给 v1 路由响应自动加 Deprecation/Sunset/Link header
    if (url.startsWith('/api/v1/') || url.startsWith('/api/bots') || url.startsWith('/api/agents') || url === '/api/skills' || url.startsWith('/api/skills/')) {
      hookResForDeprecation(res, url);
      markV1Deprecated(res, url);
    }

    try {
      // R49-B: GET /api/v3/health — unified envelope + DB/Redis/MCP/CC-SDK checks
      if (await handleV3HealthRoutes(req, res, method, url)) return;

      // R49-B Step 6: GET /api/v3/openapi.json — OpenAPI 3.0 spec
      if (await handleV3OpenApiRoutes(req, res, method, url)) return;

      // R49-B Step 5: GET /api/v3/employees + /api/v3/agents — unified list response
      if (await handleV3ListRoutes(req, res, method, url)) return;

      // GET /api/health — enhanced health check with dependency status
      if (method === 'GET' && url === '/api/health') {
        const checks: Record<string, { status: string; message?: string }> = {};

        // DB check
        try {
          const { pool } = await import('../db/index.js');
          const dbResult = await pool.query('SELECT 1 AS alive');
          checks.db = dbResult.rows[0]?.alive === 1
            ? { status: 'ok' }
            : { status: 'fail', message: 'Unexpected query result' };
        } catch (err: any) {
          checks.db = { status: 'fail', message: err.message };
        }

        // Redis check (TCP socket, no dependency needed)
        try {
          await new Promise<void>((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(); });
            socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
            socket.on('error', reject);
            socket.connect(6379, '127.0.0.1');
          });
          checks.redis = { status: 'ok' };
        } catch (err: any) {
          checks.redis = { status: err.message === 'timeout' ? 'warn' : 'fail', message: err.message };
        }

        // MetaMemory check
        if (memoryServerUrl) {
          try {
            const resp = await fetch(`${memoryServerUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
            checks.memory = { status: resp.ok ? 'ok' : 'warn', message: `HTTP ${resp.status}` };
          } catch (err: any) {
            checks.memory = { status: 'warn', message: err.message };
          }
        }

        const peerStatuses = peerManager?.getPeerStatuses() ?? [];
        const allOk = Object.values(checks).every(c => c.status === 'ok');

        jsonResponse(res, allOk ? 200 : 503, {
          status: allOk ? 'ok' : 'degraded',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          bots: registry.list().length,
          peerBots: peerManager?.getPeerBots().length ?? 0,
          peers: peerStatuses.length,
          peersHealthy: peerStatuses.filter((p) => p.healthy).length,
          scheduledTasks: scheduler.taskCount(),
          recurringTasks: scheduler.recurringTaskCount(),
          checks,
        });
        return;
      }

      // POST /api/internal/alert — PM2 crash alert endpoint (internal)
      if (method === 'POST' && url === '/api/internal/alert') {
        const raw = await readBody(req);
        try {
          const alert = JSON.parse(raw);
          logger.error({ alert }, 'PM2 crash alert received');
          jsonResponse(res, 200, { received: true });
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
        }
        return;
      }

      // POST /api/test-provider — test an AI provider connection
      if (method === 'POST' && url === '/api/test-provider') {
        try {
          const raw = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', () => resolve(Buffer.concat(chunks).toString()));
            req.on('error', reject);
          });
          const body = JSON.parse(raw) as { baseUrl?: string; apiKey?: string; model?: string };
          const { baseUrl, apiKey, model } = body;
          if (!baseUrl || !apiKey) {
            jsonResponse(res, 400, { ok: false, error: 'baseUrl and apiKey are required' });
            return;
          }
          const base = baseUrl.replace(/\/$/, '');
          const testModel = model || 'gpt-3.5-turbo';
          const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '****';

          // Detect API format from base URL path
          const isAnthropic = /\/anthropic/i.test(base);
          const testUrl = isAnthropic ? `${base}/v1/messages` : `${base}/chat/completions`;

          logger.info(
            { testUrl, testModel, maskedKey, format: isAnthropic ? 'anthropic' : 'openai' },
            '[test-provider] sending test request',
          );

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          let reqBody: string;
          if (isAnthropic) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            reqBody = JSON.stringify({
              model: testModel,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            });
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
            reqBody = JSON.stringify({
              model: testModel,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
              stream: false,
            });
          }

          const testRes = await fetch(testUrl, {
            method: 'POST',
            headers,
            body: reqBody,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          logger.info({ status: testRes.status }, '[test-provider] response received');
          if (testRes.ok) {
            const data = (await testRes.json().catch(() => ({}))) as Record<string, unknown>;
            const returnedModel = isAnthropic ? (data as any).model || testModel : (data as any).model || testModel;
            jsonResponse(res, 200, { ok: true, model: returnedModel });
          } else {
            const errText = await testRes.text().catch(() => '');
            let errMsg = `HTTP ${testRes.status}`;
            try {
              const errData = JSON.parse(errText) as any;
              errMsg = errData?.error?.message || errData?.message || errMsg;
            } catch {
              /* use default */
            }
            logger.warn({ errText: errText.slice(0, 200) }, '[test-provider] error response');
            jsonResponse(res, 200, { ok: false, error: errMsg, status: testRes.status });
          }
        } catch (err: unknown) {
          const msg =
            err instanceof Error && err.name === 'AbortError'
              ? '连接超时 (15s)'
              : err instanceof Error
                ? err.message
                : '连接失败';
          jsonResponse(res, 200, { ok: false, error: msg });
        }
        return;
      }

      // R9: agent log-series 跳过 agents CRUD (因为 /api/agents 也含子路径)
      // R9 dispatch 已经在 825 行介入,这里需要 forward 回去
      if (url.match(/^\/api\/agents\/[^/]+\/log-series$/)) {
        // 让 R9 dispatch 处理
      }

      // R12 dashboard aggregate (2026-07-08) — single-fetch dashboard payload
      if (url.startsWith('/api/v2/admin/dashboard-aggregate')) {
        if (await handleDashboardAggregateRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'R12 route not found' });
        return;
      }

      // R14-D billing aggregate (2026-07-08) — single-fetch Token billing payload
      if (url.startsWith('/api/v2/admin/billing-aggregate')) {
        if (await handleBillingAggregateRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'R14-D route not found' });
        return;
      }

      // R9 mock endpoints (2026-07-08) - production 10/10
      if (url.startsWith('/api/mcp/servers')
          || url.startsWith('/api/v2/channels/oauth')
          || url.match(/^\/api\/agents\/[^/]+\/log-series/)
          || url.startsWith('/api/knowledge/folders')
          || url.startsWith('/api/v2/admin/diagnosis')
          || url.startsWith('/api/v2/admin/optimization')
          || url.startsWith('/api/v2/admin/logs')) {
        if (await handleR9MockEndpoints(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'R9 route not found' });
        return;
      }

      // R13-C foundation dispatch (2026-07-08) — memory CRUD + KB CRUD
      // GET /api/v2/foundation/memory/:layer 仍由下面的 r10 处理 (handler return false)
      if (url.startsWith('/api/v2/foundation/memory')
          || url.startsWith('/api/v2/foundation/folders')
          || url.startsWith('/api/v2/foundation/documents')
          || url.startsWith('/api/v2/foundation/extraction')) {
        if (await handleFoundationMemoryRoutes(req, res, method, url)) return;
        if (await handleFoundationKbRoutes(req, res, method, url)) return;
      }

      // R10 data access routes (2026-07-08) — memory list + sessions + 6 admin endpoints
      if (url.startsWith('/api/v2/foundation/memory/')
          || url.startsWith('/api/v2/admin/sessions')
          || url.startsWith('/api/v2/admin/rag-query-stats')
          || url.startsWith('/api/v2/admin/pipeline-runs')
          || url.startsWith('/api/v2/admin/usage-reports')
          || url.startsWith('/api/v2/admin/bot-history')
          || url.startsWith('/api/v2/admin/sync-outbox')) {
        if (await handleR10DataRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'R10 route not found' });
        return;
      }

      // Agent template CRUD
      if (url.startsWith('/api/agents')) {
        // GET /api/agents — list all (summary, no systemPrompt)
        if (method === 'GET' && url === '/api/agents') {
          const agents = await agentStore.listSummary();
          jsonResponse(res, 200, { agents });
          return;
        }
        // GET /api/agents/:id
        const getMatch = url.match(/^\/api\/agents\/([0-9a-f-]+)$/);
        if (method === 'GET' && getMatch) {
          const agent = await agentStore.findById(getMatch[1]);
          if (!agent) {
            jsonResponse(res, 404, { error: 'Agent not found' });
            return;
          }
          jsonResponse(res, 200, { agent });
          return;
        }
        // POST /api/agents — create
        if (method === 'POST' && url === '/api/agents') {
          const raw = await readBody(req);
          const body = JSON.parse(raw);
          if (!body.name) {
            jsonResponse(res, 400, { error: 'name is required' });
            return;
          }
          try {
            const agent = await agentStore.createInstance({
              name: body.name,
              roleTemplate: body.roleTemplate,
              description: body.description,
              systemPrompt: body.systemPrompt,
              capabilities: body.capabilities,
              tools: body.tools,
              category: body.category,
              templateType: body.templateType,
              sourceTemplateId: body.sourceTemplateId,
              ironLaws: body.ironLaws,
              boundary: body.boundary,
              orchestration: body.orchestration,
              // R15-B wizard fields (forwarded if present)
              workingDir: body.workingDir,
              channelIds: body.channelIds,
              visibility: body.visibility,
              temperature: body.temperature,
              persona: body.persona,
              defaultEngine: body.defaultEngine,
              defaultModel: body.defaultModel,
              defaultContextWindow: body.defaultContextWindow,
              avatarGlyph: body.avatarGlyph,
              avatarHue: body.avatarHue,
              modelId: body.modelId,
            });
            jsonResponse(res, 201, { agent });
          } catch (e: any) {
            // R27 规则 1: 实例重名 → 409
            const msg = String(e?.message || e);
            if (msg.includes('已存在')) {
              jsonResponse(res, 409, { error: 'name_taken', message: msg });
            } else {
              jsonResponse(res, 500, { error: 'create_failed', message: msg });
            }
          }
          return;
        }
        // PUT /api/agents/:id — update
        const putMatch = url.match(/^\/api\/agents\/([0-9a-f-]+)$/);
        if (method === 'PUT' && putMatch) {
          const raw = await readBody(req);
          const body = JSON.parse(raw);
          logger.info({ agentId: putMatch[1], kf: body.knowledgeFolders, allKeys: Object.keys(body) }, '[TRACE] PUT /api/agents body');
          let agent;
          try {
            agent = await agentStore.update(putMatch[1], body);
          } catch (e: any) {
            const code = (e && e.code) || '';
            const msg = String(e?.message || e);
            if (code === 'bot_already_bound') {
              jsonResponse(res, 409, { error: 'bot_already_bound', message: msg, boundAgent: e.boundAgent });
            } else if (msg.includes('已存在')) {
              jsonResponse(res, 409, { error: 'name_taken', message: msg });
            } else {
              jsonResponse(res, 500, { error: 'update_failed', message: msg });
            }
            return;
          }
          if (!agent) {
            jsonResponse(res, 404, { error: 'Agent not found' });
            return;
          }
          jsonResponse(res, 200, { agent });
          return;
        }
        // DELETE /api/agents/:id
        const delMatch = url.match(/^\/api\/agents\/([0-9a-f-]+)$/);
        if (method === 'DELETE' && delMatch) {
          const ok = await agentStore.delete(delMatch[1]);
          if (!ok) {
            jsonResponse(res, 404, { error: 'Agent not found' });
            return;
          }
          jsonResponse(res, 200, { ok: true });
          return;
        }
        // POST /api/agents/seed — batch import standard templates
        if (method === 'POST' && url === '/api/agents/seed') {
          const raw = await readBody(req);
          const body = JSON.parse(raw);
          const templates: any[] = body.templates || [];
          const created: any[] = [];
          for (const t of templates) {
            if (!t.name || !t.systemPrompt) continue;
            const agent = await agentStore.createInstance({
              name: t.name,
              roleTemplate: t.roleTemplate,
              description: t.description,
              systemPrompt: t.systemPrompt,
              category: t.category || 'general',
              templateType: 'standard',
            });
            created.push(agent);
          }
          jsonResponse(res, 201, { count: created.length, agents: created });
          return;
        }

        // POST /api/agents/refine-template — AI refine a raw MD template
        if (method === 'POST' && url === '/api/agents/refine-template') {
          const raw = await readBody(req);
          const body = JSON.parse(raw);
          const content = body.content as string;
          logger.info({ contentLen: content?.length, hasContent: !!content }, '[refine-template] request');
          if (!content || !content.trim()) {
            jsonResponse(res, 400, { error: 'content is required' });
            return;
          }
          const defaultProvider = await providerConfigStore.getDefault();
          if (!defaultProvider) {
            jsonResponse(res, 400, { error: '请先配置默认 AI 服务商' });
            return;
          }
          const apiKey = await providerConfigStore.getDecryptedApiKey(defaultProvider.id);
          if (!apiKey) {
            jsonResponse(res, 400, { error: '默认服务商缺少 API Key' });
            return;
          }
          const prompt = `你是一个 Agent 模板优化专家。请将以下原始内容优化为一个结构化的 Agent System Prompt 模板。

要求：
1. 保持中文
2. 使用 Markdown 格式
3. 包含以下结构：核心身份、职责、行为准则、技能列表、示例交互
4. 提炼出清晰的角色定位、性格特点、沟通风格
5. 保持原始内容的核心意图不变
6. 输出格式如下：

# {角色名称}

## 核心身份
{角色定位描述}

## 职责
{主要职责列表}

## 行为准则
{行为规范}

## 技能
{具备的技能}

## 沟通风格
{沟通风格描述}

## 示例交互
{示例对话}

原始内容：
${content}

请输出优化后的 System Prompt：`;
          try {
            const baseUrl = defaultProvider.baseUrl.replace(/\/+$/, '');
            const isAnthropic = /\/anthropic/i.test(baseUrl);
            const endpoint = isAnthropic ? `${baseUrl}/v1/messages` : `${baseUrl}/chat/completions`;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            let body: string;
            if (isAnthropic) {
              headers['x-api-key'] = apiKey;
              headers['anthropic-version'] = '2023-06-01';
              body = JSON.stringify({
                model: defaultProvider.model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }],
              });
            } else {
              headers['Authorization'] = `Bearer ${apiKey}`;
              body = JSON.stringify({
                model: defaultProvider.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 4000,
              });
            }
            const response = await fetch(endpoint, {
              method: 'POST',
              headers,
              body,
            });
            if (!response.ok) {
              const errText = await response.text();
              logger.error({ status: response.status, errText: errText.slice(0, 200) }, '[refine-template] LLM error');
              jsonResponse(res, 502, { error: `LLM 调用失败: ${response.status}` });
              return;
            }
            const data = await response.json();
            let refined = '';
            if (isAnthropic) {
              // Content array may contain thinking blocks before text blocks
              const textBlock = (data.content || []).find((b: any) => b.type === 'text');
              refined = textBlock?.text || '';
            } else {
              refined = data.choices?.[0]?.message?.content || '';
            }
            logger.info(
              { refinedLen: refined.length, isAnthropic, model: defaultProvider.model },
              '[refine-template] success',
            );
            jsonResponse(res, 200, { refined });
          } catch (err: any) {
            logger.error({ err: err.message }, '[refine-template] error');
            jsonResponse(res, 500, { error: err.message });
          }
          return;
        }

        jsonResponse(res, 404, { error: 'Agent route not found' });
        return;
      }

      // Auth routes (register, login, refresh, me)
      if (url.startsWith('/api/auth')) {
        if (await handleAuthRoutes(userStore, req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Auth route not found' });
        return;
      }

      // OAuth 2.0 routes (external system access)
      if (url.startsWith('/oauth') || url === '/.well-known/oauth-authorization-server') {
        if (await handleOAuthRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'OAuth route not found' });
        return;
      }

      // Plan B-1: Resource engine routes (embedding / mcp / agent skill refs)
      // Plan B-1: Resource engine routes (embedding / mcp / agent skill refs)
      if (url.startsWith('/api/v2/admin/embedding-providers') ||
          url.startsWith('/api/v2/admin/mcp-servers')) {
        if (await handleResourceRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Resource route not found' });
        return;
      }

      // Plan B-3: OAuth client CRUD
      if (url.startsWith('/api/v2/admin/oauth-clients')) {
        if (await handleOAuthClientRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'OAuth client route not found' });
        return;
      }

      // plan-H1+blueprint: runtime sessions + skill DAGs
      if (url.startsWith("/api/v2/admin/runtime")) {
        if (await handleRuntimeRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Runtime route not found" });
        return;
      }
      if (url.startsWith("/api/v2/admin/skill-dags")) {
        if (await handleSkillDagRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Skill DAG route not found" });
        return;
      }

      // Phase 1: Scheduled Jobs + Agent Run Logs
      if (url.startsWith("/api/v2/admin/scheduled-jobs")) {
        addDeprecationHeader(res, '/api/v2/tasks/scheduled');
        if (await handleScheduledJobsRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Scheduled job route not found" });
        return;
      }
      if (url.startsWith("/api/v2/admin/agent-run-logs")) {
        if (await handleAgentRunLogsRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Agent run log route not found" });
        return;
      }

      // Phase 2: Multi-agent Pipelines
      if (url.startsWith("/api/v2/admin/pipelines")) {
        addDeprecationHeader(res, '/api/v2/tasks/pipelines');
        // R20: /pipelines/ai-generate must run before handlePipelineRoutes
        // (whose :id/trigger regex would otherwise swallow it).
        if (url.startsWith("/api/v2/admin/pipelines/ai-generate")) {
          if (await handlePipelineAiGenerate(req, res, method, url)) return;
        }
        if (await handlePipelineRoutes(req, res, method, url)) return;
        if (await handleAdminCacheRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Pipeline route not found" });
        return;
      }

      // Level 4: Admin rate-limit override + inspect
      if (url.startsWith("/api/v2/admin/rate-limit")) {
        if (await handleAdminRateLimitRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: "Rate limit admin route not found" });
        return;
      }

      // Plan D: Reports CSV export
      if (url.startsWith('/api/v2/admin/reports/') && url.includes('/export')) {
        if (await handleReportsExportRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Reports export route not found' });
        return;
      }

      // Plan B-3: Reports
        if (url.startsWith("/api/v2/admin/agents")) {
          addDeprecationHeader(res, '/api/v2/employees');
        }
        if (await handleAgentsCrudRoutes(req, res, method, url)) return;
        if (url.startsWith("/api/v2/admin/channels")) {
          addDeprecationHeader(res, '/api/v2/channels');
        }
        if (await handleChannelsRoutes(req, res, method, url)) return;
        if (await handleModelsPoolRoutes(req, res, method, url)) return;
        if (await handleMonitoringRoutes(req, res, method, url)) return;
        if (await handleOpsRoutes(req, res, method, url)) return;
        if (await handleDashboardRoutes(req, res, method, url)) return;
      if (url.startsWith('/api/v2/admin/reports/')) {
        if (await handleReportsRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Reports route not found' });
        return;
      }

      // Plan C: Tenant quotas
      if (url.startsWith('/api/v2/admin/tenants/') && url.includes('/quotas')) {
        if (await handleTenantQuotaRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Tenant quota route not found' });
        return;
      }

      // Plan C: Maintenance (refresh MV)
      if (url.startsWith('/api/v2/admin/maintenance/')) {
        if (await handleMaintenanceRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Maintenance route not found' });
        return;
      }

      // P9: Admin memory aggregate (BLOCKER fix 2026-07-08)
      if (url.startsWith('/api/v2/admin/memory')) {
        if (await handleAdminMemoryRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Admin memory route not found' });
        return;
      }


      // IA v6 新路由(2026-07-08) — 公司综阅/组织部/数字员工/任务/数智底座/资源频道
      if (url.startsWith('/api/v2/overview')) {
        if (await handleOverviewRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Overview route not found' });
        return;
      }
      if (url.startsWith('/api/v2/people')) {
        if (await handlePeopleRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'People route not found' });
        return;
      }
      // R42-ROUTES: /api/v2/agent-templates / /api/v2/agent-instances 走同一个 employees handler
      if (url.startsWith('/api/v2/agent-templates') || url.startsWith('/api/v2/agent-instances')) {
        if (await handleEmployeesRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Agent route not found' });
        return;
      }
      // R52-SCHEMA: 数字 HR CRUD(/api/v2/digital-hr 优先于 employees 路由匹配)
      if (url.startsWith('/api/v2/digital-hr')) {
        if (await handleHrRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Digital HR route not found' });
        return;
      }
      // R52-SCHEMA: 招聘 / 提炼(数字员工生命周期闭环)
      if (url.startsWith('/api/v2/digital-employees')) {
        if (await handleDigitalEmployeeRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Digital employee route not found' });
        return;
      }
      if (url.startsWith('/api/v2/employees')) {
        if (await handleEmployeesRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Employee route not found' });
        return;
      }
      if (url.startsWith('/api/v2/tasks')) {
        if (await handleTasksRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Tasks route not found' });
        return;
      }
      if (url.startsWith('/api/v2/foundation')) {
        if (await handleFoundationRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Foundation route not found' });
        return;
      }
      if (url.startsWith('/api/v2/channels')) {
        if (await handleChannelsRoutesV6(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Channels v6 route not found' });
        return;
      }
      if (url.startsWith('/api/v2/models')) {
        if (await handleModelsV6Routes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Models v6 route not found' });
        return;
      }
            // R13E: Routing rules CRUD (priority reorder + probe)
      if (url.startsWith('/api/v2/admin/routing-rules')) {
        if (await handleRoutingRulesRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Routing rules route not found' });
        return;
      }

      // Plan D: Channel usage (IM handlers 调用)
      if (url.startsWith('/api/v2/admin/channels/')) {
        if (await handleChannelUsageRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Channel route not found' });
        return;
      }

      // Plan F: Embedding jobs status
      if (url.startsWith('/api/v2/admin/embedding-jobs/')) {
        if (await handleEmbeddingJobsRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Embedding job route not found' });
        return;
      }

      // Plan B-2: Knowledge Base CRUD
      if (url.startsWith('/api/v2/admin/knowledge-bases') ||
          url.startsWith('/api/v2/admin/documents/')) {
        if (await handleKnowledgeBaseRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'KB route not found' });
        return;
      }

      // Plan B-2: Agent KB refs (业务端, Bearer)
      if (url.startsWith('/api/v2/agents/') && (url.includes('knowledge-refs') || url.endsWith('/run'))) {
        // Try knowledge-refs first, then run
        if (url.includes('knowledge-refs')) {
          if (await handleAgentKnowledgeRoutes(req, res, method, url)) return;
        } else if (url.endsWith('/run')) {
          if (await handleAgentRunRoutes(req, res, method, url)) return;
        }
        jsonResponse(res, 404, { error: 'Agent route not found' });
        return;
      }

      // Plan B-1: Agent resource routes (skill-refs etc.)
      // R42-ROUTES: /api/v2/admin/agent-templates + /api/v2/admin/agent-instances 走 handleAgentsCrudRoutes
      if (url.startsWith('/api/v2/admin/agent-templates') || url.startsWith('/api/v2/admin/agent-instances')) {
        if (await handleAgentsCrudRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Agent admin route not found' });
        return;
      }
      if (url.startsWith('/api/v2/admin/agents/')) {
        if (await handleResourceRoutes(req, res, method, url)) return;
        jsonResponse(res, 404, { error: 'Resource route not found' });
        return;
      }

      // CORS preflight for /memory — handle browser OPTIONS requests
      if (method === 'OPTIONS' && url.startsWith('/memory')) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
      }

      // Reverse proxy /memory to MetaMemory server (port 8100)
      if (url.startsWith('/memory')) {
        // Intercept tag API calls — handled by workspace routes on this server
        const memPath = url.slice('/memory'.length) || '/';
        if (memPath.startsWith('/api/workspace/tags')) {
          (async () => {
            try {
              for (const handler of routeHandlers) {
                if (await handler(ctx, req, res, method, memPath)) return;
              }
              jsonResponse(res, 404, { error: 'Tag route not found' });
            } catch (err: any) {
              jsonResponse(res, 500, { error: err.message });
            }
          })();
          return;
        }

        const MEMORY_URL = memoryServerUrl || 'http://127.0.0.1:8100';
        const memHeaders: Record<string, string> = {};
        if (req.headers['content-type']) memHeaders['content-type'] = req.headers['content-type'] as string;
        if (memoryAuthToken) {
          memHeaders['authorization'] = `Bearer ${memoryAuthToken}`;
        } else if (req.headers['authorization']) {
          memHeaders['authorization'] = req.headers['authorization'] as string;
        }
        try {
          const body = ['GET', 'HEAD'].includes(method) ? undefined : await readBody(req);
          const targetPath = url.slice('/memory'.length) || '/';
          const upstream = await fetch(`${MEMORY_URL}${targetPath}`, { method, headers: memHeaders, body });
          const ct = upstream.headers.get('content-type') ?? 'application/json';
          const upstreamBody = await upstream.text();
          res.writeHead(upstream.status, {
            'content-type': ct,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          res.end(upstreamBody);
        } catch {
          jsonResponse(res, 502, { error: 'Memory server unavailable' });
        }
        return;
      }

      // Dispatch to route handlers
      for (const handler of routeHandlers) {
        try {
          const handled = await handler(ctx, req, res, method, url);
          if (handled) return;
        } catch (err: any) {
          logger.error({ handler: handler.name, err: err.message }, 'Route handler error');
        }
      }

      // Static file serving for Web UI
      if (serveStaticFiles(req, res, url)) return;

      // 404 fallback
      jsonResponse(res, 404, { error: 'Not found' });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      if (statusCode >= 500) {
        logger.error({ err, method, url }, 'API request error');
      }
      jsonResponse(res, statusCode, { error: err.message || 'Internal server error' });
    }
  });

  // Set up WebSocket server for Web UI streaming
  ws.handle = setupWebSocketServer(
    server,
    registry,
    logger,
    secret,
    peerManager,
    options.sessionRegistry,
    options.botConfigStore,
  );

  // Wire WebSocket handle to scheduler so scheduled tasks stream updates to clients
  scheduler.setWebSocketHandle(ws.handle);

  // L7: Wire WS handle to pipeline-events for async run progress push
  setPipelineWsHandle(ws.handle);

  // Wire activity events: each bridge records to ActivityStore and broadcasts to WS clients
  for (const bot of registry.listRegistered()) {
    bot.bridge.onActivityEvent = (event) => {
      activityStore.record(event).then((recorded) => {
        ws.handle?.broadcastAll({ type: 'activity_event', event: recorded });
      });
    };
  }

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.error({ port, host }, 'Port already in use — is another instance running?');
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, host, () => {
    logger.info({ host, port }, 'API server started');
  });

  return { server, broadcastAll: ws.handle?.broadcastAll ?? (() => {}) };
}
