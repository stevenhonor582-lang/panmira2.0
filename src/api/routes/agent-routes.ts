import type { RouteHandler } from './types.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { botAgentRegistry } from '../../agents/bot-agent-registry.js';
import { IntentRouter } from '../../agents/intent/router.js';
import { ApprovalQueue } from '../../agents/approval/queue.js';
import { ApprovalAction } from '../../core/constants.js';

const approvalQueue = new ApprovalQueue();

export const handleAgentRoutes: RouteHandler = async (_ctx, req, res, method, url) => {
  if (!url.startsWith('/api/v1/agent') && !url.startsWith('/api/v1/approval')) return false;

  if (url === '/api/v1/agent/list' && method === 'GET') {
    const botName = (req.headers['x-bot-name'] as string) ?? req.headers['x-tenant-id'] as string ?? 'default';
    const agents = botAgentRegistry.getAgentsForBot(botName);
    jsonResponse(res, 200, {
      bot: botName,
      agents: agents.map(a => ({ id: a.id, name: a.name, role: a.roleTemplate, capabilities: a.capabilities })),
    });
    return true;
  }

  if (url === '/api/v1/agent/execute' && method === 'POST') {
    const body = await parseJsonBody(req);
    const botName = (req.headers['x-bot-name'] as string) ?? req.headers['x-tenant-id'] as string ?? 'default';
    const agents = botAgentRegistry.getAgentsForBot(botName);
    const router = new IntentRouter(agents);
    const result = await router.route(body.intent as string);
    jsonResponse(res, 200, { status: 'ok', result: result.handlerResponse, agent: result.agentSelection.agentName });
    return true;
  }

  if (url === '/api/v1/agent/bots' && method === 'GET') {
    const bots = botAgentRegistry.getAllBots();
    const result = bots.map(name => ({
      name,
      agents: botAgentRegistry.getAgentsForBot(name).map(a => ({ name: a.name, role: a.roleTemplate })),
    }));
    jsonResponse(res, 200, { bots: result });
    return true;
  }

  if (url === '/api/v1/approval/submit' && method === 'POST') {
    const body = await parseJsonBody(req);
    const userId = req.headers['x-user-id'] as string ?? 'anonymous';
    const task = approvalQueue.submit(body.action as ApprovalAction, userId, body.target as string, body.reason as string, body.metadata as Record<string, unknown>);
    jsonResponse(res, 200, { id: task.id, status: task.status });
    return true;
  }

  if (url === '/api/v1/approval/list' && method === 'GET') {
    jsonResponse(res, 200, { approvals: approvalQueue.getPending() });
    return true;
  }

  if (url === '/api/v1/approval/resolve' && method === 'POST') {
    const body = await parseJsonBody(req);
    const userId = req.headers['x-user-id'] as string ?? 'anonymous';
    const task = body.approve ? approvalQueue.approve(body.id as string, userId) : approvalQueue.reject(body.id as string, userId);
    jsonResponse(res, 200, { id: task.id, status: task.status });
    return true;
  }

  return false;
};

/** Register agents for all bots from config. Called once at startup. */
export function registerBotAgents(botConfigs: Array<{ name: string; agents?: string[] }>): void {
  for (const bot of botConfigs) {
    botAgentRegistry.registerBot(bot.name, bot.agents);
  }
}
