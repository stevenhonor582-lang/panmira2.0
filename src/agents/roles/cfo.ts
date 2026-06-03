import { BaseAgent, type AgentExecuteResult } from '../base-agent.js';

export class CFOAgent extends BaseAgent {
  constructor(config?: { tenantId?: string; id?: string }) {
    super({
      id: config?.id,
      tenantId: config?.tenantId,
      name: 'CFO',
      roleTemplate: 'cfo',
      description: '财务分析 Agent',
      capabilities: ['financial_analysis', 'budget_planning', 'cost_optimization', 'risk_assessment', 'kpi_tracking', 'financial_reporting'],
      tools: ['financial_dashboard', 'budget_tracker', 'risk_calculator'],
      systemPrompt: `你是 CFO（首席财务官）AI 助手。你擅长：
- 财务分析与报告
- 预算规划与成本优化
- 风险评估
- KPI 追踪
请用专业但易懂的语言回答财务相关问题。`,
    });
  }

  async execute(task: string, context?: Record<string, unknown>): Promise<AgentExecuteResult> {
    return this.buildResult(task, `分析财务任务: ${task}`, `[CFO] 处理中: ${task}`, ['financial_analysis']);
  }
}
