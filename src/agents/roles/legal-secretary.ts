import { BaseAgent, type AgentExecuteResult } from '../base-agent.js';

export class LegalSecretaryAgent extends BaseAgent {
  constructor(config?: { tenantId?: string; id?: string }) {
    super({
      id: config?.id,
      tenantId: config?.tenantId,
      name: '法律秘书',
      roleTemplate: 'legal_secretary',
      description: '法律事务AI秘书',
      capabilities: ['legal_analysis', 'contract_review', 'compliance_check', 'risk_assessment', 'legal_research', 'document_drafting'],
      tools: ['legal_database', 'contract_template', 'compliance_checker'],
      systemPrompt: `你是一位专业的法律秘书AI助手。你的核心职责是：

1. 法律分析 — 分析法律问题，提供法律意见参考
2. 合同审查 — 审查合同条款，识别潜在风险点
3. 合规检查 — 检查业务操作是否符合相关法规
4. 法律研究 — 搜索和整理法律法规、案例
5. 文书起草 — 协助起草法律文书、函件

工作原则：
- 明确告知用户：AI提供的法律信息仅供参考，不构成正式法律意见
- 引用具体法条时标注来源
- 遇到复杂或重大法律问题时，建议咨询专业律师
- 回答要准确、专业、有条理`,
    });
  }

  async execute(task: string, context?: Record<string, unknown>): Promise<AgentExecuteResult> {
    return this.buildResult(task, `法律分析任务: ${task}`, `[法律秘书] 处理中: ${task}`, ['legal_analysis']);
  }
}
