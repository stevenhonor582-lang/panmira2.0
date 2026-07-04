import type { SDKMessage } from './executor.js';
import type {
  BackgroundEvent,
  BackgroundTaskStatus,
  CardState,
  ToolCall,
  PendingQuestion,
} from '../../feishu/card-builder.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff']);

/**
 * Tools handled by the SDK in bypassPermissions mode.
 * The SDK auto-responds to these; we only detect them for side effects
 * (e.g. sending plan content to the user) — we must NOT call sendAnswer
 * or we'll create duplicate tool_results that cause API 400 errors.
 */
const SDK_HANDLED_TOOLS = new Set(['ExitPlanMode', 'EnterPlanMode']);

export interface DetectedTool {
  toolUseId: string;
  name: string;
}

export class StreamProcessor {
  private responseText = '';
  private toolCalls: ToolCall[] = [];
  private _toolParents: ('main' | 'sub')[] = [];
  private currentToolName: string | null = null;
  private sessionId: string | undefined;
  private costUsd: number | undefined;
  private durationMs: number | undefined;
  private _imagePaths: Set<string> = new Set();
  private _pendingQuestions: PendingQuestion[] = [];
  private _sdkHandledTools: DetectedTool[] = [];
  private _planFilePath: string | null = null;
  private _model: string | undefined;
  private _totalTokens: number | undefined;
  private _contextWindow: number | undefined;
  // Track per-API-call usage from stream events for accurate context window display
  private _lastInputTokens: number | undefined;
  private _lastOutputTokens: number | undefined;
  private _lastCacheReadTokens: number | undefined;
  private _lastCacheCreationTokens: number | undefined;
  // Live background tasks (Monitor, etc.) — task_id → latest rollup.
  private _backgroundEvents: Map<string, BackgroundEvent> = new Map();

  constructor(
    private userPrompt: string,
    private _overrideContextWindow?: number,
    private _fallbackModel?: string,
  ) {}

  processMessage(message: SDKMessage): CardState {
    // Capture session_id from any message
    if (message.session_id) {
      this.sessionId = message.session_id;
    }

    switch (message.type) {
      case 'system':
        // SDK emits task_started / task_progress / task_notification / task_updated
        // as type='system' with a specific subtype. Surface them so Feishu can
        // show background task (e.g. Monitor) progress mid-turn.
        this.processSystemMessage(message);
        break;

      case 'assistant':
        this.processAssistantMessage(message);
        break;

      case 'result':
        return this.processResultMessage(message);

      case 'stream_event':
        this.processStreamEvent(message);
        break;

      case 'task_notification':
        // Codex translator synthesizes this shape for top-level error events.
        this.recordCodexTaskNotification(message);
        break;

      case 'tool_use_summary':
        break;
    }

    // Determine running status
    const hasActiveTools = this.toolCalls.some((t) => t.status === 'running');
    const status =
      this._pendingQuestions.length > 0
        ? 'waiting_for_input'
        : hasActiveTools
          ? 'running'
          : this.responseText
            ? 'running'
            : 'thinking';

    return {
      status,
      userPrompt: this.userPrompt,
      responseText: this.responseText,
      toolCalls: [...this.toolCalls],
      sessionCostUsd: this.costUsd,
      durationMs: this.durationMs,
      pendingQuestion: this._pendingQuestions[0] || undefined,
      backgroundEvents: this._backgroundEvents.size > 0 ? [...this._backgroundEvents.values()] : undefined,
      contextNote: this._contextNote,
    };
  }

  private processSystemMessage(message: SDKMessage): void {
    const subtype = (message as { subtype?: string }).subtype;
    if (!subtype) return;
    switch (subtype) {
      case 'task_started':
      case 'task_progress':
      case 'task_notification':
      case 'task_updated':
        this.recordTaskEvent(message, subtype);
        break;
      default:
        break;
    }
  }

  private recordTaskEvent(message: SDKMessage, subtype: string): void {
    const m = message as Record<string, unknown>;
    const taskId = typeof m.task_id === 'string' ? m.task_id : undefined;
    if (!taskId) return;

    // Ambient/housekeeping tasks (skip_transcript=true) stay hidden from the card.
    if (m.skip_transcript === true) return;

    const prior = this._backgroundEvents.get(taskId);
    const patch = (m.patch as Record<string, unknown> | undefined) ?? undefined;
    const description =
      typeof m.description === 'string'
        ? m.description
        : typeof patch?.description === 'string'
          ? (patch.description as string)
          : prior?.description;

    let status: BackgroundTaskStatus = prior?.status ?? 'running';
    if (subtype === 'task_notification') {
      const s = typeof m.status === 'string' ? m.status : undefined;
      if (s === 'completed' || s === 'failed' || s === 'stopped') status = s;
    } else if (subtype === 'task_updated') {
      const s = typeof patch?.status === 'string' ? (patch.status as string) : undefined;
      if (s === 'completed') status = 'completed';
      else if (s === 'failed' || s === 'killed') status = 'failed';
      else if (s === 'running') status = 'running';
    }

    // SDKTaskNotificationMessage.summary carries the last-line event text for Monitor
    // and the final message for one-shot background tasks. SDKTaskProgressMessage
    // also exposes an optional summary for in-flight updates.
    const summary = typeof m.summary === 'string' ? m.summary : undefined;
    const lastEvent = summary ?? prior?.lastEvent;

    this._backgroundEvents.set(taskId, {
      taskId,
      description: description ?? prior?.description ?? 'background task',
      status,
      lastEvent,
    });
  }

  private recordCodexTaskNotification(message: SDKMessage): void {
    const m = message as Record<string, unknown>;
    const result = typeof m.result === 'string' ? m.result : undefined;
    if (!result) return;
    const taskId = typeof m.session_id === 'string' ? m.session_id : 'codex';
    this._backgroundEvents.set(taskId, {
      taskId,
      description: 'Codex notification',
      status: 'running',
      lastEvent: result,
    });
  }

  private processAssistantMessage(message: SDKMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        // Only accumulate text from top-level assistant messages (not subagent)
        if (message.parent_tool_use_id === null || message.parent_tool_use_id === undefined) {
          // Full message text replaces accumulated stream text
          this.responseText = block.text;
        }
      } else if (block.type === 'tool_use' && block.name) {
        const isSub = message.parent_tool_use_id != null;
        this.addToolCall(block.name, block.input, isSub);
        // Detect interactive tools at top level
        if (message.parent_tool_use_id === null || message.parent_tool_use_id === undefined) {
          if (block.name === 'AskUserQuestion' && block.id && block.input) {
            this.extractPendingQuestion(block.id, block.input);
          } else if (SDK_HANDLED_TOOLS.has(block.name) && block.id) {
            this._sdkHandledTools.push({ toolUseId: block.id, name: block.name });
          }
        }
      } else if (block.type === 'tool_result') {
        this.completeCurrentTool();
      }
    }
  }

  private processStreamEvent(message: SDKMessage): void {
    const event = message.event;
    if (!event) return;

    // Track message_start/message_delta from ALL levels (not just top-level)
    // because these carry per-API-call token usage needed for context display
    if (event.type === 'message_start') {
      const usage = (event as any).message?.usage;
      if (usage) {
        this._lastInputTokens = usage.input_tokens ?? 0;
        this._lastCacheReadTokens = usage.cache_read_input_tokens ?? 0;
        this._lastCacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
      } else {
      }
    } else if (event.type === 'message_delta') {
      const usage = (event as any).usage;
      if (usage?.output_tokens != null) {
        this._lastOutputTokens = usage.output_tokens;
      }
    }

    // Only process top-level stream events for content
    if (message.parent_tool_use_id !== null && message.parent_tool_use_id !== undefined) {
      return;
    }

    if (event.type === 'content_block_start') {
      const block = event.content_block;
      if (block?.type === 'tool_use' && block.name) {
        this.addToolCall(block.name, undefined, false);
      }
      if (block?.type === 'text') {
        // Reset for new text block
      }
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        this.responseText += delta.text;
      }
    } else if (event.type === 'content_block_stop') {
      // Tool may be complete
      // Actual completion is tracked via assistant messages
    }
  }

  private processResultMessage(message: SDKMessage): CardState {
    this.costUsd = message.total_cost_usd;
    this.durationMs = message.duration_ms;

    // Extract model usage info (per-model breakdown from SDK)
    if (message.modelUsage) {
      const models = Object.keys(message.modelUsage);
      if (models.length > 0) {
        // Primary model is the one with highest cost
        const primaryModel = models.reduce((a, b) =>
          (message.modelUsage![a].costUSD ?? 0) >= (message.modelUsage![b].costUSD ?? 0) ? a : b,
        );
        const mu = message.modelUsage[primaryModel];
        this._model = primaryModel;
        // Use inferred context window if available (more accurate for 3rd-party providers like DeepSeek)
        // otherwise fall back to what the API reports
        this._contextWindow = this.inferContextWindow(primaryModel) || mu.contextWindow;
        // Use last API call's tokens from stream events (accurate context window occupation)
        // Falls back to cumulative modelUsage input+output if stream events weren't captured
        if (this._lastInputTokens != null) {
          this._totalTokens =
            this._lastInputTokens +
            (this._lastCacheReadTokens ?? 0) +
            (this._lastCacheCreationTokens ?? 0) +
            (this._lastOutputTokens ?? 0);
        } else {
          let totalTokens = 0;
          let totalInput = 0;
          let totalOutput = 0;
          for (const m of models) {
            const inTk = message.modelUsage![m].inputTokens ?? 0;
            const outTk = message.modelUsage![m].outputTokens ?? 0;
            totalTokens += inTk + outTk;
            totalInput += inTk;
            totalOutput += outTk;
          }
          this._totalTokens = totalTokens;
          this._lastInputTokens = totalInput;
          this._lastOutputTokens = totalOutput;
        }
      }
    }

    // Fallback: if modelUsage was empty (third-party proxy), infer from env/config
    if (!this._contextWindow) {
      const fallbackModel = this._fallbackModel || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
      this._contextWindow = this.inferContextWindow(fallbackModel);
      this._model = fallbackModel;

    } else {

    }
    if (!this._totalTokens && (this._lastInputTokens || this._lastOutputTokens)) {
      this._totalTokens = (this._lastInputTokens ?? 0) + (this._lastOutputTokens ?? 0);
    }

    // Mark all tools as done
    for (const tool of this.toolCalls) {
      tool.status = 'done';
    }

    const resultText = message.result || this.responseText;
    const isError = message.subtype !== 'success';
    // SDK sometimes wraps API errors as "success" with the error text as result
    const isApiError = !isError && isApiErrorResult(resultText);

    return {
      status: isError || isApiError ? 'error' : 'complete',
      userPrompt: this.userPrompt,
      responseText: isApiError ? '' : resultText,
      toolCalls: [...this.toolCalls],
      sessionCostUsd: this.costUsd,
      durationMs: this.durationMs,
      errorMessage: isError
        ? message.errors?.join('; ') || `Ended with: ${message.subtype}`
        : isApiError
          ? resultText
          : undefined,
      model: this._model,
      totalTokens: this._totalTokens,
      inputTokens: this._lastInputTokens,
      outputTokens: this._lastOutputTokens,
      cacheReadTokens: this._lastCacheReadTokens,
      cacheCreationTokens: this._lastCacheCreationTokens,
      contextWindow: this._overrideContextWindow ?? this._contextWindow,
      backgroundEvents: this._backgroundEvents.size > 0 ? [...this._backgroundEvents.values()] : undefined,
      contextNote: this._contextNote,
    };
  }

  private addToolCall(name: string, input: unknown, isSub: boolean): void {
    // Complete previous tool
    this.completeCurrentTool();

    this.currentToolName = name;
    const detail = formatToolDetail(name, input);
    this.toolCalls.push({ name, detail, status: 'running' });
    this._toolParents.push(isSub ? 'sub' : 'main');

    // Track image file paths and plan file paths from Write tool
    if (name === 'Write' && input && typeof input === 'object') {
      const filePath = (input as Record<string, unknown>).file_path as string;
      if (filePath && isImagePath(filePath)) {
        this._imagePaths.add(filePath);
      }
      if (filePath && filePath.includes('.claude/plans/') && filePath.endsWith('.md')) {
        this._planFilePath = filePath;
      }
    }
  }

  private completeCurrentTool(): void {
    if (this.currentToolName) {
      const tool = this.toolCalls.find((t) => t.name === this.currentToolName && t.status === 'running');
      if (tool) {
        tool.status = 'done';
      }
      this.currentToolName = null;
    }
  }

  private extractPendingQuestion(toolUseId: string, input: unknown): void {
    if (!input || typeof input !== 'object') return;
    const inp = input as Record<string, unknown>;
    const questions = inp.questions;
    if (!Array.isArray(questions)) return;

    const parsed = questions.map((q: any) => ({
      question: String(q.question || ''),
      header: String(q.header || ''),
      options: Array.isArray(q.options)
        ? q.options.map((o: any) => ({
            label: String(o.label || ''),
            description: String(o.description || ''),
          }))
        : [],
      multiSelect: Boolean(q.multiSelect),
    }));

    // Queue instead of overwrite — supports multiple AskUserQuestion calls
    this._pendingQuestions.push({ toolUseId, questions: parsed });
  }

  /** Remove the first pending question (after it's been fully answered). */
  clearPendingQuestion(): void {
    this._pendingQuestions.shift();
  }

  /** Peek at the first pending question without removing it. */
  getPendingQuestion(): PendingQuestion | null {
    return this._pendingQuestions[0] ?? null;
  }

  /**
   * Get and clear any SDK-handled tools detected in the stream.
   * These tools are auto-responded to by the SDK in bypassPermissions mode;
   * the bridge should NOT call sendAnswer for them, only perform side effects
   * like sending plan content to the user.
   */
  drainSdkHandledTools(): DetectedTool[] {
    if (this._sdkHandledTools.length === 0) return [];
    const tools = [...this._sdkHandledTools];
    this._sdkHandledTools = [];
    return tools;
  }

  private _contextNote: string | undefined;

  setContextNote(note: string): void {
    this._contextNote = note;
  }

  /** Return the current card state without processing a new message. */
  getCurrentState(): CardState {
    const hasActiveTools = this.toolCalls.some((t) => t.status === 'running');
    const status =
      this._pendingQuestions.length > 0
        ? 'waiting_for_input'
        : hasActiveTools
          ? 'running'
          : this.responseText
            ? 'running'
            : 'thinking';
    return {
      status,
      userPrompt: this.userPrompt,
      responseText: this.responseText,
      toolCalls: [...this.toolCalls],
      sessionCostUsd: this.costUsd,
      durationMs: this.durationMs,
      pendingQuestion: this._pendingQuestions[0] || undefined,
      backgroundEvents: this._backgroundEvents.size > 0 ? [...this._backgroundEvents.values()] : undefined,
      contextNote: this._contextNote,
    };
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  getImagePaths(): string[] {
    return [...this._imagePaths];
  }

  /** Snapshot of all tool calls made during this step (main + sub). */
  getToolCallsSnapshot(): ToolCall[] {
    return [...this.toolCalls];
  }

  getPlanFilePath(): string | null {
    return this._planFilePath;
  }

  private inferContextWindow(model: string): number | undefined {
    if (model.includes("opus-4")) return 200000;
    if (model.includes("sonnet-4")) return 200000;
    if (model.includes("haiku")) return 200000;
    if (model.includes("gpt-4") || model.includes("o1") || model.includes("o3")) return 128000;
    if (model.includes("GLM")) return 200000;
    if (model.includes("deepseek")) return 1000000;
    // MiniMax M-series — per minimaxi.com 官方页 + 实测 (2026-06-08)
    // 官方宣称 1M (MSA 稀疏注意力), 单次 messages input 上限实测:
    //   M3:  521350 OK, 525000 FAIL — API 硬封顶 ~521K
    //   配 512K (8K 安全边距), 安全运行
    // M2.7: 待测 (历史粗测 350K 失败, 暂保留 300K)
    // M1:  待测, 暂按官方 1M
    // 精测脚本: scripts/test-minimax-context.mjs
    if (model.includes("MiniMax-M3") || model.includes("MiniMax-M3-")) return 512000;
    if (model.includes("MiniMax-M2.7") || model.includes("MiniMax-M2.7-")) return 300000;
    if (model.includes("MiniMax-M1") || model.includes("MiniMax-M1-")) return 1000000;
    if (model.includes("MiniMax")) return 200000; // safe fallback for unknown M-series
    return undefined;
  }
}

function isImagePath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/** Scan text for absolute image file paths */
export function extractImagePaths(text: string): string[] {
  const pathRegex = /\/[\w./_-]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff)/gi;
  const matches = text.match(pathRegex) || [];
  return [...new Set(matches)];
}

function formatToolDetail(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';

  const inp = input as Record<string, unknown>;

  switch (name) {
    case 'Read':
      return inp.file_path ? `\`${shortenPath(inp.file_path as string)}\`` : '';
    case 'Write':
      return inp.file_path ? `\`${shortenPath(inp.file_path as string)}\`` : '';
    case 'Edit':
      return inp.file_path ? `\`${shortenPath(inp.file_path as string)}\`` : '';
    case 'Bash':
      return inp.command ? `\`${truncate(inp.command as string, 60)}\`` : '';
    case 'Glob':
      return inp.pattern ? `\`${inp.pattern}\`` : '';
    case 'Grep':
      return inp.pattern ? `\`${inp.pattern}\`` : '';
    case 'WebSearch':
      return inp.query ? `"${truncate(inp.query as string, 50)}"` : '';
    case 'WebFetch':
      return inp.url ? `\`${truncate(inp.url as string, 60)}\`` : '';
    case 'Task':
      return inp.description ? `${inp.description}` : '';
    case 'AskUserQuestion': {
      const qs = inp.questions;
      if (Array.isArray(qs) && qs.length > 0) {
        const first = qs[0] as Record<string, unknown>;
        return first.question ? truncate(String(first.question), 50) : '';
      }
      return '';
    }
    default:
      return '';
  }
}

function shortenPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return '.../' + parts.slice(-2).join('/');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

/** Detect API error responses that the SDK wraps as successful results */
function isApiErrorResult(text: string): boolean {
  if (!text) return false;
  return /^API Error:\s*\d{3}\s/i.test(text);
}
