import type { PipelineContext } from './pipeline-stage.js';

export interface Hook {
  name: string;
  validate: (output: string) => true | string;
}

export class HooksGate {
  constructor(private opts: { hooks: Hook[] }) {}

  async runAfterStage(stage: string, output: string, _ctx: PipelineContext): Promise<void> {
    for (const hook of this.opts.hooks) {
      const result = hook.validate(output);
      if (result !== true) {
        throw new Error(`[${stage}] hook "${hook.name}" failed: ${result}`);
      }
    }
  }
}
