/**
 * E2 方案 PR1: [ASK] 标签解析器
 *
 * 协议（LLM 在 stream 文本里输出）：
 *
 *   [ASK]
 *   question: 用 v1.0 SOP 部署吗？
 *   options:
 *     1. 批准，立即应用
 *     2. 不上
 *   timeout: 300
 *   [/ASK]
 *
 * 设计要点：
 * - 纯函数 + 单测，不接 LLM stream
 * - 支持 partial detection（流式场景：[ASK] 已到但 [/ASK] 未到）
 * - 容错：未知字段忽略、格式不对不抛错
 * - 多 [ASK] 块：只解析第一个（一次只问一个问题的设计）
 */

export interface AskOption {
  index: number;
  label: string;
}

export interface ParsedAskTag {
  question: string;
  options: AskOption[];
  timeoutSec?: number;
  rawTag: string;
}

export interface ParseResult {
  /** 是否检测到完整 [ASK]...[/ASK] 块 */
  hasAsk: boolean;
  /** 解析结果（hasAsk=true 时有值）*/
  ask?: ParsedAskTag;
  /** 去掉 [ASK] 块后的纯文本（hasAsk=false 时是原文）*/
  remainingText: string;
  /** [ASK] 已开但 [/ASK] 还没到（流式场景）*/
  isPartial: boolean;
}

const ASK_OPEN = '[ASK]';
const ASK_CLOSE = '[/ASK]';

/**
 * Parse [ASK]...[/ASK] block from LLM stream text.
 *
 * Behavior:
 * - No [ASK] opener at all → { hasAsk: false, isPartial: false }
 * - [ASK] found but no [/ASK] yet → { hasAsk: false, isPartial: true }
 * - [ASK]...[/ASK] complete → { hasAsk: true, ask: ParsedAskTag, remainingText: minus block }
 *
 * Multi-block: only the first complete [ASK]...[/ASK] is parsed. Subsequent
 * blocks (if any) are left in remainingText untouched.
 */
export function parseAskTag(text: string): ParseResult {
  if (!text) {
    return { hasAsk: false, remainingText: '', isPartial: false };
  }

  const openIdx = text.indexOf(ASK_OPEN);
  if (openIdx === -1) {
    return { hasAsk: false, remainingText: text, isPartial: false };
  }

  const closeIdx = text.indexOf(ASK_CLOSE, openIdx + ASK_OPEN.length);
  if (closeIdx === -1) {
    // [ASK] opened but not closed yet — stream still in progress
    return { hasAsk: false, remainingText: text, isPartial: true };
  }

  const rawTag = text.slice(openIdx, closeIdx + ASK_CLOSE.length);
  const inner = text.slice(openIdx + ASK_OPEN.length, closeIdx);
  const textBefore = text.slice(0, openIdx);
  const textAfter = text.slice(closeIdx + ASK_CLOSE.length);
  const remainingText = (textBefore + textAfter).trim();

  const ask = parseInner(inner, rawTag);
  if (!ask) {
    // Malformed [ASK] block — treat as no-op, return original text
    return { hasAsk: false, remainingText: text, isPartial: false };
  }

  return {
    hasAsk: true,
    ask,
    remainingText,
    isPartial: false,
  };
}

/**
 * Parse the inner content of [ASK]...[/ASK] into structured form.
 * Returns null if malformed (no question or no options).
 */
function parseInner(inner: string, rawTag: string): ParsedAskTag | null {
  const lines = inner.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let question = '';
  const options: AskOption[] = [];
  let timeoutSec: number | undefined;
  let inOptions = false;

  for (const line of lines) {
    // Match "question: xxx"
    const qMatch = line.match(/^question[:：]\s*(.+)$/i);
    if (qMatch && !inOptions) {
      question = qMatch[1].trim();
      continue;
    }

    // Match "options:" header
    if (/^options[:：]?$/i.test(line)) {
      inOptions = true;
      continue;
    }

    // Match "timeout: 300"
    const tMatch = line.match(/^timeout[:：]\s*(\d+)$/i);
    if (tMatch) {
      timeoutSec = parseInt(tMatch[1], 10);
      continue;
    }

    // Match option lines: "1. xxx" or "1) xxx" or "1、 xxx" or "1: xxx"
    // Allow options without explicit "options:" header — once we've seen the
    // question, numbered lines that follow are treated as options.
    const optMatch = line.match(/^(\d+)\s*[.)、:]\s*(.+)$/);
    if (optMatch && (question || inOptions || options.length > 0)) {
      const idx = parseInt(optMatch[1], 10);
      const label = optMatch[2].trim();
      if (label) {
        options.push({ index: idx, label });
      }
      continue;
    }
  }

  if (!question || options.length === 0) {
    return null;
  }

  const result: ParsedAskTag = {
    question,
    options,
    rawTag,
  };
  if (timeoutSec !== undefined) {
    result.timeoutSec = timeoutSec;
  }
  return result;
}
