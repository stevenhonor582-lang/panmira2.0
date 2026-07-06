export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  displayName: string;
  roleTemplate: string;
  description: string;
  capabilities: string[];
  tools: string[];
  systemPrompt: string;
  orchestration: Record<string, unknown>;
  boundary: Record<string, unknown>;
  ironLaws: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AgentCreate {
  name: string;
  roleTemplate: string;
  description: string;
  systemPrompt: string;
}

export interface AgentListResponse {
  agents: Agent[];
}
