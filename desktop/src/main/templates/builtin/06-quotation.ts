import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const Quotation = defineTemplate({
  id: 'quotation',
  name: '报价单生成',
  description: '基于产品资料 + 客户需求生成结构化报价单。',
  category: 'admin',
  estimatedDurationSec: 30,
  kbRequired: true,
  outputFormat: 'markdown-table',

  params: z.object({
    customerName: z.string().min(1),
    productIds: z.array(z.string()).min(1),
    quantity: z.number().int().positive(),
  }),

  prompt(params, _browserOutput, kbContext) {
    return `
你是销售助理。基于产品资料生成给 ${params.customerName} 的报价单。

客户需求产品: ${params.productIds.join(', ')}
数量: ${params.quantity}

产品资料:
${kbContext ?? '(无)'}

输出 markdown 表格，列：型号 | 描述 | 单价 (USD) | 数量 | 小计 | 备注。
末尾加：总计、付款条件、有效期 (14 天)、联系窗口。
    `.trim();
  },
});
