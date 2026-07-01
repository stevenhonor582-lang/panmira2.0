import { describe, it, expect } from 'vitest';
import { parseAskTag } from '../../../src/bridge/ask-tag-parser.js';

describe('parseAskTag', () => {
  it('returns hasAsk=false when no [ASK] tag', () => {
    const r = parseAskTag('hello world, no tag here');
    expect(r.hasAsk).toBe(false);
    expect(r.isPartial).toBe(false);
    expect(r.remainingText).toBe('hello world, no tag here');
    expect(r.ask).toBeUndefined();
  });

  it('returns isPartial=true when [ASK] opened but not closed', () => {
    const text = 'before\n[ASK]\nquestion: 用 v1.0 吗？\noptions:\n  1. 批准';
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(false);
    expect(r.isPartial).toBe(true);
  });

  it('parses complete [ASK]...[/ASK] block', () => {
    const text = `[ASK]
question: 用 v1.0 SOP 部署吗？
options:
  1. 批准，立即应用
  2. 不上
timeout: 300
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask).toBeDefined();
    expect(r.ask!.question).toBe('用 v1.0 SOP 部署吗？');
    expect(r.ask!.options).toEqual([
      { index: 1, label: '批准，立即应用' },
      { index: 2, label: '不上' },
    ]);
    expect(r.ask!.timeoutSec).toBe(300);
  });

  it('removes [ASK] block from remainingText, keeps before/after', () => {
    const text = `我先分析了一下。

[ASK]
question: 用 v1.0 吗？
options:
  1. 批准
  2. 不上
[/ASK]

如果你同意，我会执行。`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.remainingText).toContain('我先分析了一下');
    expect(r.remainingText).toContain('如果你同意');
    expect(r.remainingText).not.toContain('[ASK]');
    expect(r.remainingText).not.toContain('question:');
  });

  it('handles Chinese full-width colon in field names', () => {
    const text = `[ASK]
question：用 v1.0 吗？
options：
  1. 批准
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask!.question).toBe('用 v1.0 吗？');
    expect(r.ask!.options).toHaveLength(1);
  });

  it('handles options without "options:" header', () => {
    const text = `[ASK]
question: 选哪个？
  1. 选项 A
  2. 选项 B
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask!.options).toHaveLength(2);
  });

  it('handles different option delimiters: . ) 、 :', () => {
    const text = `[ASK]
question: q?
options:
  1) 选项 A
  2、 选项 B
  3: 选项 C
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask!.options).toEqual([
      { index: 1, label: '选项 A' },
      { index: 2, label: '选项 B' },
      { index: 3, label: '选项 C' },
    ]);
  });

  it('parses only first [ASK] block when multiple exist', () => {
    const text = `[ASK]
question: q1?
options:
  1. a
[/ASK]
some text
[ASK]
question: q2?
options:
  1. b
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask!.question).toBe('q1?');
    // Second [ASK] block remains in remainingText untouched
    expect(r.remainingText).toContain('q2?');
  });

  it('returns hasAsk=false for malformed [ASK] (no question)', () => {
    const text = `[ASK]
options:
  1. a
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(false);
  });

  it('returns hasAsk=false for malformed [ASK] (no options)', () => {
    const text = `[ASK]
question: q?
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(false);
  });

  it('handles empty text gracefully', () => {
    const r = parseAskTag('');
    expect(r.hasAsk).toBe(false);
    expect(r.remainingText).toBe('');
    expect(r.isPartial).toBe(false);
  });

  it('timeout is optional', () => {
    const text = `[ASK]
question: q?
options:
  1. a
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.hasAsk).toBe(true);
    expect(r.ask!.timeoutSec).toBeUndefined();
  });

  it('rawTag captures the full [ASK]...[/ASK] including delimiters', () => {
    const text = `[ASK]
question: q?
options:
  1. a
[/ASK]`;
    const r = parseAskTag(text);
    expect(r.ask!.rawTag).toContain('[ASK]');
    expect(r.ask!.rawTag).toContain('[/ASK]');
    expect(r.ask!.rawTag).toContain('question: q?');
  });
});
