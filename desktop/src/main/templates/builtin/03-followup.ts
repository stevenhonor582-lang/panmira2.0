import { z } from 'zod';
import type { Template } from '../types.js';

export const Followup: Template = {
  id: 'followup',
  name: '客户跟进',
  description: '基于历史邮件和最新情况生成跟进邮件。',
  category: 'outreach',
  estimatedDurationSec: 20,
  kbRequired: false,
  outputFormat: 'email-draft',

  params: z.object({
    customerName: z.string().min(1),
    priorEmail: z.string().min(1),
    newContext: z.string().min(1),
  }),

  prompt(params) {
    return `
你是销售助理。给 ${params.customerName} 写一封跟进邮件。

之前的邮件:
---
${params.priorEmail}
---

最新情况:
${params.newContext}

要求：
- 简短（80-120 词）
- 不重复之前的内容
- 提出具体下一步（call / demo / sample）
    `.trim();
  },
};
