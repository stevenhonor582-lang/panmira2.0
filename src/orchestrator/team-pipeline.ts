import type { Orchestrator, SceneType } from './orchestrator.js';
import type { ScenePackLoader, ScenePack } from '../agents/scene-pack-loader.js';
import { ExpertSubagent } from '../agents/expert-subagent.js';
import type { MessageBridge } from '../bridge/message-bridge.js';
import type { ReviewPanel } from './review-panel.js';
import type { MemoryBridge } from '../memory/memory-bridge.js';

export type PipelineStageName = 'collect' | 'analyze' | 'produce' | 'review';

export interface PipelineStageResult {
  stage: PipelineStageName;
  status: 'complete' | 'error';
  output: string;
  reviewPassed?: boolean;
  reviewFeedback?: string;
  durationMs: number;
}

export interface PipelineResult {
  status: 'complete' | 'error';
  sceneType: SceneType;
  stages: PipelineStageResult[];
  finalOutput: string;
  totalDurationMs: number;
}

export interface TeamPipelineDeps {
  orchestrator: Orchestrator;
  scenePackLoader: ScenePackLoader;
  memoryBridge: MemoryBridge;
  reviewPanel: ReviewPanel;
  bridge: MessageBridge;
  botName: string;
  hooksGate?: { runAfterStage(stage: string, output: string, ctx: any): Promise<void> };
}

export class TeamPipeline {
  constructor(private deps: TeamPipelineDeps) {}

  static build(deps: {
    bridge: MessageBridge;
    pool: { query: (...args: any[]) => Promise<any> };
    botName: string;
    reviewExpert: { name: string; engine: string; prompt: string };
  }): TeamPipeline {
    const { Orchestrator } = require('./orchestrator.js') as typeof import('./orchestrator.js');
    const { ScenePackLoader } = require('../agents/scene-pack-loader.js') as typeof import('../agents/scene-pack-loader.js');
    const { MemoryBridge } = require('../memory/memory-bridge.js') as typeof import('../memory/memory-bridge.js');
    const { ReviewPanel } = require('./review-panel.js') as typeof import('./review-panel.js');
    return new TeamPipeline({
      orchestrator: new Orchestrator({}),
      scenePackLoader: new ScenePackLoader({ pool: deps.pool as any }),
      memoryBridge: new MemoryBridge({ pool: deps.pool as any }),
      reviewPanel: new ReviewPanel({ reviewExpert: deps.reviewExpert }, { bridge: deps.bridge }),
      bridge: deps.bridge,
      botName: deps.botName,
    });
  }

  async execute(task: string, ctx: { chatId: string; botName: string }): Promise<PipelineResult> {
    const totalStart = Date.now();
    const sceneType = this.deps.orchestrator.identifyScene(task);
    if (sceneType === 'unknown') {
      return {
        status: 'error',
        sceneType: 'unknown',
        stages: [],
        finalOutput: '无法识别场景,请明确指定(开发 / 内容 / 数据)',
        totalDurationMs: Date.now() - totalStart,
      };
    }
    const pack: ScenePack = await this.deps.scenePackLoader.load(sceneType);
    const pipelineCtx = { ...ctx, sceneType };
    const stages: PipelineStageResult[] = [];

    const runExpert = async (stage: 'collect' | 'analyze' | 'produce', memoryCtx?: string) => {
      const cfg = pack.experts[stage];
      if (!cfg) throw new Error(`ScenePack missing expert: ${stage}`);
      const prompt = memoryCtx
        ? `${cfg.prompt}\n\n## 前序记忆\n${memoryCtx}\n\n## 任务\n${task}`
        : `${cfg.prompt}\n\n## 任务\n${task}`;
      const es = new ExpertSubagent(cfg, { bridge: this.deps.bridge, botName: this.deps.botName });
      const start = Date.now();
      const r = await es.execute(prompt, pipelineCtx);
      await this.deps.memoryBridge.writeStageOutput(pipelineCtx, stage, r.content);
      stages.push({ stage, status: 'complete', output: r.content, durationMs: Date.now() - start });
      if (this.deps.hooksGate) {
        await this.deps.hooksGate.runAfterStage(stage, r.content, pipelineCtx);
      }
      return r.content;
    };

    // 1. 采集(读 memory)
    const priorMemories = await this.deps.memoryBridge.readMemories(pipelineCtx, sceneType, 10);
    const memoryCtx = priorMemories.map((m: any) => m.content).join('\n---\n');
    const collectOut = await runExpert('collect', memoryCtx);
    // 2. 分析
    const analyzeOut = await runExpert('analyze', collectOut);
    // 3. 产出
    const produceOut = await runExpert('produce', analyzeOut);
    // 4. 审查(带回流,最多 3 次)
    let review = await this.deps.reviewPanel.review(produceOut, pipelineCtx);
    let finalOutput = produceOut;
    let produceContent = produceOut;
    for (let i = 0; !review.passed && i < 3; i++) {
      const es = new ExpertSubagent(pack.experts.produce!, { bridge: this.deps.bridge, botName: this.deps.botName });
      const reviewStart = Date.now();
      const improved = await es.execute(`审查反馈:${review.feedback}\n\n请改进:\n${produceContent}`, pipelineCtx);
      produceContent = improved.content;
      review = await this.deps.reviewPanel.review(produceContent, pipelineCtx);
      finalOutput = produceContent;
      stages[stages.length - 1] && (stages[stages.length - 1].durationMs = Date.now() - reviewStart);
    }
    stages.push({
      stage: 'review',
      status: review.passed ? 'complete' : 'error',
      output: finalOutput,
      reviewPassed: review.passed,
      reviewFeedback: review.feedback,
      durationMs: 0,
    });

    return {
      status: review.passed ? 'complete' : 'error',
      sceneType,
      stages,
      finalOutput,
      totalDurationMs: Date.now() - totalStart,
    };
  }
}
