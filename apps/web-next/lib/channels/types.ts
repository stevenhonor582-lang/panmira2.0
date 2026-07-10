// Shared types for the IA v6 Channels module.
// Each page renders dense-config tables with strict status semantics.

export type LLMProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "local"
  | "deepseek";

export type ModelCategory =
  | "llm"
  | "embedding"
  | "video"
  | "audio"
  | "rerank"
  | "other";

export type LLMStatus =
  | "connected"
  | "expired"
  | "error"
  | "needs-api-key";

export interface LLMProvider {
  id: string;
  name: string;
  type: LLMProviderType | string;
  baseUrl: string;
  model: string;
  modelCategory: ModelCategory;
  isDefault: boolean;
  status: LLMStatus;
  lastTestedAt: string | null;
  hasApiKey: boolean;
  latencyMs?: number | null;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: "built-in" | "github" | "local" | "custom";
  enabled: boolean;
  tags: string[];
  installedAt?: string;
}

export type MCPTransport = "stdio" | "sse" | "http";
export type MCPStatus = "running" | "stopped" | "error";

export interface MCPServer {
  id: string;
  name: string;
  transport: MCPTransport;
  url: string;
  auth: string | null;
  status: MCPStatus;
  toolCount?: number;
}

export type EndpointDirection = "outbound" | "inbound" | "both";
export type EndpointStatus = "active" | "paused" | "error";

export interface EndpointOutbound {
  id: string;
  channel: "feishu" | "dingtalk" | "wechatwork" | "slack" | "telegram";
  botName: string;
  webhookUrl: string;
  status: EndpointStatus;
  purpose: EndpointDirection;
  remark?: string;
}

export interface EndpointInbound {
  id: string;
  name: string;
  callbackUrl: string;
  allowedMethods: string[];
  apiVersion: string;
  rateLimit: string;
  status: EndpointStatus;
}

export type OAuthDirection = "consumer" | "provider";

export interface OAuthAuthorizedThirdParty {
  id: string;
  name: string;
  scopes: string[];
  authorizedAt: string;
  status: "active" | "expired" | "revoked";
}

export interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  status: "active" | "disabled";
  createdAt: string;
  scopes?: string[];
}

export interface OAuthClientWithSecret extends OAuthClient {
  /** Returned ONCE on creation. Must never be persisted or echoed in lists. */
  clientSecret: string;
}

export interface RoutingRule {
  id: string;
  botId: string;
  botName: string;
  priority: number;
  condition: string;
  destination: string;
  enabled: boolean;
}