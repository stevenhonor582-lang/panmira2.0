export type SceneType = 'development' | 'content' | 'data' | 'unknown';

const SCENE_KEYWORDS: Record<Exclude<SceneType, 'unknown'>, string[]> = {
  data: ['数据', 'GA4', 'GSC', '分析', '报告', '统计'],
  development: ['代码', 'bug', '重构', 'function', 'class', 'API'],
  content: ['选题', '文章', '编辑', '文案', '标题', '正文'],
};

export class Orchestrator {
  constructor(private config: Record<string, unknown>) {}

  identifyScene(text: string, explicitHint?: string): SceneType {
    if (explicitHint) {
      if (explicitHint.includes('数据')) return 'data';
      if (explicitHint.includes('开发')) return 'development';
      if (explicitHint.includes('内容')) return 'content';
    }
    for (const scene of ['data', 'development', 'content'] as const) {
      if (SCENE_KEYWORDS[scene].some(k => text.includes(k))) return scene;
    }
    return 'unknown';
  }
}
