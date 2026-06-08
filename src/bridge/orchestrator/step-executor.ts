import type { BotConfigBase } from '../../config.js';
import type { Logger } from '../../utils/logger.js';
import type { Engine, Executor, EngineName } from '../../engines/index.js';
import { createEngine, resolveEngineName, StreamProcessor } from '../../engines/index.js';
import type { StepResult } from './types.js';

export interface ExecuteStepInput {
  prompt: string;
  cwd: string;
  outputsDir: string;
  abortController: AbortController;
  chatId: string;
  model?: string;
  /** Current step's skill name (from OrchestrationStep.skill) — passed through to StepResult for card display */
  currentSkill?: string;
}

export class StepExecutor {
  constructor(
    private engineCache: Map<EngineName, { engine: Engine; executor: Executor }>,
    private logger: Logger,
    private config: BotConfigBase,
  ) {}

  async execute(input: ExecuteStepInput): Promise<StepResult> {
    const startTime = Date.now();
    const executor = this.getExecutor();

    const executionHandle = executor.startExecution({
      prompt: input.prompt,
      cwd: input.cwd,
      sessionId: undefined,
      abortController: input.abortController,
      outputsDir: input.outputsDir,
      apiContext: { botName: this.config.name, chatId: input.chatId },
      model: input.model || this.config.claude.model,
    });

    const processor = new StreamProcessor(input.prompt, this.config.contextWindow, input.model);
    let lastState: any = null;

    try {
      for await (const message of executionHandle.stream) {
        if (input.abortController.signal.aborted) break;
        const state = processor.processMessage(message);
        lastState = state;
        if (state.status === 'complete' || state.status === 'error') break;
      }
    } finally {
      try {
        executionHandle.finish();
      } catch {
        /* ignore */
      }
    }

    const durationMs = Date.now() - startTime;
    const model = input.model || this.config.claude.model || '';

    if (!lastState) {
      return {
        step: '',
        success: false,
        output: '',
        summary: '',
        gateResults: [],
        durationMs,
        costUsd: 0,
        model,
        inputTokens: 0,
        outputTokens: 0,
        currentSkill: input.currentSkill,
      };
    }

    return {
      step: '',
      success: lastState.status === 'complete',
      output: lastState.responseText || '',
      summary: lastState.responseText ? lastState.responseText.slice(0, 500) : '',
      gateResults: [],
      durationMs,
      costUsd: lastState.costUsd || 0,
      model: lastState.model || model,
      inputTokens: lastState.inputTokens || 0,
      outputTokens: lastState.outputTokens || 0,
      toolCalls: lastState.toolCalls,
      totalTokens: lastState.totalTokens,
      contextWindow: lastState.contextWindow,
      currentSkill: input.currentSkill,
    };
  }

  private getExecutor(): Executor {
    const defaultName = resolveEngineName(this.config);
    const entry = this.engineCache.get(defaultName);
    if (entry) return entry.executor;

    const engine = createEngine(this.config, this.logger);
    const executor = engine.createExecutor();
    this.engineCache.set(defaultName, { engine, executor });
    return executor;
  }
}
