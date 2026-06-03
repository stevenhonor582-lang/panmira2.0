import type { Logger } from '../../utils/logger.js';
import type { CardState } from '../../types.js';
import type { IMessageSender } from '../message-sender.interface.js';
import type { OrchestrationProgress } from './types.js';

export class CardUpdater {
  constructor(private logger: Logger) {}

  async update(
    chatId: string,
    messageId: string,
    progress: OrchestrationProgress,
    getSender: (chatId?: string) => IMessageSender,
  ): Promise<void> {
    const sender = getSender(chatId);
    if (!sender.updateCard) return;

    const responseText = this.renderProgress(progress);

    const state: CardState = {
      status:
        progress.status === 'running'
          ? 'running'
          : progress.status === 'waiting_user'
            ? 'waiting_for_input'
            : progress.status === 'completed'
              ? 'complete'
              : 'error',
      userPrompt: `执行: ${progress.intentName}`,
      responseText,
      toolCalls: [],
    };

    try {
      await sender.updateCard(messageId, state);
    } catch (err: any) {
      this.logger.warn({ err: err?.message, chatId }, 'Card update failed');
    }
  }

  private renderProgress(progress: OrchestrationProgress): string {
    const lines: string[] = [];
    const total = progress.totalSteps;
    const completed = progress.steps.filter((s) => s.status === 'passed').length;

    lines.push(`**${progress.intentName}** (${completed}/${total})`);
    lines.push('');

    for (let i = 0; i < progress.steps.length; i++) {
      const s = progress.steps[i];
      const icon =
        s.status === 'passed'
          ? '✅'
          : s.status === 'failed'
            ? '❌'
            : s.status === 'running'
              ? '🔄'
              : s.status === 'skipped'
                ? '⏭️'
                : '⏳';
      lines.push(`${icon} ${s.step}`);
    }

    if (progress.status === 'failed') {
      const failedStep = progress.steps.find((s) => s.status === 'failed');
      if (failedStep?.result) {
        const failedGates = failedStep.result.gateResults.filter((g) => !g.passed);
        if (failedGates.length > 0) {
          lines.push('');
          lines.push(`❌ 失败: ${failedGates.map((g) => g.gate).join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }
}
