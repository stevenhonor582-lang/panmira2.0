"use client";

import * as React from "react";
import {
  fetchAgents,
  fetchTemplates,
  type Agent,
} from "../../_lib/data";
import type { WizardForm } from "./form";
// PickerCard 已被 ResourcePicker 替代(R25)
import {
  ResourcePicker,
  type ResourceItem,
} from "@/components/resource-picker/resource-picker";
// Loader2 已不再需要(模板/实例列表 picker 内部自带 loading)

// R27 规则 1: 中文→拼音首字母(与后端 generateWorkingDir 同源,仅用于预览)
const PINYIN_PREVIEW: Record<string, string> = {
  '不':'b','盈':'y','墨':'m','言':'y','守':'s','静':'j','得':'d','一':'y','玄':'x','鉴':'j','全':'q','栈':'z',
  '文':'w','案':'a','运':'y','维':'w','替':'t','补':'b',
};
function previewSlug(name: string): string {
  let r = "";
  for (const ch of String(name || "")) {
    if (/[a-zA-Z0-9]/.test(ch)) r += ch.toLowerCase();
    else if (PINYIN_PREVIEW[ch]) r += PINYIN_PREVIEW[ch];
  }
  return r.slice(0, 6) || "agent";
}

const GLYPHS = ["新", "工", "文", "运", "客", "研", "守", "得", "墨", "玄", "不", "销", "服"];
const HUES = ["amber", "rose", "teal", "sky", "indigo", "stone", "emerald", "violet", "lime"];

/**
 * R25 起点选择 — 3 个起点都用 ResourcePicker 让用户主动选:
 *  - 空白起步:清空 form
 *  - 模板预设:从真实模板库(/api/v2/employees/templates)选
 *  - 复制现有:从真实实例(/api/v2/employees?filter=instance)选
 *
 * 用户反馈(R25):"模板预设直接默认全栈工程师不让选 / 复制现有选了没反应"。
 * 根因:之前 hard-code 默认 fullstack + 复制现有是个外跳 Link。
 * 修复:统一改用 ResourcePicker + 选完预填 form 字段。
 */
export function Step1({
  form,
  setForm,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
}) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) =>
    setForm({ ...form, [k]: v });

  // Picker 开关
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
  const [copyPickerOpen, setCopyPickerOpen] = React.useState(false);

  // 模板 / 实例列表
  const [templates, setTemplates] = React.useState<Agent[]>([]);
  const [instances, setInstances] = React.useState<Agent[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [instancesLoading, setInstancesLoading] = React.useState(false);

  // 懒加载 — 第一次打开 picker 时才拉
  const loadTemplates = React.useCallback(async () => {
    if (templates.length > 0 || templatesLoading) return;
    setTemplatesLoading(true);
    try {
      const list = await fetchTemplates();
      setTemplates(list);
    } finally {
      setTemplatesLoading(false);
    }
  }, [templates.length, templatesLoading]);

  const loadInstances = React.useCallback(async () => {
    if (instances.length > 0 || instancesLoading) return;
    setInstancesLoading(true);
    try {
      const list = await fetchAgents({ filter: "instance" });
      setInstances(list);
    } finally {
      setInstancesLoading(false);
    }
  }, [instances.length, instancesLoading]);

  const openTemplatePicker = () => {
    void loadTemplates();
    setTemplatePickerOpen(true);
  };
  const openCopyPicker = () => {
    void loadInstances();
    setCopyPickerOpen(true);
  };

  // 选择空白 — 清空表单回到初始
  const applyBlank = () => {
    setForm({
      ...form,
      templateId: "blank",
      name: "",
      description: "",
      glyph: "新",
      hue: "amber",
      persona: "",
      systemPrompt: "",
      ironLaws: [],
      skills: [],
      mcpServerIds: [],
      tools: [],
      kbFolderIds: [],
      knowledgeBaseIds: [],
      channelIds: [],
    });
  };

  // 把 Agent 映射成 ResourceItem(picker 用)
  const agentToItem = (a: Agent): ResourceItem => ({
    id: a.id,
    label: a.displayName || a.name || a.id.slice(0, 8),
    description: a.persona || a.description || `角色 · ${a.role}`,
  });

  // 从模板/实例预填 form
  // clone=true 表示是从实例复制,建议名字加 " 副本"
  const applyAgent = (a: Agent, mode: "template" | "clone") => {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    const next: WizardForm = {
      ...form,
      templateId: mode === "template" ? `template:${a.id}` : `clone:${a.id}`,
      name: mode === "clone" ? `${a.displayName || a.name} 副本` : a.displayName || a.name || "",
      description: a.description || "",
      glyph: a.glyph || "新",
      hue: a.hue || "amber",
      persona: a.persona || "",
      systemPrompt: a.systemPrompt || (raw.system_prompt as string) || "",
      ironLaws: a.ironLaws || [],
      skills: a.skills || [],
      mcpServerIds: a.mcpServers || [],
      tools: a.tools || [],
      kbFolderIds: a.knowledgeFolders || [],
      knowledgeBaseIds:
        (raw.knowledge_base_ids as string[]) ||
        (raw.knowledgeBaseIds as string[]) ||
        [],
      channelIds: a.channelIds || [],
      workingDir: a.workingDir || "",
      providerId:
        (raw.model_id as string) ||
        (raw.providerId as string) ||
        form.providerId,
      providerModel: a.defaultModel || form.providerModel,
      providerName: form.providerName, // provider 名字后续 step 2 会展示
      contextWindow: a.defaultContextWindow || form.contextWindow,
      temperature: a.temperature ?? form.temperature,
      visibility: a.visibility || form.visibility,
    };
    setForm(next);
  };

  const templateItems = templates.map(agentToItem);
  const instanceItems = instances.map(agentToItem);

  // 当前起点状态(供视觉反馈)
  const startPoint: "blank" | "template" | "clone" | null =
    form.templateId === "blank"
      ? "blank"
      : form.templateId.startsWith("template:")
        ? "template"
        : form.templateId.startsWith("clone:")
          ? "clone"
          : null;

  return (
    <div className="space-y-7">
      <section className="rounded-2xl bg-muted/30 p-5 ring-1 ring-border">
        <div className="flex items-baseline justify-between gap-3">
          <Label>起点 · 选一个</Label>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
            选了之后,后续字段会自动预填(仍可改)
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StartPointCard
            active={startPoint === "blank"}
            onClick={applyBlank}
            badge="空白"
            title="空白起步"
            desc="完全自定义,不预填任何字段"
            glyph="新"
            hue="amber"
          />
          <StartPointCard
            active={startPoint === "template"}
            onClick={openTemplatePicker}
            badge="模板"
            title="模板预填"
            desc="从模板库选一个,自动填名字/头像/人格/技能"
            glyph="工"
            hue="indigo"
          />
          <StartPointCard
            active={startPoint === "clone"}
            onClick={openCopyPicker}
            badge="复制"
            title="复制现有员工"
            desc="选一个现有员工,深拷贝所有配置"
            glyph="复"
            hue="teal"
          />
        </div>

        {/* 已选提示 */}
        {startPoint && startPoint !== "blank" && (
          <div className="mt-3 rounded-lg bg-background/60 px-3 py-2 text-[12px] text-foreground/70 ring-1 ring-border">
            {startPoint === "template" && (
              <>已从模板预填 · 点"模板预填"可重选。后续 step 字段都还能改。</>
            )}
            {startPoint === "clone" && (
              <>已从现有员工复制 · 点"复制现有员工"可重选。名字已加"副本"后缀。</>
            )}
          </div>
        )}
      </section>

      <section>
        <Label>员工名字</Label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例:不盈 / 墨言 / 守静 / 销售助手-A"
          className="mt-2 w-full rounded-2xl bg-background px-5 py-4 text-[28px] font-semibold tracking-tight ring-1 ring-border placeholder:text-foreground/30 focus:outline-none focus:ring-foreground/40"
          data-testid="field-name"
        />
        {/* R27 规则 1: 工作目录自动生成预览(只读,英文拼音首字母+随机,保存时后端最终生成) */}
        {form.name.trim().length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-[12px] text-foreground/55">
            <span className="font-mono">
              工作目录(自动生成): /workspace/agents/{previewSlug(form.name)}-<span className="text-foreground/40">随机6位</span>
            </span>
            <span className="ml-auto rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/45">只读 · 不可手改</span>
          </div>
        )}
      </section>

      <section>
        <Label>一句话描述 · 干什么用的</Label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="例:工业品跨境售前咨询,客户问答 + 报价初判"
          className="mt-2 w-full rounded-xl bg-background px-4 py-3 text-[14px] ring-1 ring-border placeholder:text-foreground/30 focus:outline-none focus:ring-foreground/40"
          data-testid="field-description"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Label>头像样式</Label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {GLYPHS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("glyph", g)}
                className={
                  "inline-flex size-11 items-center justify-center rounded-xl text-lg font-semibold ring-1 transition-all " +
                  (form.glyph === g
                    ? "ring-foreground shadow-md"
                    : "ring-border hover:ring-foreground/40")
                }
                style={{ background: "var(--background)" }}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Label inline>色调</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {HUES.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set("hue", h)}
                  className={
                    "size-8 rounded-full ring-2 transition-all " +
                    (form.hue === h
                      ? "ring-foreground scale-110"
                      : "ring-transparent hover:scale-105")
                  }
                  style={{ background: `var(--swatch-${h}, currentColor)` }}
                  aria-label={h}
                >
                  <span className={`block size-full rounded-full bg-${h}-400`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ResourcePicker — 模板预设 */}
      <ResourcePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        title="选一个模板"
        items={templateItems}
        selectedIds={
          startPoint === "template" ? [form.templateId.replace("template:", "")] : []
        }
        loading={templatesLoading}
        multi={false}
        placeholder="搜索模板名或人格…"
        confirmText="用这个模板"
        onConfirm={(picked) => {
          if (picked.length === 0) return;
          const a = templates.find((t) => t.id === picked[0].id);
          if (a) applyAgent(a, "template");
        }}
      />

      {/* ResourcePicker — 复制现有 */}
      <ResourcePicker
        open={copyPickerOpen}
        onOpenChange={setCopyPickerOpen}
        title="选一个员工复制"
        items={instanceItems}
        selectedIds={
          startPoint === "clone" ? [form.templateId.replace("clone:", "")] : []
        }
        loading={instancesLoading}
        multi={false}
        placeholder="搜索员工名或角色…"
        confirmText="复制配置"
        onConfirm={(picked) => {
          if (picked.length === 0) return;
          const a = instances.find((t) => t.id === picked[0].id);
          if (a) applyAgent(a, "clone");
        }}
      />
    </div>
  );
}

function Label({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <span
      className={
        inline
          ? "text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45"
          : "block text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45"
      }
    >
      {children}
    </span>
  );
}

// R25 起点选择大卡片 — 三选一视觉(走通版,点击即触发对应流程)
function StartPointCard({
  active,
  onClick,
  badge,
  title,
  desc,
  glyph,
  hue,
}: {
  active: boolean;
  onClick: () => void;
  badge: string;
  title: string;
  desc: string;
  glyph: string;
  hue: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex w-full items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition-all " +
        (active
          ? "bg-foreground/[0.04] ring-foreground/40 shadow-sm"
          : "bg-background ring-border hover:ring-foreground/30 hover:bg-muted/40")
      }
      data-testid={`startpoint-${badge}`}
    >
      <span
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[15px] font-semibold bg-${hue}-100 dark:bg-${hue}-900/40 text-${hue}-700 dark:text-${hue}-300 ring-1 ring-${hue}-500/30`}
      >
        {glyph}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/45">
            {badge}
          </span>
        </div>
        <div className="mt-0.5 text-[14px] font-semibold tracking-tight">{title}</div>
        <div className="mt-1 text-[12px] leading-snug text-foreground/60">{desc}</div>
      </div>
    </button>
  );
}

