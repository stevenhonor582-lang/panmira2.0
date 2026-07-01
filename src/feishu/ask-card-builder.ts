// E2 PR2: [ASK] 卡片渲染函数
// 把 ParsedAskTag 转成飞书 CardKit JSON 字符串
// 不接 stream-processor（PR3 做）— 纯函数 + 单测

import type { ParsedAskTag } from '../bridge/ask-tag-parser.js';

export interface BuildAskCardOptions {
  /** Card header title; default '需要确认' */
  headerTitle?: string;
  /** Header color theme: 'blue' | 'green' | 'orange' | 'red' | 'grey'; default 'blue' */
  headerColor?: 'blue' | 'green' | 'orange' | 'red' | 'grey';
}

/**
 * Build a Feishu interactive card for an [ASK] tag.
 *
 * Card structure:
 *   - header: title + color
 *   - body:
 *     - markdown: question text (bold)
 *     - action: one button per option, each carrying value = {action:'ask_answer', askId, optionIndex, label}
 *     - markdown: 超时/自定义提示
 *
 * Returned string is the JSON content for sendCard(chatId, content) which
 * expects Feishu "interactive" message payload.
 */
export function buildAskCard(
  ask: ParsedAskTag,
  askId: string,
  options: BuildAskCardOptions = {},
): string {
  const headerTitle = options.headerTitle ?? '需要确认';
  const headerColor = options.headerColor ?? 'blue';

  const elements: unknown[] = [];

  // Question text (bold markdown)
  elements.push({
    tag: 'markdown',
    content: `**${ask.question}**`,
  });

  elements.push({ tag: 'hr' });

  // Options as buttons in an action block
  const actions = ask.options.map((opt, idx) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: `${opt.index}. ${opt.label}` },
    type: idx === 0 ? 'primary' : 'default',
    value: {
      action: 'ask_answer',
      askId,
      optionIndex: opt.index,
      label: opt.label,
    },
  }));
  elements.push({ tag: 'action', actions });

  // Footer hint
  const timeoutHint = ask.timeoutSec
    ? `\n⏱️ ${ask.timeoutSec} 秒未答将自动超时`
    : '';
  elements.push({
    tag: 'markdown',
    content:
      `💬 直接打字回复你的选择（或输入自定义要求）${timeoutHint}` +
      `\n_按选项编号（1/${ask.options.length}）的按钮即可_`,
  });

  const card = {
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: headerTitle },
      template: headerColor,
    },
    elements,
  };

  return JSON.stringify(card);
}
