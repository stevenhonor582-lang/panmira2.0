import { Intent } from '../../core/constants.js';
import type { IntentClassification } from '../../core/types.js';

const KEYWORDS: Record<Intent, string[]> = {
  [Intent.TASK]: ['执行', '完成', '做', '处理', '安排', '创建', '生成', '写', '开发'],
  [Intent.COLLAB]: ['协作', '一起', '帮忙', '转交', '分配', '协同'],
  [Intent.QUERY]: ['查询', '什么', '多少', '怎么', '如何', '为什么', '哪', '了解'],
  [Intent.APPROVAL]: ['审批', '批准', '同意', '拒绝', '审核', '确认'],
  [Intent.ADMIN]: ['配置', '设置', '管理', '添加', '删除', '修改', '权限'],
};

export function classifyIntent(input: string): IntentClassification {
  const scores = new Map<Intent, number>();

  for (const [intent, keywords] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (input.includes(kw)) score++;
    }
    scores.set(intent as Intent, score);
  }

  let best: Intent = Intent.QUERY;
  let bestScore = 0;
  for (const [intent, score] of Array.from(scores.entries())) {
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (bestScore === 0) best = Intent.TASK;

  return {
    intent: best,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1) : 0.3,
    reasoning: `基于关键词匹配，命中 ${bestScore} 个 ${best} 类关键词`,
  };
}
