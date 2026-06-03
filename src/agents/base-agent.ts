import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../core/types.js';

export interface AgentExecuteResult {
  agent: string;
  agentId: string;
  task: string;
  thought: string;
  result: string;
  type: string;
  capabilitiesUsed: string[];
}

export abstract class BaseAgent {
  readonly id: string;
  readonly tenantId?: string;
  readonly name: string;
  readonly roleTemplate?: string;
  readonly description: string;
  readonly capabilities: string[];
  readonly tools: string[];
  readonly systemPrompt: string;
  readonly isActive: boolean;
  readonly metadata: Record<string, unknown>;

  constructor(config: Partial<AgentConfig> & { name: string }) {
    this.id = config.id ?? randomUUID();
    this.tenantId = config.tenantId;
    this.name = config.name;
    this.roleTemplate = config.roleTemplate;
    this.description = config.description ?? '';
    this.capabilities = config.capabilities ?? [];
    this.tools = config.tools ?? [];
    this.systemPrompt = config.systemPrompt ?? '';
    this.isActive = config.isActive ?? true;
    this.metadata = config.metadata ?? {};
  }

  abstract execute(task: string, context?: Record<string, unknown>): Promise<AgentExecuteResult>;

  protected buildResult(task: string, thought: string, result: string, capabilitiesUsed: string[]): AgentExecuteResult {
    return {
      agent: this.name,
      agentId: this.id,
      task,
      thought,
      result,
      type: this.roleTemplate ?? 'generic',
      capabilitiesUsed,
    };
  }

  toConfig(): AgentConfig {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      roleTemplate: this.roleTemplate,
      description: this.description,
      capabilities: this.capabilities,
      tools: this.tools,
      systemPrompt: this.systemPrompt,
      isActive: this.isActive,
      metadata: this.metadata,
    };
  }
}
