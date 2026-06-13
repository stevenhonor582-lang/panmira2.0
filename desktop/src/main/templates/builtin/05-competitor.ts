import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const Competitor = defineTemplate({
  id: 'competitor',
  name: '竞品分析',
  description: '抓取竞品官网 + 价格页，输出结构化对比。',
  category: 'analysis',
  estimatedDurationSec: 45,
  kbRequired: false,
  outputFormat: 'markdown-table',

  params: z.object({
    competitorName: z.string().min(1),
    competitorUrl: z.string().url(),
  }),

  async browserActions(browser, sessionId, params) {
    await browser.navigate(sessionId, params.competitorUrl);
    return browser.extract(sessionId, 'body');
  },

  prompt(params, browserOutput) {
    return `
你是市场分析员。基于以下 ${params.competitorName} 官网内容，输出结构化分析：

${browserOutput ?? '(无)'}

输出包含：
1. 产品矩阵（产品名 + 定位 + 价格段）
2. 目标客户画像
3. 主要卖点
4. 弱点评测（我方可利用的差距）
5. 与我方产品的差异化建议
    `.trim();
  },
});
