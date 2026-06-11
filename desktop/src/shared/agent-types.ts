// Single source of truth for agent-related types used by both
// renderer (chat-store) and main (stream-router).
export type AgentName =
  | 'generation'
  | 'quality'
  | 'optimization'
  | 'verification'
  | 'memory'
  | 'execution';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

export type Role = 'user' | 'assistant' | 'system';
