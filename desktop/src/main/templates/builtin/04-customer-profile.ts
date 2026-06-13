import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const CustomerProfile = defineTemplate({
  id: 'customer-profile',
  name: '客户画像',
  description: '结合客户官网 + 内部资料，输出 360° 客户画像。',
  category: 'analysis',
  estimatedDurationSec: 60,
  kbRequired: true,
  outputFormat: 'markdown',

  params: z.object({
    company: z.string().min(1),
    website: z.string().url().optional(),
  }),

  async browserActions(browser, sessionId, params) {
    if (!params.website) return '';
    await browser.navigate(sessionId, params.website);
    return browser.extract(sessionId, 'body');
  },

  prompt(params, browserOutput, kbContext) {
    return `
你是 B2B 销售策略师。基于以下信息，写一份 ${params.company} 的客户画像：

官网信息:
${browserOutput || '(未抓取)'}

内部资料:
${kbContext || '(无)'}

输出包含：
1. 公司概览（规模 / 业务 / 成立年份）
2. 关键决策人画像（猜测的 role + 关注点）
3. 与我方产品的契合点（3-5 条）
4. 推荐接触策略（开场白 + 渠道 + 时间）
5. 风险点（不感兴趣的可能原因）
    `.trim();
  },
});
