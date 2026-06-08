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

  // Background tasks (rendered before context — keeps tool output stream
  // visually close to the tool calls above)
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

  // Unified execution context (replaces 3 old blocks:
  //   - buildContextSection (fallback Mode/MCP)
  //   - state.contextNote string (orchestrator Skill/Mode/MCP/上下文/成本)
  //   - buildStatsLine footer (上下文/model/成本/duration)
  // Reads directement from CardState so orchestrator and feishu-direct
  // paths emit the same shape. The 2 of 5 fields that the feishu path
  // can't supply (Skill, currentSkill) just won't appear.
  const execCtx = buildExecutionContext(state);
  if (execCtx) {
    elements.push({ tag: 'markdown', content: execCtx });
    elements.push({ tag: 'hr' });
  }

  // Minimal footer (model + duration) as a 'note' line at the bottom
  const footer = buildStatsLine(state);
  if (footer) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: footer }],
    });
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
  // Phase B: enrich header with bot name + intent (when available)
  const prefix = state.botName
    ? `🤖 ${state.botName}${state.intentName ? ` · ${state.intentName}` : ''} · `
    : '';
  if (state.status === 'running') {
    const activeTool = state.toolCalls.find((t) => t.status === 'running');
    if (activeTool) {
      const detail = activeTool.detail ? ` ${activeTool.detail}` : '';
      return `${prefix}${config.icon} ${activeTool.name}${detail}`;
    }
  }
  if (state.status === 'complete' && state.durationMs !== undefined) {
    return `${prefix}${config.icon} 完成 · ${formatDuration(state.durationMs)}`;
  }
  if (state.status === 'error') {
    return `${prefix}${config.icon} 出错`;
  }
  return `${prefix}${config.icon} ${config.title}`;
}

function buildToolSection(state: CardState): string | null {
  if (state.toolCalls.length === 0) return null;

  const total = state.toolCalls.length;
  const running = state.toolCalls.filter((t) => t.status === 'running').length;

  // Phase C: if any tool has a stepIndex, group by step. Each step's
  // heading is collapsed by default (folded markdown), with the current
  // (running) step expanded so the user sees live progress.
  const hasSteps = state.toolCalls.some((t) => t.stepIndex !== undefined);
  if (hasSteps) {
    const groups = new Map<number, typeof state.toolCalls>();
    for (const t of state.toolCalls) {
      const k = t.stepIndex ?? 0;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);
    const blocks: string[] = [`📋 工具调用 (${total} 个${running > 0 ? `，${running} 进行中` : ''})`];
    for (const k of sortedKeys) {
      const tools = groups.get(k)!;
      const stepRunning = tools.some((t) => t.status === 'running');
      const stepIcon = stepRunning ? '⏳' : '✅';
      const toolLines = tools.map((t) => {
        const icon = t.status === 'running' ? '⏳' : '✅';
        return `  ${icon} \`${t.name}\` ${t.detail}`;
      });
      // Live step: always expanded. Other steps: show first 2 + 折叠其余
      const displayTools = stepRunning ? toolLines : toolLines.slice(0, 2);
      const hidden = toolLines.length - displayTools.length;
      const detail = displayTools.join('\n') + (hidden > 0 ? `\n  _... 还有 ${hidden} 个折叠_` : '');
      blocks.push(`${stepIcon} **Step ${k + 1}**\n${detail}`);
    }
    return blocks.join('\n\n');
  }

  // Fallback: no step info (feishu direct path). Old behavior.
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

/**
 * Unified "execution context" block. Reads directly from CardState so
 * BOTH paths (orchestrator + feishu-direct) get the same shape:
 *
 *   🔧 Skill: <name>            — only if state.currentSkill
 *   🤖 Mode: Subagent            — if any Task/Agent tool was used
 *   🧭 Mode: Main                — otherwise
 *   📡 MCP: mcp__a, mcp__b       — only if mcp__* tools present
 *   📊 上下文 20k/512k (4%)     — only if totalTokens + contextWindow
 *   💰 $0.07                     — only if costUsd > 0
 *
 * Replaces the old triplet: buildContextSection + CardUpdater.buildContextNote
 * + buildStatsLine. Context cost / window / skill are now on CardState directly
 * so the orchestrator and feishu paths emit visually identical cards.
 */
function buildExecutionContext(state: CardState): string | null {
  const lines: string[] = [];

  // 1. Current skill (orchestrator path)
  if (state.currentSkill) {
    lines.push(`🔧 Skill: \`${state.currentSkill}\``);
  }

  // 2. Mode: main vs subagent (inferred from tool_use names)
  const hasSub = state.toolCalls.some(
    (t) => t.name === 'Task' || t.name === 'Agent',
  );
  lines.push(hasSub ? '🤖 Mode: Subagent' : '🧭 Mode: Main');

  // 3. MCP tools (de-duplicated)
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

  // 4. Context usage (running AND complete — always show if data exists)
  if (state.totalTokens && state.contextWindow) {
    const pct = Math.round((state.totalTokens / state.contextWindow) * 100);
    const usedK = state.totalTokens >= 1000 ? `${(state.totalTokens / 1000).toFixed(1)}k` : `${state.totalTokens}`;
    const totalK = `${Math.round(state.contextWindow / 1000)}k`;
    lines.push(`📊 上下文: ${usedK}/${totalK} (${pct}%)`);
  }

  // 5. Cost (running AND complete — no longer gated on terminal status)
  if (state.costUsd != null && state.costUsd > 0) {
    lines.push(`💰 $${state.costUsd.toFixed(4)}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildStatsLine(state: CardState): string | null {
  // Footer: model + cost + duration. 上下文% is NOT here anymore —
  // it lives in buildExecutionContext above, so we don't render it twice.
  const parts: string[] = [];

  if (state.model) {
    parts.push(formatModelName(state.model));
  }

  // ⑤ Cost / duration shown in all states (no longer gated on terminal)
  // so users see burn rate during running, not just after completion.
  if (state.sessionCostUsd != null && state.sessionCostUsd > 0) {
    parts.push(formatCost(state.sessionCostUsd));
  }
  if (state.durationMs !== undefined && state.durationMs > 0) {
    parts.push(formatDuration(state.durationMs));
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


// ── File Manifest Card ──

export interface FileManifestEntry {
  fileName: string;
  sizeBytes: number;
  isImage: boolean;
  /** Bot name that produced this file. */
  botName: string;
  /** True for the chosen "final deliverable" (largest non-image file by default). */
  isFinal: boolean;
}

export interface FileManifestState {
  /** Original user task — for context in the card header. */
  userTask: string;
  files: FileManifestEntry[];
  /** Pre-computed total size in KB (sum of files.sizeBytes / 1024). */
  totalSizeKB: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Green "📁 文件清单" card. One line per file, ⭐ marks the chosen
 * "final deliverable" (largest non-image file by default). Sent after
 * the bot's main response card to give the user a clean inventory of
 * what the bot produced, separate from the streaming progress UI.
 */
export function buildFileManifestCard(state: FileManifestState): string {
  const lines: string[] = [];

  // Sort: final first, then by bot name, then by file name
  const sorted = [...state.files].sort((a, b) => {
    if (a.isFinal !== b.isFinal) return a.isFinal ? -1 : 1;
    if (a.botName !== b.botName) return a.botName.localeCompare(b.botName);
    return a.fileName.localeCompare(b.fileName);
  });

  for (const f of sorted) {
    const star = f.isFinal ? '⭐ ' : '';
    const size = formatFileSize(f.sizeBytes);
    const icon = f.isImage ? '🖼️' : '📄';
    lines.push(`${star}${icon} \`${f.fileName}\` — ${size} _(${f.botName})_`);
  }

  const finalCount = state.files.filter((f) => f.isFinal).length;
  const fileCount = state.files.length;
  const titleText = `📁 文件清单 (${fileCount} 个${finalCount > 0 ? '，' + finalCount + ' 个最终交付' : ''})`;

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { content: titleText, tag: 'plain_text' },
    },
    elements: [
      { tag: 'markdown', content: `📋 **任务:** ${truncate(state.userTask, 200)}` },
      { tag: 'hr' },
      { tag: 'markdown', content: lines.join('\n') },
      { tag: 'hr' },
      { tag: 'markdown', content: `📦 总大小: ${state.totalSizeKB.toFixed(1)} KB` },
    ],
  };
  return JSON.stringify(card);
}


// ── Task Confirmation Card ──

export interface ConfirmationState {
  userTask: string;
  analysis?: string;
  assignments: Array<{ bot: string; task: string }>;
  confirmationId: string;
  timeoutSeconds: number;
}

/**
 * Yellow "task confirmation" card. Shown before a coordinator
 * dispatches a task to specialists. User can confirm or cancel
 * within timeoutSeconds (60s default); on timeout, the system
 * auto-confirms to avoid deadlocking the group.
 *
 * Button values:
 *   { action: 'coordinator_confirm', confirmationId }
 *   { action: 'coordinator_cancel',  confirmationId }
 */
export function buildConfirmationCard(state: ConfirmationState): string {
  const lines: string[] = [];
  if (state.analysis) {
    lines.push(`**分析:** ${state.analysis}`);
  }
  lines.push('**分配:**');
  for (const a of state.assignments) {
    lines.push(`- ✉️ **${a.bot}** — ${a.task}`);
  }
  lines.push(`\n_超过 ${state.timeoutSeconds} 秒未操作就仅自动确认。_`);

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'orange',
      title: { content: '📋 任务确认', tag: 'plain_text' },
    },
    elements: [
      { tag: 'markdown', content: `📝 **用户需求:** ${truncate(state.userTask, 200)}` },
      { tag: 'hr' },
      { tag: 'markdown', content: lines.join('\n') },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: { content: '✓ 确认执行', tag: 'plain_text' },
            value: { action: 'coordinator_confirm', confirmationId: state.confirmationId },
          },
          {
            tag: 'button',
            type: 'danger',
            text: { content: '❌ 取消', tag: 'plain_text' },
            value: { action: 'coordinator_cancel', confirmationId: state.confirmationId },
          },
        ],
      },
    ],
  };
  return JSON.stringify(card);
}


// ── Pending Tasks Card (red) ──

import type { PendingTask, PendingSeverity } from '../bridge/orchestrator/types.js';

export interface PendingTasksState {
  userTask: string;
  tasks: PendingTask[];
  /** Originating orchestration plan name, for context. */
  intentName?: string;
  /** sessionId of the orchestration (Phase 3 will fill this in). */
  sessionId?: string;
}

function severityIcon(s: PendingSeverity): string {
  return s === 'high' ? '🔴' : s === 'medium' ? '🟡' : '🟢';
}

function severityLabel(s: PendingSeverity): string {
  return s === 'high' ? '[高]' : s === 'medium' ? '[中]' : '[低]';
}

/**
 * Red "📋 未完成项" card. One row per pending item,
 * severity-tagged (高 / 中 / 低), with 3 action buttons:
 *   - 回到主线 (orch_resume action; Phase 3 wires this up)
 *   - 推下次   (orch_defer;  Phase 2 placeholder, no-op for now)
 *   - 忽略       (orch_dismiss; Phase 2 placeholder, no-op for now)
 */
export function buildPendingTasksCard(state: PendingTasksState): string {
  const lines: string[] = [];
  for (const t of state.tasks) {
    const icon = severityIcon(t.severity);
    const label = severityLabel(t.severity);
    const detail = t.detail ? `\n   ${truncate(t.detail, 200)}` : '';
    lines.push(`${icon} ${label} **${t.title}**${detail}`);
  }

  const titleText = `📋 未完成项 (${state.tasks.length})`;

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'red',
      title: { content: titleText, tag: 'plain_text' },
    },
    elements: [
      { tag: 'markdown', content: `📝 **用户需求:** ${truncate(state.userTask, 200)}` },
      { tag: 'hr' },
      { tag: 'markdown', content: lines.join('\n') },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: { content: '🔙 回到主线', tag: 'plain_text' },
            value: { action: 'orch_resume', sessionId: state.sessionId ?? '' },
          },
          {
            tag: 'button',
            type: 'default',
            text: { content: '📌 推下次', tag: 'plain_text' },
            value: { action: 'orch_defer' },
          },
          {
            tag: 'button',
            type: 'danger',
            text: { content: '🗑 忽略', tag: 'plain_text' },
            value: { action: 'orch_dismiss' },
          },
        ],
      },
    ],
  };
  return JSON.stringify(card);
}
