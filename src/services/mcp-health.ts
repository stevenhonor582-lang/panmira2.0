/**
 * MCP server 健康检查
 * 返回 { status, tools?, error? }
 *   status: healthy | degraded | down
 */
import type { mcpServers } from '../db/schema.js';
import { recordMcpUsage } from './usage-tracker.js';

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'down';
  tools?: Array<{ name: string; description: string; schema: unknown }>;
  error?: string;
  latencyMs?: number;
}

export async function checkMcpHealth(server: typeof mcpServers.$inferSelect): Promise<HealthResult> {
  const start = Date.now();
  try {
    // MCP 协议:POST /tools/list 返回工具列表
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (server.authType === 'api_key' && server.apiKeyEncrypted) {
      // 简化:API key 直接作 bearer(实网应解密)
      headers['Authorization'] = `Bearer ${server.apiKeyEncrypted}`;
    }
    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: 'down', error: `HTTP ${res.status}`, latencyMs };
    const data = await res.json() as { result?: { tools?: Array<{ name: string; description: string; inputSchema: unknown }> } };
    const tools = (data.result?.tools || []).map(t => ({ name: t.name, description: t.description, schema: t.inputSchema }));
    // 记录 MCP 健康检查 (fire-and-forget)
    if (server.tenantId) recordMcpUsage(server.tenantId, server.id, 1);
    return { status: tools.length > 0 ? 'healthy' : 'degraded', tools, latencyMs };
  } catch (e) {
    if (server.tenantId) recordMcpUsage(server.tenantId, server.id, 1);
    return { status: 'down', error: (e as Error).message, latencyMs: Date.now() - start };
  }
}
