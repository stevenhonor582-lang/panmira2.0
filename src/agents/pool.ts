import type { BaseAgent } from './base-agent.js';
import { AgentRegistry } from './registry.js';

export class AgentPool {
  private tenants = new Map<string, AgentRegistry>();

  register(tenantId: string, agent: BaseAgent): void {
    const registry = this.tenants.get(tenantId) ?? new AgentRegistry();
    if (!this.tenants.has(tenantId)) this.tenants.set(tenantId, registry);
    registry.register(agent);
  }

  getForTenant(tenantId: string): BaseAgent[] {
    return this.tenants.get(tenantId)?.listActive() ?? [];
  }

  getAgent(tenantId: string, agentId: string): BaseAgent | undefined {
    return this.tenants.get(tenantId)?.get(agentId);
  }

  getAgentByName(tenantId: string, name: string): BaseAgent | undefined {
    return this.tenants.get(tenantId)?.getByName(name);
  }
}
