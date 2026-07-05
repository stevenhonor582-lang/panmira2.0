/**
 * CardKit JSON 2.0 Renderer
 *
 * Builds Feishu CardKit cards for panmira 2.0 completion-state UX.
 * Per 06-task-lifecycle-design.md:
 *   - 完成态卡片（不是中间态）
 *   - 底部 4 持久按钮（📋任务/🆕新任务/⏹停止/❌删除）
 *   - NL fallback text
 *   - collapsible_panel for task history
 *
 * CardKit JSON 2.0 structure (from R2 research):
 *   - column_set + column + button (4-button bar)
 *   - collapsible_panel (V7.9+)
 *   - button.confirm (二次确认)
 *   - markdown (content body)
 *
 * @module feishu/cardkit-renderer
 */

// === Types ===

export interface CompletionCardContent {
  /** Main bot response content (markdown) */
  body: string;
  /** Optional: "也可以直接打字回复我" NL fallback hint */
  showNlFallback?: boolean;
}

export interface TaskListItem {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'failed_recovery' | 'closed';
  lastActivity: string;
  botName?: string;
}

export interface TaskListCardContent {
  tasks: TaskListItem[];
  closedCount?: number;
}

// === Card Builders ===

/**
 * Build a completion-state card with:
 * - Bot response content (markdown)
 * - NL fallback hint
 * - 4 persistent action buttons (📋任务 / 🆕新任务 / ⏹停止 / ❌删除)
 *
 * This is the primary card type — sent AFTER bot finishes processing.
 */
export interface CompletionCardContent {
  body: string;
  showNlFallback?: boolean;
}

export function buildCompletionCard(content: CompletionCardContent): string {
  const elements: any[] = [
    {
      tag: 'markdown',
      content: content.body,
    },
  ];

  // NL fallback hint
  if (content.showNlFallback !== false) {
    elements.push({
      tag: 'markdown',
      content: '💬 也可以直接打字回复我',
    });
  }

  // Divider
  elements.push({
    tag: 'hr',
  });

  // 工单 8 修正 v2 (2026-07-06): 不显示 task 管理按钮 — 用户直接用文本交互
  // (buildCompletionCard 现仅作为 fallback/参考保留,生产路径走 sendFinalCard → buildCard)
  // buildActionButton 暂时保留签名(其他调用方可能还在用)

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🤖 助手回复' },
      template: 'blue',
    },
    elements,
  });
}

/**
 * Build a task-list card with:
 * - Active/paused/failed_recovery tasks (with action buttons per row)
 * - Collapsible closed tasks section
 *
 * Triggered when user clicks 📋 任务 button.
 */
export function buildTaskListCard(content: TaskListCardContent): string {
  const elements: any[] = [
    {
      tag: 'markdown',
      content: `📋 你有 **${content.tasks.length}** 个任务`,
    },
    { tag: 'hr' },
  ];

  // Active/paused tasks
  for (const task of content.tasks) {
    const icon = task.status === 'active' ? '🟢' :
                 task.status === 'paused' ? '⏸' :
                 task.status === 'failed_recovery' ? '⚠️' : '✅';

    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'column',
          elements: [{
            tag: 'markdown',
            content: `${icon} ${task.title}\n最后活动: ${task.lastActivity}`,
          }],
          width: 'weighted',
          weight: 1,
        },
        {
          tag: 'column',
          elements: task.status === 'closed'
            ? []
            : [
                buildActionButton('▶', `switch_task:${task.id}`, 'primary'),
                buildActionButton('❌', `delete_task:${task.id}`, 'danger'),
              ],
          width: 'weighted',
          weight: 0.3,
        },
      ],
    });
  }

  // Collapsible closed section
  if (content.closedCount && content.closedCount > 0) {
    elements.push({
      tag: 'markdown',
      content: `---\n已关闭 (${content.closedCount}) 个任务`,
    });
  }

  // Bottom buttons
  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'action',
    actions: [
      buildActionButton('🆕 新任务', 'new_task', 'primary'),
      buildActionButton('🔍 搜索', 'search_tasks', 'default'),
    ],
  });

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📋 任务列表' },
      template: 'green',
    },
    elements,
  });
}

/**
 * Build a streaming card (progressive update).
 * Used while bot is generating response.
 */
export function buildStreamingCard(userPrompt: string): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'Thinking...' },
      template: 'blue',
    },
    elements: [
      { tag: 'markdown', content: '> ' + userPrompt.slice(0, 200) },
      { tag: 'hr' },
      { tag: 'markdown', content: 'Processing...' },
    ],
  });
}



/**
 * Build an error card.
 */
export function buildErrorCard(error: string, suggestion?: string): string {
  const elements: any[] = [
    {
      tag: 'markdown',
      content: `❌ **出错**\n\n${error}`,
    },
  ];

  if (suggestion) {
    elements.push({
      tag: 'markdown',
      content: `💡 ${suggestion}`,
    });
  }

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 出错' },
      template: 'red',
    },
    elements,
  });
}

// === Helpers ===

export function buildActionButton(text: string, value: string, type: 'default' | 'primary' | 'danger'): any {
  const btn: any = {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    value: { action: value },
  };

  // 二次确认 for destructive actions
  if (type === 'danger') {
    btn.confirm = {
      title: { tag: 'plain_text', content: '确认' },
      text: { tag: 'markdown', content: '确定执行此操作？此操作不可撤销。' },
    };
  }

  
    
    
    
    
  
  return btn;
}
