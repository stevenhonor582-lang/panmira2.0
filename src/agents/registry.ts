import type { BaseAgent } from './base-agent.js';

export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  get(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  getByName(name: string): BaseAgent | undefined {
    for (const agent of Array.from(this.agents.values())) {
      if (agent.name === name) return agent;
    }
    return undefined;
  }

  getByRole(role: string): BaseAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.roleTemplate === role);
  }

  list(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  listActive(): BaseAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.isActive);
  }
}
