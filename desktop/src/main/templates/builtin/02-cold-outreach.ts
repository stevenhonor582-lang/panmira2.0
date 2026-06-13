import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const ColdOutreach = defineTemplate({
  id: 'cold-outreach',
  name: '英文开发信',
  description: '基于产品资料生成一封专业的英文开发信。',
  category: 'outreach',
  estimatedDurationSec: 30,
  kbRequired: true,
  outputFormat: 'email-draft',

  params: z.object({
    recipient: z.string().min(1),
    company: z.string().min(1),
    product: z.string().min(1),
    tone: z.enum(['formal', 'friendly']).default('formal'),
  }),

  prompt(params, _browserOutput, kbContext) {
    return `
你是外贸销售助理。基于以下产品资料，给 ${params.recipient} (${params.company}) 写一封关于"${params.product}"的开发信。
语气: ${params.tone === 'formal' ? '专业、正式' : '友好、轻松'}
长度: 150-200 词

参考资料:
${kbContext ?? '(无)'}

要求：
- 主题行 + 正文 + 签名
- 第一句点明价值
- 包含 1 个具体案例或数据点
- 结尾有明确 CTA（call to action）
    `.trim();
  },
});
