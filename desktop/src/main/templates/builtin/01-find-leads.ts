import { z } from 'zod';
import { defineTemplate } from '../types.js';

export const FindLeads = defineTemplate({
  id: 'find-leads',
  name: 'LinkedIn 找客户',
  description: '在 LinkedIn 搜索目标行业的潜在客户，输出 10 个带姓名、职位、公司的表格。',
  category: 'lead-gen',
  estimatedDurationSec: 45,
  kbRequired: false,
  outputFormat: 'markdown-table',

  params: z.object({
    industry: z.string().min(1),
    region: z.string().min(1),
    jobTitles: z.string().optional(),
  }),

  async browserActions(browser, sessionId, params) {
    const query = encodeURIComponent(`${params.industry} ${params.jobTitles ?? ''}`.trim());
    const url = `https://www.linkedin.com/search/results/people/?keywords=${query}&geoUrn=:${encodeURIComponent(params.region)}`;
    await browser.navigate(sessionId, url);
    return browser.extract(sessionId, '.search-results');
  },

  prompt(params, browserOutput) {
    return `
你是 B2B 销售助理。基于以下 LinkedIn 搜索结果，整理 10 个潜在客户的表格：

行业: ${params.industry}
地区: ${params.region}
${params.jobTitles ? `职位: ${params.jobTitles}` : ''}

搜索结果:
${browserOutput ?? '(无浏览器结果)'}

输出 markdown 表格，列：姓名 | 职位 | 公司 | LinkedIn URL | 备注（为什么是潜在客户）。
    `.trim();
  },
});
