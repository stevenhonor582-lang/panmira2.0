import type { PipelineContext } from '../orchestrator/pipeline-stage.js';
import type { MessageBridge, ApiTaskOptions, ApiTaskResult } from '../bridge/message-bridge.js';

export interface ExpertConfig {
  name: string;
  engine: string;
  prompt: string;
}

export interface ExpertResult {
  content: string;
  engine: string;
  durationMs: number;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class ExpertSubagent {
  constructor(
    private config: ExpertConfig,
    private opts: { bridge: MessageBridge; botName: string },
  ) {}

  async execute(prompt: string, ctx: PipelineContext): Promise<ExpertResult> {
    const start = Date.now();
    const fullPrompt = `${this.config.prompt}\n\n---\n\n${prompt}`;
    const opts: ApiTaskOptions = {
      prompt: fullPrompt,
      chatId: ctx.chatId,
      userId: 'team-pipeline',
      sendCards: false,
      onUpdate: () => {},
      onOutputFiles: () => {},
    };
    const r: ApiTaskResult = await this.opts.bridge.executeApiTask(opts);
    if (!r.success) throw new Error(r.error || 'ExpertSubagent failed');
    return {
      content: r.responseText,
      engine: this.config.engine,
      durationMs: Date.now() - start,
      sessionId: r.sessionId,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  }
}
