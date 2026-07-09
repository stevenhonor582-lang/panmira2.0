/**
 * Plan E LLM Client
 * 调 anthropic-compatible /v1/messages 端点
 * 用 default LLM provider (provider_configs.is_default=true AND type='LLM')
 */
import { pool } from '../db/index.js';
import { decrypt } from '../db/crypto.js';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface LlmCallOptions {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}

export interface LlmToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmCallResult {
  text: string;
  toolUses: LlmToolUse[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  provider: string;
  durationMs: number;
}

export interface LlmCallResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  provider: string;
  durationMs: number;
}

export class LlmCallError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public provider?: string,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

export interface LlmProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function loadDefaultLlmProvider(): Promise<LlmProvider | null> {
  const result = await pool.query(
    `SELECT name, base_url, api_key_encrypted, model
     FROM provider_configs
     WHERE is_default = true AND type = 'LLM'
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!row.api_key_encrypted) {
    return { name: row.name, baseUrl: row.base_url, apiKey: '', model: row.model };
  }
  try {
    const apiKey = decrypt(row.api_key_encrypted);
    return { name: row.name, baseUrl: row.base_url, apiKey, model: row.model };
  } catch {
    return null;
  }
}

/**
 * R33-A: 按 model 精确反查 provider(锁定端点 + key)。
 * useModelRouting=false 时,agent 走自己绑定的 provider,而非全局 default。
 * 匹配失败返回 null,调用方回退到 loadDefaultLlmProvider。
 */
export async function loadLlmProviderByModel(model: string): Promise<LlmProvider | null> {
  const result = await pool.query(
    `SELECT name, base_url, api_key_encrypted, model
     FROM provider_configs
     WHERE LOWER(model) = LOWER($1)
     LIMIT 1`,
    [model],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!row.api_key_encrypted) {
    return { name: row.name, baseUrl: row.base_url, apiKey: '', model: row.model };
  }
  try {
    const apiKey = decrypt(row.api_key_encrypted);
    return { name: row.name, baseUrl: row.base_url, apiKey, model: row.model };
  } catch {
    return null;
  }
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const start = Date.now();
  // R33-A: 传入 model 时优先按 model 反查对应 provider(切端点 + key,锁定模型);
  // 找不到才回退全局 default。这是 useModelRouting=false 锁定的核心:
  // 否则 DeepSeek model 会被送到 Minimax 端点直接失败。
  let provider: LlmProvider | null = null;
  if (opts.model) {
    provider = await loadLlmProviderByModel(opts.model);
  }
  if (!provider) {
    provider = await loadDefaultLlmProvider();
  }
  if (!provider) {
    throw new LlmCallError('No default LLM provider configured', 503);
  }
  if (!provider.apiKey) {
    throw new LlmCallError(`Provider ${provider.name} has no API key`, 503, provider.name);
  }
  const model = opts.model || provider.model;
  const maxTokens = opts.maxTokens ?? 1024;
  const timeoutMs = opts.timeoutMs ?? 30000;

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
  // 禁用 extended thinking(DeepSeek anthropic 默认开,吃 maxTokens)
  body.thinking = { type: 'disabled' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    if (e.name === 'AbortError') {
      throw new LlmCallError('LLM request timed out', 504, provider.name);
    }
    throw new LlmCallError(`LLM request failed: ${e.message}`, 502, provider.name);
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new LlmCallError(`LLM auth failed: ${status} ${errText.slice(0, 200)}`, status, provider.name);
    }
    if (status === 429) {
      throw new LlmCallError('LLM rate limited', 429, provider.name);
    }
    throw new LlmCallError(`LLM error ${status}: ${errText.slice(0, 200)}`, status, provider.name);
  }

const data = await response.json() as any;
  // R20: 容错多 provider 响应格式(标准 Anthropic / DeepSeek anthropic / OpenAI 兼容)
  const text =
    data.content?.find((c: any) => c.type === 'text')?.text  // 标准 Anthropic
    || data.content?.find((c: any) => typeof c === 'string')  // content 数组直接是字符串
    || (typeof data.content === 'string' ? data.content : '')  // content 本身是字符串
    || data.completion  // 部分 provider
    || data.text
    || data.choices?.[0]?.message?.content  // OpenAI 兼容
    || '';
  const toolUses: LlmToolUse[] = (data.content || [])
    .filter((c: any) => c.type === 'tool_use')
    .map((c: any) => ({ id: c.id, name: c.name, input: c.input }));
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  return {
    text,
    toolUses,
    stopReason: data.stop_reason || 'end_turn',
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    model: data.model || model,
    provider: provider.name,
    durationMs: Date.now() - start,
  };
}
