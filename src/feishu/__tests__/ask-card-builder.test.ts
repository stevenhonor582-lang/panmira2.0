import { describe, it, expect } from 'vitest';
import { buildAskCard } from '../../../src/feishu/ask-card-builder.js';
import type { ParsedAskTag } from '../../../src/bridge/ask-tag-parser.js';

const sampleAsk: ParsedAskTag = {
  question: '用 v1.0 SOP 部署吗？',
  options: [
    { index: 1, label: '批准，立即应用' },
    { index: 2, label: '不上' },
  ],
  timeoutSec: 300,
  rawTag: '[ASK]...[/ASK]',
};

describe('buildAskCard', () => {
  it('returns valid JSON string', () => {
    const json = buildAskCard(sampleAsk, 'ask-123');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('has header with default title and color', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    expect(card.header.title.content).toBe('需要确认');
    expect(card.header.template).toBe('blue');
  });

  it('respects custom header title and color', () => {
    const card = JSON.parse(
      buildAskCard(sampleAsk, 'ask-123', { headerTitle: '决策点', headerColor: 'orange' }),
    );
    expect(card.header.title.content).toBe('决策点');
    expect(card.header.template).toBe('orange');
  });

  it('includes question as bold markdown', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    const md = card.elements.find((e: any) => e.tag === 'markdown');
    expect(md.content).toBe('**用 v1.0 SOP 部署吗？**');
  });

  it('renders one button per option with correct value', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions).toHaveLength(2);
    expect(action.actions[0]).toMatchObject({
      tag: 'button',
      text: { tag: 'plain_text', content: '1. 批准，立即应用' },
      type: 'primary',
      value: {
        action: 'ask_answer',
        askId: 'ask-123',
        optionIndex: 1,
        label: '批准，立即应用',
      },
    });
    expect(action.actions[1]).toMatchObject({
      tag: 'button',
      type: 'default',
      value: {
        action: 'ask_answer',
        askId: 'ask-123',
        optionIndex: 2,
        label: '不上',
      },
    });
  });

  it('first option is primary, rest are default', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions[0].type).toBe('primary');
    expect(action.actions[1].type).toBe('default');
  });

  it('footer mentions direct text reply option', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    const mdElements = card.elements.filter((e: any) => e.tag === 'markdown');
    const footer = mdElements[mdElements.length - 1].content;
    expect(footer).toContain('打字');
    expect(footer).toContain('1/2');
  });

  it('includes timeout hint when timeoutSec is set', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    const mdElements = card.elements.filter((e: any) => e.tag === 'markdown');
    const footer = mdElements[mdElements.length - 1].content;
    expect(footer).toContain('300');
    expect(footer).toContain('超时');
  });

  it('omits timeout hint when timeoutSec is undefined', () => {
    const askNoTimeout: ParsedAskTag = { ...sampleAsk, timeoutSec: undefined };
    const card = JSON.parse(buildAskCard(askNoTimeout, 'ask-123'));
    const mdElements = card.elements.filter((e: any) => e.tag === 'markdown');
    const footer = mdElements[mdElements.length - 1].content;
    expect(footer).not.toContain('超时');
  });

  it('sets update_multi: true so card can be updated in place after answer', () => {
    const card = JSON.parse(buildAskCard(sampleAsk, 'ask-123'));
    expect(card.config.update_multi).toBe(true);
  });

  it('handles single-option ask', () => {
    const ask: ParsedAskTag = {
      question: '继续吗？',
      options: [{ index: 1, label: 'OK' }],
      rawTag: '',
    };
    const card = JSON.parse(buildAskCard(ask, 'ask-1'));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions).toHaveLength(1);
  });

  it('handles 4 options', () => {
    const ask: ParsedAskTag = {
      question: 'q',
      options: [
        { index: 1, label: 'a' },
        { index: 2, label: 'b' },
        { index: 3, label: 'c' },
        { index: 4, label: 'd' },
      ],
      rawTag: '',
    };
    const card = JSON.parse(buildAskCard(ask, 'ask-1'));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions).toHaveLength(4);
    // footer should say "1/4"
    const mdElements = card.elements.filter((e: any) => e.tag === 'markdown');
    expect(mdElements[mdElements.length - 1].content).toContain('1/4');
  });
});
