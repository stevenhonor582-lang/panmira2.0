import type { Orchestrator, SceneType } from './orchestrator.js';
import { TeamPipeline } from './team-pipeline.js';
import type { ScenePackLoader } from '../agents/scene-pack-loader.js';
import type { MemoryBridge } from '../memory/memory-bridge.js';
import type { ReviewPanel } from './review-panel.js';
import type { MessageBridge } from '../bridge/message-bridge.js';

export interface MultiBotOutput {
  bot: string;
  result: any;
}

export interface MultiBotResult {
  task: string;
  participatingBots: string[];
  outputs: MultiBotOutput[];
  totalDurationMs: number;
}

export class MultiBotOrchestrator {
  constructor(
    private deps: {
      bridge: MessageBridge;
      reviewPanel: ReviewPanel;
      orchestrator: Orchestrator;
      scenePackLoader: ScenePackLoader;
      memoryBridge: MemoryBridge;
      bots: string[];
    },
  ) {}

  async execute(task: string): Promise<MultiBotResult> {
    const start = Date.now();
    const outputs = await Promise.all(this.deps.bots.map(async bot => {
      const pipeline = new TeamPipeline({
        orchestrator: this.deps.orchestrator,
        scenePackLoader: this.deps.scenePackLoader,
        memoryBridge: this.deps.memoryBridge,
        reviewPanel: this.deps.reviewPanel,
        bridge: this.deps.bridge,
        botName: bot,
      });
      const r = await pipeline.execute(task, { chatId: `multi-${bot}-${Date.now()}`, botName: bot });
      return { bot, result: r };
    }));
    return {
      task,
      participatingBots: this.deps.bots,
      outputs,
      totalDurationMs: Date.now() - start,
    };
  }
}
