/**
 * Skill Registry — metadata for all available skills, used by SkillRouter
 * for dynamic skill selection based on user message content.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface SkillMeta {
  name: string;
  summary: string;
  triggers: string[];
  category: 'system' | 'communication' | 'productivity' | 'knowledge' | 'voice' | 'admin';
  platform: 'all' | 'feishu';
  alwaysLoad?: boolean;
}

/** Hardcoded skills with known routing metadata. */
const HARDCODED_REGISTRY: SkillMeta[] = [
  // ── System skills (always loaded) ──
  {
    name: 'panmira',
    summary: 'Panmira API 调用能力，查看机器人信息和管理',
    triggers: [],
    category: 'system',
    platform: 'all',
    alwaysLoad: true,
  },
  {
    name: 'metaskill',
    summary: '技能管理和创建能力',
    triggers: ['创建技能', 'skill', 'create skill'],
    category: 'system',
    platform: 'all',
    alwaysLoad: true,
  },
  {
    name: 'skill-hub',
    summary: '技能市场浏览和安装',
    triggers: ['技能市场', 'skill hub', 'browse skills'],
    category: 'system',
    platform: 'all',
    alwaysLoad: true,
  },

  // ── Memory ──
  {
    name: 'metamemory',
    summary: '记忆管理：搜索、保存、查看知识',
    triggers: ['记忆', 'memory', '知识库', '搜索知识', '保存'],
    category: 'knowledge',
    platform: 'all',
  },

  // ── Voice ──
  {
    name: 'phone-call',
    summary: '语音通话能力',
    triggers: ['打电话', '语音', '电话', 'phone', 'call', 'TTS'],
    category: 'voice',
    platform: 'all',
  },

  // ── Feishu/Lark: Communication ──
  {
    name: 'lark-im',
    summary: '飞书即时消息：发消息、回复、更新卡片',
    triggers: ['发消息', '发送消息', '回复消息', '卡片', 'im', '消息'],
    category: 'communication',
    platform: 'feishu',
  },
  {
    name: 'lark-mail',
    summary: '飞书邮件：发送邮件、读取邮件',
    triggers: ['邮件', 'email', 'mail', '发邮件', '收件箱'],
    category: 'communication',
    platform: 'feishu',
  },

  // ── Feishu/Lark: Productivity ──
  {
    name: 'lark-calendar',
    summary: '飞书日历：创建日程、查询空闲时间',
    triggers: ['日历', '日程', '会议', 'calendar', '约会议', '空闲时间'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-task',
    summary: '飞书任务：创建任务、查看任务列表',
    triggers: ['任务', 'task', '待办', '创建任务'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-doc',
    summary: '飞书文档：创建、编辑、读取文档',
    triggers: ['文档', 'doc', '写文档', '创建文档', '编辑文档'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-sheets',
    summary: '飞书表格：创建、编辑电子表格',
    triggers: ['表格', 'sheet', 'excel', '电子表格', '数据表'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-base',
    summary: '飞书多维表格：操作多维表格数据',
    triggers: ['多维表格', 'base', 'bitable', '数据表'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-wiki',
    summary: '飞书知识库：浏览和搜索知识空间',
    triggers: ['知识库', 'wiki', '知识空间', '文档空间'],
    category: 'knowledge',
    platform: 'feishu',
  },
  {
    name: 'lark-drive',
    summary: '飞书云文档：上传、下载、管理文件',
    triggers: ['云盘', 'drive', '上传文件', '下载文件', '文件管理'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-contact',
    summary: '飞书通讯录：搜索联系人、部门信息',
    triggers: ['通讯录', '联系人', 'contact', '员工', '部门'],
    category: 'admin',
    platform: 'feishu',
  },
  {
    name: 'lark-event',
    summary: '飞书事件订阅：监听和回复事件',
    triggers: ['事件', 'event', '订阅', '回调'],
    category: 'admin',
    platform: 'feishu',
  },
  {
    name: 'lark-vc',
    summary: '飞书视频会议：创建和管理会议',
    triggers: ['视频会议', 'vc', 'video', '线上会议', '会议链接'],
    category: 'communication',
    platform: 'feishu',
  },
  {
    name: 'lark-whiteboard',
    summary: '飞书白板：创建和操作白板',
    triggers: ['白板', 'whiteboard', '画板'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-minutes',
    summary: '飞书会议纪要：生成和管理纪要',
    triggers: ['会议纪要', 'minutes', '纪要', '会议记录'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-openapi-explorer',
    summary: '飞书 OpenAPI 探索器：调试 API',
    triggers: ['openapi', 'api', '调试', '接口'],
    category: 'admin',
    platform: 'feishu',
  },
  {
    name: 'lark-shared',
    summary: '飞书共享工具：公共函数和常量',
    triggers: [],
    category: 'system',
    platform: 'feishu',
    alwaysLoad: true,
  },
  {
    name: 'lark-skill-maker',
    summary: '飞书技能制作器：创建飞书技能',
    triggers: ['创建飞书技能', 'lark skill', 'make skill'],
    category: 'system',
    platform: 'feishu',
  },
  {
    name: 'lark-workflow-meeting-summary',
    summary: '会议摘要工作流',
    triggers: ['会议总结', 'meeting summary', 'workflow'],
    category: 'productivity',
    platform: 'feishu',
  },
  {
    name: 'lark-workflow-standup-report',
    summary: '站会报告工作流',
    triggers: ['站会', 'standup', '日报', '报告'],
    category: 'productivity',
    platform: 'feishu',
  },


  // ── Superpowers: 流程纪律（核心方法论）──
  {
    name: 'superpowers:using-superpowers',
    summary: 'Superpowers 入口：技能发现和使用规范，所有任务的调度中枢',
    triggers: [],
    category: 'system',
    platform: 'all',
    alwaysLoad: true,
  },
  {
    name: 'superpowers:brainstorming',
    summary: '头脑风暴：任何创造性工作前的需求探索和方案设计，先想清楚再动手',
    triggers: ['方案', '设计', '规划', '计划', '新建', '创建', '实现', '开发', '做一个', '帮我写', '帮我做', '构思', '想法'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:writing-plans',
    summary: '写实施计划：将设计拆解为可执行的分步实施计划',
    triggers: ['实施', '步骤', '拆分', '分步', '路线图', '排期', 'milestone'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:executing-plans',
    summary: '执行计划：按计划逐步实施，跟踪进度',
    triggers: [],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:systematic-debugging',
    summary: '系统化调试：禁止随机猜测，按复现→缩小范围→假设验证→根因分析流程',
    triggers: ['报错', '错误', 'bug', '故障', '失败', '不行', '不能用', 'debug', '排查', '为什么'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:test-driven-development',
    summary: 'TDD测试驱动开发：红灯→绿灯→重构循环',
    triggers: ['测试', 'test', '覆盖', '单测', '集成测试'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:requesting-code-review',
    summary: '请求代码审查：完成实现后的标准审查流程',
    triggers: ['审查', 'review', '检查代码', 'code review'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:verification-before-completion',
    summary: '完成前验证：确保所有测试通过、无遗漏',
    triggers: ['完成', '结束', '好了', '搞定', '验收'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:finishing-a-development-branch',
    summary: '完成开发分支：提交、推送、创建PR的标准流程',
    triggers: ['提交', 'push', 'PR', 'merge', '合并', '分支'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'superpowers:dispatching-parallel-agents',
    summary: '并行代理调度：将独立任务分发给多个代理并行执行',
    triggers: ['并行', '同时', '多个任务', 'parallel'],
    category: 'productivity',
    platform: 'all',
  },

  // ── ECC: 内容与写作 ──
  {
    name: 'article-writing',
    summary: '长文写作：文章、指南、博客、教程等结构化长内容，品牌语调一致性',
    triggers: ['写文章', '写方案', '报告', '白皮书', '指南', '教程', '博客', 'newsletter', '文案'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'content-engine',
    summary: '内容引擎：内容策略、生产流水线、分发体系',
    triggers: ['内容策略', '内容营销', '内容体系', '内容生产', '内容分发'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'brand-voice',
    summary: '品牌语调：统一的品牌表达风格和语言规范',
    triggers: ['品牌', '语调', '风格', '调性', '品牌形象'],
    category: 'productivity',
    platform: 'all',
  },
  {
    name: 'blueprint',
    summary: '蓝图规划：从零到一的产品/项目结构设计',
    triggers: ['蓝图', '架构设计', '系统设计', '从零开始'],
    category: 'productivity',
    platform: 'all',
  },

  // ── ECC: 研究与分析 ──
  {
    name: 'deep-research',
    summary: '深度研究：多轮检索和信息综合',
    triggers: ['研究', '调研', '分析报告', '行业分析', '竞品分析', '深度研究'],
    category: 'knowledge',
    platform: 'all',
  },
  {
    name: 'market-research',
    summary: '市场研究：市场规模、趋势、竞争格局分析',
    triggers: ['市场', '市场规模', '竞品', '行业趋势', 'TAM', 'SAM'],
    category: 'knowledge',
    platform: 'all',
  },
  {
    name: 'investor-materials',
    summary: '投资人材料：BP、Pitch Deck、数据包',
    triggers: ['BP', '商业计划', '融资', '路演', '投资人', 'pitch'],
    category: 'productivity',
    platform: 'all',
  },

  // ── ECC: 营销与SEO ──
  {
    name: 'seo',
    summary: 'SEO优化：关键词、元数据、结构化数据、Core Web Vitals',
    triggers: ['SEO', '搜索优化', '关键词', '排名', '收录'],
    category: 'productivity',
    platform: 'all',
  },

  // ── A股分析 ──
  {
    name: 'a-share-analyst',
    summary:
      'A股智能分析：对个股/行业/大盘进行六维分析（宏观+行业+技术+财务+同业+事件），输出结构化研判报告和进出场建议',
    triggers: ['分析', '股票', '大盘', '行情', '进场', '出场', 'A股', '估值', '板块', '个股', '000001', '600036'],
    category: 'knowledge',
    platform: 'all',
  },
];

/** Extract summary from SKILL.md frontmatter or first heading. */
function parseSkillSummary(skillMd: string): string {
  // Try frontmatter description
  const fmMatch = skillMd.match(/^---\s*\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/);
  if (fmMatch) return fmMatch[1].trim().replace(/^['"]|['"]$/g, '');

  // Try first markdown heading
  const headingMatch = skillMd.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();

  return '';
}

/** Extract triggers from SKILL.md frontmatter (explicit) or auto-generate from description + skill name. */
function parseSkillTriggers(skillMd: string, skillName: string): string[] {
  // Try explicit triggers in frontmatter
  const fmBlock = skillMd.match(/^---\s*\n([\s\S]*?)---/);
  if (fmBlock) {
    const fm = fmBlock[1];
    // YAML list: "triggers:\n  - foo\n  - bar"
    const listSection = fm.match(/triggers:\s*\n([\s\S]*?)(?=\n\S|\n$|$)/);
    if (listSection) {
      const items = listSection[1].match(/^\s*-\s*(.+)$/gm);
      if (items && items.length > 0) {
        return items.map((t) => t.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
      }
    }
    // Inline: "triggers: [foo, bar]"
    const inlineMatch = fm.match(/triggers:\s*\[(.+)\]/);
    if (inlineMatch) {
      return inlineMatch[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    // Single value: "triggers: foo"
    const singleMatch = fm.match(/^triggers:\s*(.+)$/m);
    if (singleMatch && !singleMatch[1].startsWith('[')) {
      return [singleMatch[1].trim()];
    }
  }

  // Auto-generate from description + skill name
  const desc = parseSkillSummary(skillMd);
  const triggers = new Set<string>();

  // Chinese phrases (2-8 chars) from description
  const cnPhrases = desc.match(/[\u4e00-\u9fff]{2,8}/g) || [];
  for (const phrase of cnPhrases) {
    if (phrase.length >= 2) triggers.add(phrase);
  }

  // English words (3+ chars) from description
  const enWords = desc.match(/[a-zA-Z]{3,}/g) || [];
  for (const w of enWords) {
    triggers.add(w.toLowerCase());
  }

  // Skill name parts (without vmt- prefix)
  const nameParts = skillName.replace(/^vmt-/, '').split('-');
  for (const part of nameParts) {
    if (part.length >= 2) triggers.add(part);
  }

  return Array.from(triggers).slice(0, 15);
}

/** Scan ~/.claude/skills/ for skills not in the hardcoded registry. */
function discoverUserSkills(): SkillMeta[] {
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(userSkillsDir)) return [];

  const knownNames = new Set(HARDCODED_REGISTRY.map((s) => s.name));
  const discovered: SkillMeta[] = [];

  try {
    for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (knownNames.has(entry.name)) continue;

      const skillMdPath = path.join(userSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const summary = parseSkillSummary(content) || `User skill: ${entry.name}`;

      discovered.push({
        name: entry.name,
        summary,
        triggers: parseSkillTriggers(content, entry.name),
        category: 'knowledge',
        platform: 'all',
      });
    }
  } catch {
    // ignore scan errors
  }

  return discovered;
}

/** Combined registry: hardcoded + dynamically discovered skills. */
export const SKILL_REGISTRY: SkillMeta[] = [...HARDCODED_REGISTRY, ...discoverUserSkills()];

/** Re-scan ~/.claude/skills/ and refresh the registry in-place so existing references see the update. */
export function refreshSkillRegistry(): SkillMeta[] {
  const fresh = [...HARDCODED_REGISTRY, ...discoverUserSkills()];
  SKILL_REGISTRY.length = 0;
  SKILL_REGISTRY.push(...fresh);
  return SKILL_REGISTRY;
}
