import type { BaseAgent } from '../base-agent.js';
import type { AgentSelection } from '../../core/types.js';

const ROLE_KEYWORDS: Record<string, string[]> = {
  cfo: ['财务', '预算', '成本', '利润', '投资', '融资', '资金', '账'],
  coo: ['运营', '流程', '效率', '管理', '组织', '团队', '人力资源'],
  cto: ['技术', '架构', '开发', '部署', '系统', '代码', '服务器', '数据库'],
  legal_secretary: ['法律', '合同', '合规', '法规', '条款', '律师', '法务', '知识产权', '风险', '审查'],
  plan_secretary: ['方案', '计划', '规划', '策划', '项目', '时间线', '里程碑', '可行性', '落地'],
  lingyan: ['总管', '统筹', '派单', '验收', '汇报', '指挥', '协调', '拆解', '凌烟阁', '团队管理', '安排', '调度', '任务分配'],
  alex_dev: ['剑主', '铸剑', '脚本', '爬虫', '接口', '调试', '工具', '自动化', '排查', '攻坚'],
  alex_content: ['文胆', '听雨', '文章', '写作', '内容', '选题', '文案', '标题', '公众号', '推文', '创作', '叙事', '稿件', '爆款'],
  alex_growth: ['行走', '风雷', '增长', '推广', '渠道', '传播', '冷启动', '受众', '分发', '热点', '流量', '获客', '裂变', '转化'],
  alex_ops: ['掌柜', '青囊', 'SOP', '流程', '风险', '预警', '资源', '盘点', '监控', '定时', '复盘', '合规', '异常', '调度'],
};

export function selectAgent(agents: BaseAgent[], task: string): AgentSelection {
  if (agents.length === 0) {
    return { agentId: undefined, agentName: undefined, reasoning: '无可用 Agent', confidence: 0 };
  }
  if (agents.length === 1) {
    const a = agents[0];
    return { agentId: a.id, agentName: a.name, reasoning: `唯一可用 Agent: ${a.name}`, confidence: 1 };
  }

  let best: BaseAgent = agents[0];
  let bestScore = 0;

  for (const agent of agents) {
    let score = 0;
    const role = agent.roleTemplate ?? '';
    const keywords = ROLE_KEYWORDS[role] ?? [];

    for (const kw of keywords) {
      if (task.includes(kw)) score += 3;
    }

    for (const cap of agent.capabilities) {
      if (task.includes(cap.split('_')[0])) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }

  return {
    agentId: best.id,
    agentName: best.name,
    reasoning: bestScore > 0 ? `关键词匹配选择 ${best.name}（得分: ${bestScore}）` : `默认选择 ${best.name}`,
    confidence: bestScore > 0 ? 0.7 : 0.4,
  };
}
