import { botAgentRegistry } from '../agents/bot-agent-registry.js';
import { selectAgent } from '../agents/intent/selector.js';

export function buildAgentContext(botName: string, message: string): string {
  const agents = botAgentRegistry.getAgentsForBot(botName);
  if (agents.length === 0) return '';

  const selection = selectAgent(agents, message);
  const agent = agents.find(a => a.id === selection.agentId);
  if (!agent || !agent.systemPrompt) return '';

  return `[角色设定] 你当前以「${agent.name}」的身份处理此任务。\n${agent.systemPrompt}\n---\n`;
}
