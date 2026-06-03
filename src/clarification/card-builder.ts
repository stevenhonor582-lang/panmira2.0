import type { Question } from './types.js';

export interface FeishuCard {
  config?: { wide_screen_mode: boolean };
  header: {
    template: string;
    title: { tag: 'plain_text'; content: string };
  };
  elements: CardElement[];
}

export type CardElement =
  | { tag: 'div'; text: { tag: 'plain_text'; content: string } }
  | { tag: 'action'; actions: CardAction[] };

export type CardAction = 
  | { tag: 'button'; text: { tag: 'plain_text'; content: string };
      type: 'primary' | 'danger' | 'default';
      value: { field: string; selected: string; action: 'select' | 'cancel' | 'default_all' } }
  | { tag: 'input'; placeholder: { tag: 'plain_text'; content: string };
      name: string; max_length: number };

const ACTION_SELECT = 'select';
const ACTION_CANCEL = 'cancel';
const ACTION_DEFAULT_ALL = 'default_all';

export class CardBuilder {
  build(questions: Question[], skillName: string): FeishuCard {
    const elements: CardElement[] = [];

    elements.push({
      tag: 'div',
      text: { tag: 'plain_text', content: `📋 需要确认 ${questions.length} 项信息` },
    });

    for (const q of questions) {
      elements.push({
        tag: 'div',
        text: { tag: 'plain_text', content: q.text },
      });

      if (q.kind === 'button' && q.options) {
        elements.push({
          tag: 'action',
          actions: q.options.map(opt => ({
            tag: 'button',
            text: { tag: 'plain_text', content: opt.label },
            type: 'primary',
            value: { field: q.fieldName, selected: opt.value, action: ACTION_SELECT },
          })),
        });
      } else {
        elements.push({
          tag: 'action',
          actions: [
            {
              tag: 'input',
              placeholder: { tag: 'plain_text', content: '或手动输入...' },
              name: q.fieldName,
              max_length: 200,
            },
          ],
        });
      }
    }

    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '使用全部默认值' },
          type: 'default',
          value: { field: '__all__', selected: '', action: ACTION_DEFAULT_ALL },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '取消' },
          type: 'danger',
          value: { field: '__cancel__', selected: '', action: ACTION_CANCEL },
        },
      ],
    });

    return {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: `📝 ${skillName} · 信息补全` },
      },
      elements,
    };
  }
}
