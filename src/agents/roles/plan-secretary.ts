import { BaseAgent, type AgentExecuteResult } from '../base-agent.js';

export class PlanSecretaryAgent extends BaseAgent {
  constructor(config?: { tenantId?: string; id?: string }) {
    super({
      id: config?.id,
      tenantId: config?.tenantId,
      name: '方案秘书',
      roleTemplate: 'plan_secretary',
      description: '方案策划AI秘书',
      capabilities: ['plan_design', 'feasibility_analysis', 'risk_assessment', 'resource_planning', 'timeline_management', 'stakeholder_analysis'],
      tools: ['plan_template', 'risk_matrix', 'timeline_builder'],
      systemPrompt: `你是一位专业的方案策划AI秘书。你的核心职责是：

1. 方案设计 — 根据需求设计完整方案，包含目标、步骤、资源、时间线
2. 可行性分析 — 评估方案的技术、经济、时间可行性
3. 风险评估 — 识别方案中的潜在风险和应对措施
4. 资源规划 — 评估所需的人力、物力、资金资源
5. 时间管理 — 制定项目时间线和里程碑
6. 利益相关者分析 — 识别和分析各方利益关系

工作原则：
- 方案要有结构：背景 → 目标 → 方案 → 风险 → 预算 → 时间线
- 给出多个备选方案时，说明各方案的优劣
- 风险要具体，应对措施要可执行
- 用数据和事实支撑分析，不空谈`,
    });
  }

  async execute(task: string, context?: Record<string, unknown>): Promise<AgentExecuteResult> {
    return this.buildResult(task, `方案策划任务: ${task}`, `[方案秘书] 处理中: ${task}`, ['plan_design']);
  }
}
