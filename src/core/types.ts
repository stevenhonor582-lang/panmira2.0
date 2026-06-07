// Core data interfaces

import type { TaskStatus, MemoryLayer, CollabRequestStatus, ApprovalStatus, ApprovalAction, Intent, UserRole } from './constants.js';

export interface Tenant {
  id: string;
  name: string;
  feishuConfig?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  feishuUserId?: string;
  name: string;
  email?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConfig {
  id: string;
  tenantId?: string;
  name: string;
  roleTemplate?: string;
  description?: string;
  capabilities: string[];
  tools: string[];
  systemPrompt: string;
  isActive: boolean;
  createdAt?: Date;
  metadata: Record<string, unknown>;
}

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface Memory {
  id: string;
  content: string;
  layer: MemoryLayer;
  userId: string;
  agentId?: string;
  tenantId: string;
  createdAt: Date;
  importance: number;
  accessCount: number;
  lastAccessed?: Date;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface MemoryQuery {
  query: string;
  userId: string;
  agentId?: string;
  layers?: MemoryLayer[];
  limit?: number;
  threshold?: number;
}

export interface MemoryResult {
  memory: Memory;
  similarity: number;
  rank: number;
}

export interface CollabRequest {
  id: string;
  fromAgent: string;
  toAgent: string;
  taskId: string;
  status: CollabRequestStatus;
  createdAt: Date;
  respondedAt?: Date;
  result?: unknown;
}

export interface ApprovalTask {
  id: string;
  action: ApprovalAction;
  actor: string;
  target: string;
  reason: string;
  status: ApprovalStatus;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  metadata: Record<string, unknown>;
}

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  reasoning: string;
}

export interface AgentSelection {
  agentId?: string;
  agentName?: string;
  reasoning: string;
  confidence: number;
}

export interface RoutingResult {
  intent: Intent;
  classification: IntentClassification;
  agentSelection: AgentSelection;
  handlerResponse?: string;
}
