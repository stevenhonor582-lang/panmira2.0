import type { Logger } from '../../utils/logger.js';
import type { CardState } from '../../types.js';
import type { IMessageSender } from '../message-sender.interface.js';
import type { OrchestrationProgress, StepResult } from './types.js';

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
    const currentStep = progress.steps[progress.currentStepIndex];
    const r = currentStep?.result;
    const contextNote = this.buildContextNote(r);

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
      toolCalls: r?.toolCalls ?? [],
      totalTokens: r?.totalTokens,
      contextWindow: r?.contextWindow,
      contextNote,
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

      // Show output for completed/failed/running steps
      const output = s.result?.summary || s.result?.output;
      if (output && (s.status === 'passed' || s.status === 'failed' || s.status === 'running')) {
        const preview = output.slice(0, 120).replace(/\n/g, ' ');
        lines.push(`   _${preview}${output.length > 120 ? '...' : ''}_`);
      }
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

  private buildContextNote(r?: StepResult): string | undefined {
    if (!r) return undefined;

    const lines: string[] = [];

    if (r.currentSkill) {
      lines.push(`🔧 Skill: \`${r.currentSkill}\``);
    }

    const hasSub = (r.toolCalls ?? []).some(
      (t) => t.name === 'Task' || t.name === 'Agent',
    );
    lines.push(hasSub ? '🤖 Mode: Subagent' : '🧭 Mode: Main');

    const mcpCalls = (r.toolCalls ?? []).filter((t) => t.name.startsWith('mcp__'));
    if (mcpCalls.length > 0) {
      const names = mcpCalls.map((t) => `\`${t.name}\``).join(', ');
      lines.push(`📡 MCP: ${names}`);
    }

    if (r.totalTokens && r.contextWindow) {
      const pct = Math.round((r.totalTokens / r.contextWindow) * 100);
      const usedK = (r.totalTokens / 1000).toFixed(1);
      const totalK = `${Math.round(r.contextWindow / 1000)}k`;
      lines.push(`📊 上下文: ${usedK}k/${totalK} (${pct}%)`);
    }

    if (r.costUsd) {
      lines.push(`💰 $${r.costUsd.toFixed(4)}`);
    }

    return lines.length > 0 ? lines.join('\n') : undefined;
  }
}
