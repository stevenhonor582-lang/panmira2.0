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
  /** Skill scope: 'global' = available to all bots, 'bot' = private to a single bot */
  scope?: 'global' | 'bot';
  /** Bot that owns this skill (only for scope='bot') */
  ownerBot?: string;
  /** Required dependencies: e.g. ['mcp:github', 'apt:jq', 'skill:docker-patterns'] */
  requires?: string[];
  /** Agent roles this skill is suitable for: developer, content, ops, qa, general */
  agentRoles?: string[];
  /** Capability tags: plan | debug | test | implement | review | deploy */
  capabilities?: string[];
  /** Task types this skill applies to */
  appliesTo?: ('bug_fix' | 'new_feature' | 'refactor' | 'deploy' | 'general')[];
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
    capabilities: ['plan'],
  },
  {
    name: 'superpowers:writing-plans',
    summary: '写实施计划：将设计拆解为可执行的分步实施计划',
    triggers: ['实施', '步骤', '拆分', '分步', '路线图', '排期', 'milestone'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['plan'],
  },
  {
    name: 'superpowers:executing-plans',
    summary: '执行计划：按计划逐步实施，跟踪进度',
    triggers: [],
    category: 'productivity',
    platform: 'all',
    capabilities: ['implement'],
  },
  {
    name: 'superpowers:systematic-debugging',
    summary: '系统化调试：禁止随机猜测，按复现→缩小范围→假设验证→根因分析流程',
    triggers: ['报错', '错误', 'bug', '故障', '失败', '不行', '不能用', 'debug', '排查', '为什么'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['debug'],
  },
  {
    name: 'superpowers:test-driven-development',
    summary: 'TDD测试驱动开发：红灯→绿灯→重构循环',
    triggers: ['测试', 'test', '覆盖', '单测', '集成测试'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['test'],
  },
  {
    name: 'superpowers:requesting-code-review',
    summary: '请求代码审查：完成实现后的标准审查流程',
    triggers: ['审查', 'review', '检查代码', 'code review'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['review'],
  },
  {
    name: 'superpowers:verification-before-completion',
    summary: '完成前验证：确保所有测试通过、无遗漏',
    triggers: ['完成', '结束', '好了', '搞定', '验收'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['test'],
  },
  {
    name: 'superpowers:finishing-a-development-branch',
    summary: '完成开发分支：提交、推送、创建PR的标准流程',
    triggers: ['提交', 'push', 'PR', 'merge', '合并', '分支'],
    category: 'productivity',
    platform: 'all',
    capabilities: ['deploy'],
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
// ═══════════════════════════════════════════════════════════
  // gstack skills — 30 key skills integrated from Garry Tan's gstack
  // ═══════════════════════════════════════════════════════════

  // ── Developer (不盈等) ──
  { name: 'gstack:review', summary: 'Pre-landing PR review — find bugs CI misses, auto-fix obvious ones', triggers: ['review','审查','code review','PR review','检查代码'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:ship', summary: 'Ship workflow: test, review diff, bump version, push, create PR', triggers: ['ship','发布','上线','部署','ship it'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:cso', summary: 'Chief Security Officer — OWASP Top 10 + STRIDE threat model audit', triggers: ['security','安全','安全审查','漏洞','cso'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:investigate', summary: 'Systematic root-cause debugging — no fixes without investigation', triggers: ['investigate','排查','定位','根因','root cause','debug'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:spec', summary: 'Turn vague intent into precise 5-phase executable spec with code-reading', triggers: ['spec','规格','需求规格','技术规格','write spec'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:codex', summary: 'OpenAI Codex CLI — second opinion code review, adversarial challenge', triggers: ['codex','第二意见','second opinion','外部审查'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:land-and-deploy', summary: 'Merge PR, wait for CI, deploy, verify production health', triggers: ['land','land and deploy','合并部署','上线验证'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:setup-deploy', summary: 'One-time deploy configuration — detect platform, URL, commands', triggers: ['setup deploy','配置部署','deploy setup'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },

  // ── Planning & Strategy (信言 + 不盈) ──
  { name: 'gstack:office-hours', summary: 'YC Office Hours — 6 forcing questions, reframe product before code', triggers: ['office hours','创业辅导','产品讨论','头脑风暴','idea review'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','developer'] },
  { name: 'gstack:plan-ceo-review', summary: 'CEO review — rethink problem, find 10-star product, 4 scope modes', triggers: ['ceo review','ceo审查','战略审查','产品审查','scope review'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },
  { name: 'gstack:plan-eng-review', summary: 'Eng manager review — architecture, data flow, edge cases, test plan', triggers: ['eng review','工程审查','架构审查','技术审查','tech review'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['developer'] },
  { name: 'gstack:plan-design-review', summary: 'Designer review — rate 0-10, AI slop detection, interactive design choices', triggers: ['design review','设计审查','UI审查','ux review'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },
  { name: 'gstack:autoplan', summary: 'One-command review pipeline — CEO→design→eng→DX reviews auto-run', triggers: ['autoplan','全流程审查','auto review','一键审查'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','developer'] },

  // ── Design (信言) ──
  { name: 'gstack:design-consultation', summary: 'Build complete design system — research landscape, propose creative risks', triggers: ['design consultation','设计咨询','设计系统','design system','品牌设计'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },
  { name: 'gstack:design-shotgun', summary: 'Generate 4-6 AI mockup variants, compare, iterate with taste memory', triggers: ['design shotgun','设计探索','设计方案','mockup','原型设计','设计变体'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },
  { name: 'gstack:design-html', summary: 'Turn mockup into production HTML/CSS — Pretext computed layout, zero deps', triggers: ['design html','生成页面','html css','前端实现','landing page'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },
  { name: 'gstack:design-review', summary: 'Designer QA — find visual issues, spacing, hierarchy, AI slop, fix them', triggers: ['design qa','设计质检','visual review','设计修复'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content'] },

  // ── QA (所有 Agent) ──
  { name: 'gstack:qa', summary: 'Systematic QA — test web app, find bugs, fix with atomic commits, regen tests', triggers: ['qa','测试','质量保证','功能测试','regression test'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['developer','content'] },
  { name: 'gstack:qa-only', summary: 'QA report only — same methodology but report-only, no code changes', triggers: ['qa only','测试报告','bug report','仅测试'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['developer','content'] },

  // ── Documentation (信言 + 不盈) ──
  { name: 'gstack:document-release', summary: 'Update all project docs to match shipped code — catches stale READMEs', triggers: ['document release','文档更新','更新文档','doc update'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','developer'] },
  { name: 'gstack:document-generate', summary: 'Generate missing docs from scratch using Diataxis framework', triggers: ['document generate','生成文档','写文档','generate docs'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','developer'] },

  // ── Operations (所有 Agent) ──
  { name: 'gstack:retro', summary: 'Weekly engineering retrospective — per-person stats, shipping streaks', triggers: ['retro','回顾','周报','retrospective','weekly review'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['developer','content','ops'] },
  { name: 'gstack:canary', summary: 'Post-deploy monitoring — watches console errors, perf regressions', triggers: ['canary','监控','金丝雀','post deploy','部署监控'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['ops'] },
  { name: 'gstack:benchmark', summary: 'Performance baseline — Core Web Vitals, page load, resource sizes', triggers: ['benchmark','性能测试','性能基准','page speed'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['developer'] },

  // ── Browser Automation ──
  { name: 'browser-automation', summary: '浏览器自动化：网页导航、点击、输入、截图、数据提取，支持持久化登录和反检测', triggers: ['浏览器','发帖','发LinkedIn','发推特','发推','网页操作','网页自动化','自动化操作','browser','automate','post to','social media','LinkedIn','Twitter','Facebook','Instagram','截图网页','填表','网页点击','auto post','网页','打开网页','操控浏览器'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['general','content'] },

  // ── General Tools ──
  { name: 'gstack:learn', summary: 'Manage project learnings across sessions — search, review, prune patterns', triggers: ['learn','学习','经验','lesson learned','项目经验'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['general'] },
  { name: 'gstack:make-pdf', summary: 'Turn markdown into publication-quality PDF', triggers: ['make pdf','生成pdf','导出pdf','pdf'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['general'] },
  { name: 'gstack:scrape', summary: 'Pull structured data from a web page', triggers: ['scrape','抓取','爬数据','网页抓取','web scrape'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['general'] },
  { name: 'gstack:careful', summary: 'Safety guardrails — warn before destructive commands (rm -rf, DROP TABLE)', triggers: ['careful','小心','安全模式','be careful'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['general'] },
  { name: 'gstack:guard', summary: 'Full safety — careful + freeze in one command', triggers: ['guard','保护','安全保护','full safety'], category: 'system', platform: 'all', scope: 'global', agentRoles: ['general'] },

// ═══════════════════════════════════════════════════════════
  // anthropics/skills (146K⭐) — 文档处理技能
  // ═══════════════════════════════════════════════════════════
  { name: 'anthropics:doc-coauthoring', summary: 'Collaborative document editing — multi-stage draft→review→export workflow for structured documents', triggers: ['起草','写方案','写文档','合作撰写','coauthor','draft','写报告','写计划书'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:docx', summary: 'Create, edit, analyze Word documents — track changes, comments, formatting', triggers: ['word','docx','文档','报告','合同','标书','公文'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:pptx', summary: 'Create, edit PowerPoint presentations — slides, layouts, templates', triggers: ['ppt','pptx','幻灯片','演示','presentation','路演','汇报'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:pdf', summary: 'Extract text, tables, metadata from PDFs — merge and annotate', triggers: ['pdf','提取','合并','标注','扫描件','PDF文档'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:xlsx', summary: 'Spreadsheet operations — formulas, charts, pivot tables, data transforms', triggers: ['xlsx','excel','表格','电子表格','公式','图表','数据','预算表'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:brand-guidelines', summary: 'Apply brand colors, typography, and writing style to all output artifacts', triggers: ['品牌','brand','风格','配色','字体','排版','统一风格','品牌规范'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'anthropics:internal-comms', summary: 'Internal communications — status reports, newsletters, FAQs, announcements', triggers: ['内部通知','公告','周报','月报','newsletter','通讯','通报','通知'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },

  // ═══════════════════════════════════════════════════════════
  // antigravity-awesome-skills (36.5K⭐) — 去AI味 + 方案
  // ═══════════════════════════════════════════════════════════
  { name: 'beautiful-prose', summary: 'Hard-edged writing style contract — forceful prose without AI tics. 4 registers, density/heat/length controls', triggers: ['beautiful prose','去AI味','英文润色','forceful writing','sharp prose','ai-free writing','clean prose'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'humanize-chinese', summary: '检测并改写AI痕迹中文 — 去AI味、降AIGC、论文降重、风格转换(知乎/小红书/微信/文学/学术)', triggers: ['去AI味','降AIGC','去除AI痕迹','让文字更自然','改成人话','降低AI率','论文降重','humanize chinese','中文润色','洗稿'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'plan-writing', summary: 'Turn tasks into actionable plans — 2-5 min tasks, clear ownership, verifiable outcomes', triggers: ['plan writing','计划','方案','任务拆解','行动计划','执行方案','写计划'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'business-analyst', summary: 'Business analysis — requirements gathering, stakeholder mapping, process modeling', triggers: ['business analysis','需求分析','业务分析','stakeholder','流程分析','需求梳理','业务梳理'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'pitch-psychologist', summary: 'Pitch/方案说服心理学 — objection anticipation, persuasion patterns, audience psychology', triggers: ['pitch','说服','方案优化','打动','投资人','客户','提案技巧','方案心理','persuasion'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },

  // ═══════════════════════════════════════════════════════════
  // gpt-image2-ppt (683⭐) — 高颜值PPT，27种视觉风格
  // ═══════════════════════════════════════════════════════════
  { name: 'gpt-image2-ppt', summary: '用gpt-image-2生成高颜值PPT — 27种视觉风格(渐变玻璃/暗色极光/瑞士网格/侘寂/千禧金属/麦肯锡/创意机构...), 16:9 .pptx输出', triggers: ['ppt','幻灯片','演示','presentation','deck','路演','汇报','slides','做ppt','生成ppt','高颜值ppt','精美ppt'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },

{ name: 'slides-grab', summary: 'End-to-end presentation workflow — plan, design, edit, export (PDF/PNG). Best harness for AI-generated slides', triggers: ['slides','presentation','slideshow','slide deck','做slides','幻灯片制作','slides-grab'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },

// ═══════════════════════════════════════════════════════════
  // marketingskills (30.5K⭐) — 专业文案+营销技能
  // ═══════════════════════════════════════════════════════════
  { name: 'copywriting', summary: '专业营销文案撰写 — AIDA/PAS/Jobs-to-be-Done框架，落地页/定价页/CTA/价值主张', triggers: ['文案','copywriting','写文案','营销文案','landing page','write copy','headline','CTA','价值主张','tagline'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'copy-editing', summary: '文案审校打磨 — 逐句推敲，删冗余，强化说服力，保持品牌调性', triggers: ['审校','打磨','改文案','copy edit','polish','proofread','文案修改','润色文案'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'content-strategy', summary: '内容策略规划 — 内容支柱、内容日历、分发渠道、效果度量', triggers: ['内容策略','content strategy','内容规划','内容日历','content plan','选题规划'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'emails', summary: '邮件撰写 — 营销邮件/通知邮件/序列邮件/Newsletter', triggers: ['邮件','email','写邮件','newsletter','邮件营销','email campaign'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },
  { name: 'marketing-psychology', summary: '营销心理学 — 稀缺性/社会证明/锚定效应/损失厌恶等30+心理学原则应用', triggers: ['营销心理','心理学','persuasion','说服','消费者心理','behavioral economics'], category: 'productivity', platform: 'all', scope: 'global', agentRoles: ['content','secretary'] },

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

/** Scan src/skills/vmt/ for VMT content marketing skills. */
function discoverVmtSkills(): SkillMeta[] {
  const vmtDir = path.join(process.cwd(), 'src', 'skills', 'vmt');
  if (!fs.existsSync(vmtDir)) return [];

  const discovered: SkillMeta[] = [];
  const categoryMap: Record<string, string> = {
    '01-selection-strategist': '选型策略',
    '02-knowledge-manager': '知识管理',
    '03-content-strategist': '内容策略',
    '04-content-producer': '内容生产',
    '05-seo-publisher': 'SEO发布',
    '06-promotion-operator': '推广运营',
    '07-customer-service': '客户服务',
    '08-quotation-specialist': '报价专家',
    '09-delivery-operator': '交付运营',
    '10-quality-reviewer': '质量审核',
  };

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'SKILL.md') {
        try {
          const skillContent = fs.readFileSync(full, 'utf-8');
          const summary = parseSkillSummary(skillContent);
          const triggers = parseSkillTriggers(skillContent, path.basename(path.dirname(full)));
          const dirName = path.basename(path.dirname(full));
          // Determine category from parent directory name
          let catLabel = 'knowledge';
          for (const [key, label] of Object.entries(categoryMap)) {
            if (full.includes(key)) { catLabel = label; break; }
          }
          discovered.push({
            name: 'vmt-' + dirName,
            summary: summary || dirName,
            triggers,
            category: 'knowledge',
            platform: 'all',
          });
        } catch { /* skip broken files */ }
      }
    }
  }

  walk(vmtDir);
  return discovered;
}


/** Scan ./skills/ (project-root bundled skills) for skills not in the hardcoded registry. */
function discoverBuiltinSkills(): SkillMeta[] {
  const builtinDir = path.join(process.cwd(), 'skills');
  if (!fs.existsSync(builtinDir)) return [];

  const knownNames = new Set(HARDCODED_REGISTRY.map((s) => s.name));
  const discovered: SkillMeta[] = [];

  try {
    for (const entry of fs.readdirSync(builtinDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (knownNames.has(entry.name)) continue;

      const skillMdPath = path.join(builtinDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const summary = parseSkillSummary(content) || `Builtin skill: ${entry.name}`;

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

/** Deduplicate skills by name, keeping first occurrence. */
function dedupSkills(skills: SkillMeta[]): SkillMeta[] {
  const seen = new Set<string>();
  return skills.filter(s => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

/** Combined registry: hardcoded + VMT + builtin + user skills (deduplicated). */
export const SKILL_REGISTRY: SkillMeta[] = dedupSkills([...HARDCODED_REGISTRY, ...discoverVmtSkills(), ...discoverBuiltinSkills(), ...discoverUserSkills()]);

/** Re-scan ~/.claude/skills/ and refresh the registry in-place so existing references see the update. */

/**
 * Validate that all skills referenced by an agent actually exist.
 * Returns list of missing skill names. Empty list = all good.
 */
export function validateAgentSkills(agentSkills: string[]): { missing: string[]; warnings: string[] } {
  const registryNames = new Set(SKILL_REGISTRY.map((s) => s.name));
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const name of agentSkills) {
    if (!registryNames.has(name)) {
      missing.push(name);
      warnings.push(`Skill "${name}" not found in SKILL_REGISTRY — it will be skipped at runtime`);
    }
  }

  // Also check: do registry skills have files on disk?
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  for (const name of agentSkills) {
    if (missing.includes(name)) continue;
    const skillPath = path.join(userSkillsDir, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      warnings.push(`Skill "${name}" has no SKILL.md at ${skillPath}`);
    }
  }

  return { missing, warnings };
}

export function refreshSkillRegistry(): SkillMeta[] {
  const fresh = dedupSkills([...HARDCODED_REGISTRY, ...discoverVmtSkills(), ...discoverBuiltinSkills(), ...discoverUserSkills()]);
  SKILL_REGISTRY.length = 0;
  SKILL_REGISTRY.push(...fresh);
  return SKILL_REGISTRY;
}
