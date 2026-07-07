import type { KnowledgeBase } from "../../knowledge/_components/types";

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isActive: boolean;
  capabilities: string[];
}

export interface EmployeeFolder {
  employee: string;
  department: string;
  bots: Array<{ name: string; channels: string[]; sessionCount: number }>;
  agentCount: number;
  memoryPath: string;
  memoryItems: number;
}

export interface PipelineProject {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  updatedAt: string;
  inputCount: number;
  outputCount: number;
  memoryPath: string;
}

export interface MemorySearchHit {
  tier: "public" | "employee" | "project";
  id: string;
  title: string;
  snippet: string;
  score: number;
  source: string;
  href?: string;
}

export type { KnowledgeBase };
