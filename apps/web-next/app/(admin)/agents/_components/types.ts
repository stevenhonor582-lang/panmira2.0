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

/**
 * L9 #C: Trigger strategy stored on the agent (`agents.orchestration.triggerStrategy`).
 * Mirrors the backend `TriggerStrategy` union in src/services/pipeline-bot-trigger.ts.
 * - 'first': default; run only the first matching pipeline (Phase 3 behaviour).
 * - 'all':   run every matching pipeline in parallel and return an array.
 * - 'race':  run all in parallel; return the first pipeline to finish `completed`.
 *
 * Frontend never persists this itself — the AgentDialog posts it as part of the
 * agent payload and the backend Agents API stores it inside `orchestration`.
 */
export type TriggerStrategy = "first" | "all" | "race";

export interface AgentCreate {
  name: string;
  roleTemplate: string;
  description: string;
  systemPrompt: string;
  /**
   * L9 #C: optional trigger strategy. Backend stores under `orchestration.triggerStrategy`.
   * Omitted = leave whatever the backend has (defaults to 'first' on the server side).
   */
  triggerStrategy?: TriggerStrategy;
}

export interface AgentListResponse {
  agents: Agent[];
}
