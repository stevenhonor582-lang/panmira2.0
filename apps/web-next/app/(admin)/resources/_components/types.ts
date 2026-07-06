export interface McpServer {
  id: string;
  tenantId?: string;
  teamId?: string | null;
  name: string;
  url: string;
  transport?: string;
  authType?: string;
  status?: string;
  healthStatus?: string;
  lastCheckAt?: string;
  createdAt?: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  skillCount: number;
  enabled: boolean;
}

export interface McpCreate {
  name: string;
  url: string;
  transport?: string;
  authType?: string;
  apiKey?: string;
}

export interface McpHealthResult {
  status: string;
  tools?: string[];
  error?: string;
  latencyMs?: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}
