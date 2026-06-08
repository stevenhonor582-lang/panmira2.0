// Re-export shared types so existing imports from this module continue to work
export type {
  CardStatus,
  ToolCall,
  PendingQuestion,
  CardState,
  BackgroundEvent,
  BackgroundTaskStatus,
} from '../types.js';
import type { CardState, CardStatus } from '../types.js';

const STATUS_CONFIG: Record<CardStatus, { color: string; title: string; icon: string }> = {
  preparing: { color: 'blue', title: '准备中...', icon: '🔍' },
  thinking: { color: 'blue', title: '思考中...', icon: '💡' },
  running: { color: 'blue', title: '执行中...', icon: '⚡' },
  complete: { color: 'green', title: '完成', icon: '✅' },
  error: { color: 'red', title: '出错', icon: '❌' },
  waiting_for_input: { color: 'yellow', title: '等待输入', icon: '❓' },
};

const BG_ICON: Record<'running' | 'completed' | 'failed' | 'stopped', string> = {
  running: '⏳',
  completed: '✅',
  failed: '❌',
  stopped: '⏹️',
};

const MAX_VISIBLE_TOOLS = 3;
const MAX_CONTENT_LENGTH = 28000;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function truncateContent(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  const half = Math.floor(MAX_CONTENT_LENGTH / 2) - 50;
  return text.slice(0, half) + '\n\n... (内容过长已截断) ...\n\n' + text.slice(-half);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m${sec}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatModelName(model: string): string {
  return model
    .replace(/^claude-/, '')
    .replace(/^glm-/, 'GLM-')
    .replace(/^openai-compat:/, '');
}

export function buildCard(state: CardState): string {
  const config = STATUS_CONFIG[state.status];
  const elements: unknown[] = [];

  const headerTitle = buildHeaderTitle(state, config);

  // Tool calls (collapsed)
  const toolSection = buildToolSection(state);
  if (toolSection) {
    elements.push({ tag: 'markdown', content: toolSection });
    elements.push({ tag: 'hr' });
  }

  // Execution context (mode, MCP) — 可观测层升级阶段 1.1
  const contextSection = buildContextSection(state);
  if (contextSection) {
    elements.push({ tag: 'markdown', content: contextSection });
    elements.push({ tag: 'hr' });
  }

  // Background tasks
  if (state.backgroundEvents && state.backgroundEvents.length > 0) {
    const lines = state.backgroundEvents.map((ev) => {
      const icon = BG_ICON[ev.status];
      const desc = truncate(ev.description, 40);
      const last = ev.lastEvent ? ` _${truncate(ev.lastEvent, 80)}_` : '';
      return `${icon} ${desc}${last}`;
    });
    elements.push({ tag: 'markdown', content: lines.join('\n') });
    elements.push({ tag: 'hr' });
  }

  // Context note (iron laws, skills, knowledge — persistent during execution)
  if (state.contextNote) {
    elements.push({ tag: 'markdown', content: state.contextNote });
    elements.push({ tag: 'hr' });
  }

  // Response content
  if (state.responseText) {
    elements.push({ tag: 'markdown', content: truncateContent(state.responseText) });
  } else if (state.status === 'thinking' || state.status === 'preparing') {
    const promptPreview = truncate(state.userPrompt || '', 80);
    elements.push({
      tag: 'markdown',
      content: promptPreview ? `> ${promptPreview}\n\n正在分析...` : '正在思考...',
    });
  }

  // Pending question
  if (state.pendingQuestion) {
    elements.push({ tag: 'hr' });
    state.pendingQuestion.questions.forEach((q, qi) => {
      const descLines = q.options.map((opt, i) => `**${i + 1}.** ${opt.label} — _${opt.description}_`);
      elements.push({
        tag: 'markdown',
        content: [`**[${q.header}] ${q.question}**`, '', ...descLines].join('\n'),
      });
      const actions = q.options.map((opt, oi) => ({
        tag: 'button',
        text: { tag: 'plain_text', content: `${oi + 1}. ${opt.label}` },
        type: 'primary',
        value: {
          action: 'answer_question',
          toolUseId: state.pendingQuestion!.toolUseId,
          questionIndex: qi,
          optionIndex: oi,
        },
      }));
      elements.push({ tag: 'action', actions });
    });
    elements.push({ tag: 'markdown', content: '_点击按钮选择，或直接输入自定义答案_' });
  }

  // Error
  if (state.errorMessage) {
    elements.push({ tag: 'markdown', content: `**Error:** ${state.errorMessage}` });
  }

  // Stats footer
  const statsLine = buildStatsLine(state);
  if (statsLine) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: statsLine }],
    });
  }

  const card = {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: config.color,
      title: { content: headerTitle, tag: 'plain_text' },
    },
    elements,
  };

  return JSON.stringify(card);
}

function buildHeaderTitle(state: CardState, config: (typeof STATUS_CONFIG)[CardStatus]): string {
  if (state.status === 'running') {
    const activeTool = state.toolCalls.find((t) => t.status === 'running');
    if (activeTool) {
      const detail = activeTool.detail ? ` ${activeTool.detail}` : '';
      return `${config.icon} ${activeTool.name}${detail}`;
    }
  }
  if (state.status === 'complete' && state.durationMs !== undefined) {
    return `${config.icon} 完成 · ${formatDuration(state.durationMs)}`;
  }
  if (state.status === 'error') {
    return `${config.icon} 出错`;
  }
  return `${config.icon} ${config.title}`;
}

function buildToolSection(state: CardState): string | null {
  if (state.toolCalls.length === 0) return null;

  const total = state.toolCalls.length;
  const running = state.toolCalls.filter((t) => t.status === 'running').length;

  if (total <= MAX_VISIBLE_TOOLS) {
    return state.toolCalls
      .map((t) => {
        const icon = t.status === 'running' ? '⏳' : '✅';
        return `${icon} **${t.name}** ${t.detail}`;
      })
      .join('\n');
  }

  const recent = state.toolCalls.slice(-MAX_VISIBLE_TOOLS);
  const lines = recent.map((t) => {
    const icon = t.status === 'running' ? '⏳' : '✅';
    return `${icon} **${t.name}** ${t.detail}`;
  });
  const summary = `📋 共 ${total} 步${running > 0 ? `，${running} 步进行中` : '，全部完成'}`;
  return [summary, ...lines].join('\n');
}

function buildContextSection(state: CardState): string | null {
  const lines: string[] = [];

  // Mode: main vs subagent (Claude SDK 的 subagent 工具实际叫 'Task')
  const hasSub = state.toolCalls.some(
    (t) => t.name === 'Task' || t.name === 'Agent',
  );
  lines.push(hasSub ? '🤖 Mode: Subagent' : '🧭 Mode: Main');

  // MCP 工具 (命名 mcp__<server>__<tool>)
  const mcpCalls = state.toolCalls.filter((t) => t.name.startsWith('mcp__'));
  if (mcpCalls.length > 0) {
    const seen = new Set<string>();
    const names = mcpCalls
      .map((t) => {
        if (seen.has(t.name)) return null;
        seen.add(t.name);
        return `\`${t.name}\``;
      })
      .filter((x): x is string => x !== null)
      .join(', ');
    lines.push(`📡 MCP: ${names}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildStatsLine(state: CardState): string | null {
  const parts: string[] = [];

  if (state.totalTokens && state.contextWindow) {
    const pct = Math.round((state.totalTokens / state.contextWindow) * 100);
    const usedK = state.totalTokens >= 1000 ? `${(state.totalTokens / 1000).toFixed(1)}k` : `${state.totalTokens}`;
    const totalK = `${Math.round(state.contextWindow / 1000)}k`;
    parts.push(`上下文 ${usedK}/${totalK} (${pct}%)`);
  }

  if (state.model) {
    parts.push(formatModelName(state.model));
  }

  if (state.status === 'complete' || state.status === 'error') {
    if (state.sessionCostUsd != null) {
      parts.push(formatCost(state.sessionCostUsd));
    }
    if (state.durationMs !== undefined) {
      parts.push(formatDuration(state.durationMs));
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function buildHelpCard(): string {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { content: '📖 帮助', tag: 'plain_text' },
    },
    elements: [
      {
        tag: 'markdown',
        content: [
          '**命令列表:**',
          '`/reset` - 清除会话，重新开始',
          '`/stop` - 中止当前任务',
          '`/status` - 查看会话状态',
          '`/memory` - 记忆文档操作',
          '`/help` - 显示帮助',
          '',
          '**使用说明:**',
          '发送任意文本即可开始对话。',
          '每个聊天有独立的会话和工作目录。',
          '',
          '**记忆命令:**',
          '`/memory list` - 查看文档列表',
          '`/memory search <关键词>` - 搜索文档',
          '`/memory status` - 服务状态检查',
        ].join('\n'),
      },
    ],
  };
  return JSON.stringify(card);
}

export function buildStatusCard(
  userId: string,
  workingDirectory: string,
  sessionId: string | undefined,
  isRunning: boolean,
): string {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { content: '📊 状态', tag: 'plain_text' },
    },
    elements: [
      {
        tag: 'markdown',
        content: [
          `**用户:** \`${userId}\``,
          `**工作目录:** \`${workingDirectory}\``,
          `**会话:** ${sessionId ? `\`${sessionId.slice(0, 8)}...\`` : '_无_'}`,
          `**运行中:** ${isRunning ? '是 ⏳' : '否'}`,
        ].join('\n'),
      },
    ],
  };
  return JSON.stringify(card);
}

export interface TaskSummaryEntry {
  botName: string;
  status: 'completed' | 'failed' | 'timeout';
  task: string;
  resultPreview: string;
  error?: string;
  durationMs?: number;
}

export interface TaskSummaryState {
  title: string;
  userTask: string;
  totalDurationMs?: number;
  entries: TaskSummaryEntry[];
}

export function buildTaskSummaryCard(state: TaskSummaryState): string {
  const successCount = state.entries.filter((e) => e.status === 'completed').length;
  const failCount = state.entries.length - successCount;
  const color = failCount === 0 ? 'green' : failCount === state.entries.length ? 'red' : 'orange';
  const titleIcon = failCount === 0 ? '✅' : '⚠️';
  const titleText = `${titleIcon} ${state.title} (${successCount}/${state.entries.length} 成功)`;

  const elements: unknown[] = [];

  const overviewLines = [`📋 **用户需求:** ${state.userTask}`];
  if (state.totalDurationMs !== undefined) {
    overviewLines.push(`⏱️ 总耗时: ${formatDuration(state.totalDurationMs)}`);
  }
  elements.push({ tag: 'markdown', content: overviewLines.join('\n') });
  elements.push({ tag: 'hr' });

  for (const entry of state.entries) {
    const statusIcon = entry.status === 'completed' ? '✅' : '❌';
    const taskLabel = entry.task ? ` — ${entry.task}` : '';
    const durationStr = entry.durationMs !== undefined ? ` ⏱️${formatDuration(entry.durationMs)}` : '';

    const lines = [`**${statusIcon} ${entry.botName}${taskLabel}**${durationStr}`];

    if (entry.status === 'completed' && entry.resultPreview) {
      lines.push(truncate(entry.resultPreview, 500));
    }

    if (entry.status !== 'completed') {
      if (entry.error) {
        const isTurnError = entry.error.includes('maximum number of turn');
        lines.push(`⚠️ ${truncate(entry.error, 300)}`);
        if (isTurnError || entry.status === 'timeout') {
          lines.push('💡 建议：将任务拆分为更小的子任务后重试');
        }
      }
    }

    elements.push({ tag: 'markdown', content: lines.join('\n') });
  }

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: color,
      title: { content: titleText, tag: 'plain_text' },
    },
    elements,
  };
  return JSON.stringify(card);
}

export function buildTextCard(title: string, content: string, color: string = 'blue'): string {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: color,
      title: { content: title, tag: 'plain_text' },
    },
    elements: [{ tag: 'markdown', content }],
  };
  return JSON.stringify(card);
}
