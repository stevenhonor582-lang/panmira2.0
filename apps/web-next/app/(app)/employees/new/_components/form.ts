// R15-B wizard form state — extended to drive all real backend fields.
// Backend fields (POST /api/agents) are mapped at submit time in wizard.tsx.

export type Visibility = "private" | "team" | "public";

export interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  type: string;       // "LLM" | "embedding" | "openai" | "anthropic" ...
  baseUrl?: string;
  isDefault?: boolean;
  hasApiKey?: boolean;
  // R34-B: 真实最大上下文(来自 provider_configs.context_window),用于自动填充窗口档位。
  contextWindow?: number | null;
}

// R34-B: 上下文自动压缩配置(存 agent.orchestration.autoCompress jsonb)。
export interface AutoCompressConfig {
  enabled: boolean;       // 是否启用自动压缩
  thresholdPct: number;   // 触发阈值(上下文用到 N% 时触发),默认 80
  ratioPct: number;       // 压缩比例(压缩到原来的 N%),默认 50
}

export interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  source?: string;
  tags?: string[];
}

export interface McpServerInfo {
  id: string;
  name: string;
  url?: string;
  transport?: string;
  status?: string;
  health?: string;
}

export interface KbFolderInfo {
  id: string;
  name: string;
  parentId?: string | null;
  path?: string;
  visibility?: string;
  docCount?: number;
  botId?: string | null;
}

export interface KbInfo {
  id: string;
  name: string;
  documentCount?: number;
}

export interface ChannelBotInfo {
  agentId: string;
  name: string;
  displayName?: string;
  platform: string;
  remark?: string;
  workingDirectory?: string;
}

export interface PersonaPreset {
  id: string;
  label: string;
  tag?: string;
  summary: string;
  body: string;
  ironLaws?: string[];
}

export interface WizardForm {
  // Step 1 — basics
  name: string;
  description: string;
  templateId: string;
  glyph: string;
  hue: string;
  // Step 2 — brain
  providerId: string;        // → model_id (FK to provider_configs.id)
  providerModel: string;     // denormalized for preview
  providerName: string;      // denormalized for preview
  contextWindow: number;
  temperature: number;
  // R34-B: 上下文自动压缩配置
  autoCompress: AutoCompressConfig;
  // Step 3 — persona
  personaPreset: string;     // preset id, or "" for custom
  persona: string;           // short description (60 chars, drives first impression)
  systemPrompt: string;      // full system prompt
  ironLaws: string[];        // hard rules
  // Step 4 — capabilities
  skills: string[];
  mcpServerIds: string[];
  tools: string[];
  // Step 5 — knowledge
  knowledgeBaseIds: string[];
  kbFolderIds: string[];
  // Step 6 — collab
  visibility: Visibility;
  callableBy: string[];      // user ids/names who can invoke
  dispatcher: string[];      // agent ids who can dispatch this one
  channelIds: string[];      // bot_config ids (one agent → many bots)
  workingDir: string;
}

export const EMPTY_FORM: WizardForm = {
  name: "",
  description: "",
  templateId: "",
  glyph: "新",
  hue: "amber",
  providerId: "",
  providerModel: "",
  providerName: "",
  contextWindow: 200000,
  temperature: 0.5,
  autoCompress: { enabled: true, thresholdPct: 80, ratioPct: 50 },
  personaPreset: "",
  persona: "",
  systemPrompt: "",
  ironLaws: [],
  skills: [],
  mcpServerIds: [],
  tools: [],
  knowledgeBaseIds: [],
  kbFolderIds: [],
  visibility: "team",
  callableBy: [],
  dispatcher: [],
  channelIds: [],
  workingDir: "",
};

// Built-in tool catalog (no backend list — these are SDK-level capabilities).
// Each entry has a human description so step 4 can show what each does.
export const BUILT_IN_TOOLS: { id: string; label: string; description: string }[] = [
  { id: "web_search",  label: "Web Search",  description: "联网搜索公开网页,获取最新信息" },
  { id: "web_fetch",   label: "Web Fetch",   description: "抓取指定 URL 的内容并解析为文本" },
  { id: "file_read",   label: "File Read",   description: "读取工作目录内的文件" },
  { id: "file_write",  label: "File Write",  description: "在工作目录内创建/覆写文件" },
  { id: "code_execute", label: "Code Execute", description: "在沙盒中执行代码(Python/Node)" },
  { id: "image_gen",   label: "Image Gen",   description: "生成图片(需接 DALL·E / SD / Flux)" },
  { id: "kv_memory",   label: "KV Memory",   description: "键值式短期记忆,跨对话保留" },
  { id: "task_plan",   label: "Task Plan",   description: "把复杂任务拆成多步计划" },
];

// Persona preset catalog (drives Step 3).
// Each entry explains what the persona does so the user understands the effect.
export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "precise",
    label: "精准军师",
    tag: "Precise",
    summary: "代码零废话,文档极简,三个字精确胜于一万字展开",
    body: "你是精准军师。说人话,直接给方案,不重复用户的问题。代码片段只用必要的部分,文档三行说清楚的不写五行。",
    ironLaws: ["不重复用户已经说过的话", "代码片段只保留必要部分", "数据必须有出处,不杜撰"],
  },
  {
    id: "warm",
    label: "温暖秘书",
    tag: "Warm",
    summary: "情感先行,先接住情绪再解决事情,但处理事情同样专业",
    body: "你是温暖秘书。看到用户先识别情绪状态,有时先说一句 '辛苦了' 比给方案更重要。处理事情同样专业,但永远保留温度。",
    ironLaws: ["先识别情绪再给方案", "拒绝时给出原因和替代", "绝不冷漠敷衍"],
  },
  {
    id: "contrarian",
    label: "挑刺将军",
    tag: "Contrarian",
    summary: "默认不信,挑漏洞,被驳倒才服,认输也干脆",
    body: "你是挑刺将军。默认不信任何方案,要先找到 3 个反驳理由。被驳倒才认输,而且承认得很干脆。",
    ironLaws: ["任何方案先列 3 个反驳理由", "被驳倒立即承认", "不为了面子强词夺理"],
  },
  {
    id: "ops",
    label: "运维老兵",
    tag: "Ops",
    summary: "凌晨不重构,失败先停手,所有改动留痕",
    body: "你是运维老兵。所有操作前先问 '这能回滚吗?'。凌晨只止血,不修大 bug。日志和监控优先于直觉。",
    ironLaws: ["操作前先确认可回滚", "凌晨只止血不重构", "所有改动写日志"],
  },
  {
    id: "boss",
    label: "老板分身",
    tag: "Boss",
    summary: "三档方案同时输出,让老板选,绝不杜撰数据",
    body: "你是老板分身。方案永远给三档:稳健 / 激进 / 折中。让老板选,不替他决定。所有数据必须有出处,不杜撰。",
    ironLaws: ["方案永远三档:稳健/激进/折中", "数据必须有出处", "不替老板决策,只给选项"],
  },
  {
    id: "sales",
    label: "一线销售",
    tag: "Sales",
    summary: "先识别客户痛点,说人话,信号到就推进下一步",
    body: "你是一线销售。先用 3 句话识别客户痛点,然后用客户的语言回答,最后给出明确的下一步动作(留资/样册/会议)。",
    ironLaws: ["先识别痛点再介绍产品", "用客户语言不用行业黑话", "每次对话都要明确下一步"],
  },
  {
    id: "support",
    label: "客服一线",
    tag: "Support",
    summary: "情绪先行,问题升级同步,解决后回访",
    body: "你是客服一线。看到客户问题先共情,然后给出明确解决步骤。无法解决时立即升级,且同步进度给客户。",
    ironLaws: ["先共情再解决", "解决不了立即升级", "解决后主动回访"],
  },
];

// Convert WizardForm → POST /api/agents body. Keeps the wizard in charge of shape.
export function formToAgentPayload(form: WizardForm): Record<string, unknown> {
  return {
    name: form.name.trim() || "未命名员工",
    description: form.description,
    systemPrompt: form.systemPrompt,
    persona: form.persona,
    capabilities: [],
    tools: form.tools,
    ironLaws: form.ironLaws,
    knowledgeFolders: form.kbFolderIds,
    skills: form.skills,
    orchestration: {
      dispatcherAgentIds: form.dispatcher,
      callableByUsers: form.callableBy,
      // R34-B: 上下文自动压缩配置(存 jsonb,引擎按需读取)
      autoCompress: form.autoCompress,
    },
    boundary: {
      visibilityHint: form.visibility,
    },
    // R15-A/B columns (real)
    visibility: form.visibility,
    temperature: form.temperature,
    workingDir: form.workingDir || undefined,
    channelIds: form.channelIds,
    isTemplate: false,
    defaultContextWindow: form.contextWindow,
    defaultModel: form.providerModel || undefined,
    defaultEngine: "claude",
    modelId: form.providerId || undefined,
    avatarGlyph: form.glyph,
    avatarHue: form.hue,
    templateType: "custom",
    category: "general",
    status: "active",
  };
}
