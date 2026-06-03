import type { BaseAgent } from './base-agent.js';
import { AgentPool } from './pool.js';
import { CFOAgent } from './roles/cfo.js';
import { COOAgent } from './roles/coo.js';
import { CTOAgent } from './roles/cto.js';
import { LegalSecretaryAgent } from './roles/legal-secretary.js';
import { PlanSecretaryAgent } from './roles/plan-secretary.js';
import { LingyanAgent } from './roles/lingyan.js';
import { AlexDevAgent } from './roles/alex-dev.js';
import { AlexContentAgent } from './roles/alex-content.js';
import { AlexGrowthAgent } from './roles/alex-growth.js';
import { AlexOpsAgent } from './roles/alex-ops.js';

const ROLE_MAP: Record<string, new (config?: { tenantId?: string }) => BaseAgent> = {
  cfo: CFOAgent,
  coo: COOAgent,
  cto: CTOAgent,
  legal_secretary: LegalSecretaryAgent,
  plan_secretary: PlanSecretaryAgent,
  lingyan: LingyanAgent,
  alex_dev: AlexDevAgent,
  alex_content: AlexContentAgent,
  alex_growth: AlexGrowthAgent,
  alex_ops: AlexOpsAgent,
};

const ALL_ROLES = Object.keys(ROLE_MAP);

export class BotAgentRegistry {
  private pool = new AgentPool();

  registerBot(botName: string, agentRoles?: string[]): void {
    // 没有 agents 配置 = 不绑定任何模板
    if (!agentRoles || agentRoles.length === 0) return;
    for (const role of agentRoles) {
      const AgentClass = ROLE_MAP[role];
      if (AgentClass) {
        this.pool.register(botName, new AgentClass({ tenantId: botName }));
      }
    }
  }

  getAgentsForBot(botName: string): BaseAgent[] {
    return this.pool.getForTenant(botName);
  }

  getAllBots(): string[] {
    return Array.from((this.pool as any).tenants.keys());
  }

  getAvailableRoles(): string[] {
    return ALL_ROLES;
  }
}

export const botAgentRegistry = new BotAgentRegistry();
