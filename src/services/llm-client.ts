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

export interface LlmCallOptions {
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
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

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const start = Date.now();
  const provider = await loadDefaultLlmProvider();
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

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  };
  const text = data.content?.find(c => c.type === 'text')?.text || '';
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  return {
    text,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    model: data.model || model,
    provider: provider.name,
    durationMs: Date.now() - start,
  };
}
