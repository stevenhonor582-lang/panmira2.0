export type ClientType = "web" | "native" | "cli" | "mcp_server";

export interface OAuthClient {
  id: string;
  tenantId: string;
  name: string;
  type: ClientType | null;
  clientId: string;
  redirectUris: string[];
  scopes: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthClientCreate {
  name: string;
  type: ClientType;
  redirectUris: string[];
  scopes: string[];
}

// 预定义 scopes(spec § 5.3)
export const SCOPE_OPTIONS = [
  "agent:read", "agent:run", "agent:edit", "agent:admin",
  "model:read", "model:test", "model:admin",
  "skill:read", "skill:invoke", "skill:admin",
  "mcp:read", "mcp:invoke", "mcp:admin",
  "knowledge:read", "knowledge:write", "knowledge:admin",
  "channel:read", "channel:admin",
  "reports:read", "reports:admin",
  "audit:read", "oauth:admin",
] as const;

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  clientSecret?: string;
  client?: { clientSecret?: string };
}

export const TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: "web", label: "Web 应用" },
  { value: "native", label: "原生应用" },
  { value: "cli", label: "CLI / 桌面" },
  { value: "mcp_server", label: "MCP Server" },
];
