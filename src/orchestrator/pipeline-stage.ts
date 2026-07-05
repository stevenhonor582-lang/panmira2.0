import type { SceneType } from './orchestrator.js';

export interface PipelineContext {
  chatId: string;
  botName: string;
  sceneType: SceneType;
  critical?: boolean;
  memories?: unknown[];
  sessionId?: string;
  [key: string]: unknown;
}

export interface PipelineStage<Input = unknown, Output = unknown> {
  execute(input: Input, ctx: PipelineContext): Promise<Output>;
}
