import type { BotConfigBase } from '../../config.js';
import type { Logger } from '../../utils/logger.js';
import type { ApiContext, ExecutionHandle, ExecutorOptions, SDKMessage } from '../claude/executor.js';

interface OpenAIStreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAIStreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: OpenAIStreamDelta;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

let msgCounter = 0;
function nextId(): string {
  return `oai-${Date.now()}-${++msgCounter}`;
}

export class OpenAICompatExecutor {
  constructor(
    private config: BotConfigBase,
    private logger: Logger,
  ) {}

  startExecution(options: ExecutorOptions): ExecutionHandle {
    const { prompt, cwd, abortController, outputsDir, apiContext } = options;
    const cfg = this.config.openaiCompat;
    if (!cfg) throw new Error('openaiCompat config missing');

    const systemPrompt = this.buildSystemPrompt(cwd, outputsDir, apiContext);
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const stream = this.streamChat(cfg, messages, abortController);

    return {
      stream,
      sendAnswer() {},
      resolveQuestion() {},
      finish() {},
    };
  }

  async *execute(options: ExecutorOptions): AsyncGenerator<SDKMessage> {
    yield* this.startExecution(options).stream;
  }

  private async *streamChat(
    cfg: NonNullable<BotConfigBase['openaiCompat']>,
    messages: Array<{ role: string; content: string }>,
    abortController: AbortController,
  ): AsyncGenerator<SDKMessage> {
    const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const startTime = Date.now();

    yield {
      type: 'system',
      subtype: 'init',
      session_id: nextId(),
    };

    let fullContent = '';
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let usageData: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    let modelName = cfg.model;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI-compat API error ${res.status}: ${text.slice(0, 200)}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          const choice = chunk.choices?.[0];
          if (!choice?.delta) continue;

          if (choice.delta.content) {
            fullContent += choice.delta.content;
            yield {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: choice.delta.content },
              },
            };
          }

          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const existing = toolCalls.get(tc.index);
              if (!existing && tc.id) {
                toolCalls.set(tc.index, {
                  id: tc.id,
                  name: tc.function?.name || '',
                  args: tc.function?.arguments || '',
                });
              } else if (existing) {
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.args += tc.function.arguments;
              }
            }
          }

          // Capture usage from stream (OpenAI sends it in the last chunk or separately)
          if (chunk.usage) {
            usageData = chunk.usage;
          }
          if (chunk.model) {
            modelName = chunk.model;
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.logger.error({ err: err.message }, 'OpenAI-compat stream error');
      yield {
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: err.message,
        duration_ms: Date.now() - startTime,
        errors: [err.message],
      };
      return;
    }

    const durationMs = Date.now() - startTime;

    const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];
    if (fullContent) {
      content.push({ type: 'text', text: fullContent });
    }
    for (const [, tc] of toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
    }

    if (content.length > 0) {
      yield {
        type: 'assistant',
        uuid: nextId(),
        message: { content },
      };
    }

    const inputTokens = usageData?.prompt_tokens ?? 0;
    const outputTokens = usageData?.completion_tokens ?? 0;
    // Cost estimation: input $0.005/1K tokens, output $0.015/1K tokens (approximate USD equivalent)
    const costUsd = (inputTokens / 1000) * 0.005 + (outputTokens / 1000) * 0.015;

    yield {
      type: 'result',
      subtype: 'success',
      result: fullContent,
      duration_ms: durationMs,
      num_turns: 1,
      total_cost_usd: costUsd,
      modelUsage: {
        [modelName]: {
          inputTokens,
          outputTokens,
          contextWindow: 0,
          costUSD: costUsd,
        },
      },
    };
  }

  private buildSystemPrompt(cwd: string, outputsDir?: string, apiContext?: ApiContext): string {
    const parts: string[] = [];
    if (this.config.systemPrompt) {
      parts.push(this.config.systemPrompt);
    }
    parts.push(`Working directory: ${cwd}`);
    if (outputsDir) parts.push(`Outputs directory: ${outputsDir}`);
    if (apiContext?.botName) parts.push(`Your name: ${apiContext.botName}`);
    return parts.join('\n');
  }
}
