import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const ContractReview = defineTemplate({
  id: 'contract-review',
  name: '合同审核',
  description: '基于合同模板审核条款，标出风险点。',
  category: 'admin',
  estimatedDurationSec: 30,
  kbRequired: true,
  outputFormat: 'markdown',

  params: z.object({
    contractText: z.string().min(10),
  }),

  prompt(params, _browserOutput, kbContext) {
    return `
你是法务助理。审核以下合同条款，基于公司合同模板标准 (见参考资料) 标出风险点。

合同:
---
${params.contractText}
---

公司合同模板标准:
${kbContext ?? '(无)'}

输出：
1. 关键条款摘要
2. 风险点（红色标记）— 偏离模板的地方
3. 建议修改
4. 总评（可签 / 需改 / 拒签）
    `.trim();
  },
});
