import type { MessageBridge } from '../bridge/message-bridge.js';
import type { ExpertConfig } from '../agents/expert-subagent.js';
import type { PipelineContext } from './pipeline-stage.js';

export interface ReviewResult {
  passed: boolean;
  feedback?: string;
  reviewType: 'single' | 'panel';
  votes?: { passed: boolean; reviewer: string }[];
}

const REVIEW_INSTRUCTION = (produce: string) =>
  `请审查以下产出。如果通过,只回复 "PASS";如果不通过,回复 "FAIL: <具体理由>"。\n\n---\n\n${produce}`;

export class ReviewPanel {
  constructor(
    private opts: {
      reviewExpert: ExpertConfig;
      criticalMode?: boolean;
    },
    private deps: { bridge: MessageBridge },
  ) {}

  async review(produce: string, ctx: PipelineContext & { critical?: boolean }): Promise<ReviewResult> {
    const isCritical = ctx.critical ?? this.opts.criticalMode ?? false;

    if (!isCritical) {
      const out = await this.deps.bridge.executeApiTask({
        prompt: `${this.opts.reviewExpert.prompt}\n\n${REVIEW_INSTRUCTION(produce)}`,
        chatId: `${ctx.chatId}-review`,
        userId: 'review-panel',
        sendCards: false,
      });
      const text = out.responseText.trim();
      const passed = text.startsWith('PASS');
      return {
        passed,
        feedback: passed ? undefined : text,
        reviewType: 'single',
      };
    }

    // Panel mode: 3 reviewers (主审 + 反方 + 中立),majority wins
    const reviewers = [
      this.opts.reviewExpert,
      { ...this.opts.reviewExpert, name: `${this.opts.reviewExpert.name}(反方)`, prompt: `${this.opts.reviewExpert.prompt}\n你是反方审查官,要挑刺和质疑。` },
      { ...this.opts.reviewExpert, name: `${this.opts.reviewExpert.name}(中立)`, prompt: `${this.opts.reviewExpert.prompt}\n你是中立审查官。` },
    ];

    const votes = await Promise.all(reviewers.map(async (r) => {
      const out = await this.deps.bridge.executeApiTask({
        prompt: `${r.prompt}\n\n${REVIEW_INSTRUCTION(produce)}`,
        chatId: `${ctx.chatId}-panel-${r.name}`,
        userId: 'review-panel',
        sendCards: false,
      });
      const passed = out.responseText.trim().startsWith('PASS');
      return { passed, reviewer: r.name };
    }));

    const passed = votes.filter(v => v.passed).length >= 2;
    return {
      passed,
      feedback: passed ? undefined : `${votes.filter(v => !v.passed).map(v => v.reviewer).join(', ')} 反对`,
      reviewType: 'panel',
      votes,
    };
  }
}
