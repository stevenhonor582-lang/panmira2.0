"use client";

/**
 * R13-B 通用编辑组件 — 7 tab 共用。
 * R24: 统一保存按钮 — EditPane 顶部右侧管理 编辑/保存/取消,tab 内容不再放 EditBar。
 *
 * 设计:
 * - <EditPane> 包装一个 tab 区块,提供 编辑/保存/取消 统一按钮 + 乐观更新
 * - 字段组件:EditableText / EditableTextarea / EditableSelect
 * - 列表组件:ChipListEditor(增删 chip) / IronLawsEditor(增删改排序 textarea)
 *
 * 保存策略:本地 draft → onSave(diff) → ctx.save(PATCH) → 成功后 reload() → 失败回滚
 */

import * as React from "react";
import { Pencil, Check, X, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResourcePicker,
  type ResourceItem,
} from "@/components/resource-picker/resource-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateAgent,
  type Agent,
} from "../../_lib/data";

// ── EditPane: 包一层 state ─────────────────────────────────────

export interface EditPaneProps {
  id: string;
  /** 当前任意标识,用于日志 */
  label: string;
  /** 子节点用 useEditContext 读 draft/setDraft */
  children: (ctx: EditCtx) => React.ReactNode;
  /** 保存完回调(让父组件 reload) */
  onSaved?: () => void;
  /** 是否禁用编辑(member 只读) */
  readOnly?: boolean;
  /** R24: 保存回调 — tab 内做 diff + ctx.save,返回后 EditPane 自动退出编辑态 */
  onSave?: (ctx: EditCtx) => Promise<void>;
  /** R24: 是否有改动 — 控制 保存按钮 disabled */
  isDirty?: boolean;
}

export interface EditCtx {
  editing: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  saving: boolean;
  error: string | null;
}

const EditCtxCtx = React.createContext<EditCtx | null>(null);

export function useEditContext(): EditCtx | null {
  return React.useContext(EditCtxCtx);
}

export function EditPane({ id, label, children, onSaved, readOnly, onSave, isDirty }: EditPaneProps) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ctx: EditCtx = React.useMemo(() => ({
    editing,
    startEdit: () => { setError(null); setEditing(true); },
    cancelEdit: () => { setError(null); setEditing(false); },
    save: async (patch) => {
      setSaving(true);
      setError(null);
      try {
        await updateAgent(id, patch);
        setEditing(false);
        onSaved?.();
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return false;
      } finally {
        setSaving(false);
      }
    },
    saving,
    error,
  }), [editing, saving, error, id, onSaved]);

  const handleSaveClick = React.useCallback(async () => {
    if (!onSave) return;
    await onSave(ctx);
  }, [onSave, ctx]);

  return (
    <div className="relative">
      {!readOnly && (
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1">
          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={ctx.startEdit}
              className="gap-1 text-[12px] text-foreground/55 hover:text-foreground"
              data-testid={`edit-${label}`}
              aria-label={`编辑 ${label}`}
            >
              <Pencil className="size-3.5" />
              <span>编辑</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveClick}
                disabled={saving || !isDirty}
                className="gap-1.5 text-[12px]"
                data-testid={`save-${label}`}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={ctx.cancelEdit}
                disabled={saving}
                className="gap-1.5 text-[12px]"
              >
                <X className="size-3.5" />
                取消
              </Button>
            </>
          )}
        </div>
      )}
      <EditCtxCtx.Provider value={ctx}>
        {children(ctx)}
      </EditCtxCtx.Provider>
      {error && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          保存失败: {error}
        </div>
      )}
    </div>
  );
}

// ── 字段组件 ────────────────────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
      <span>{label}</span>
      {hint && <span className="normal-case tracking-normal text-foreground/30">· {hint}</span>}
    </div>
  );
}

/** 编辑模式下用的文本输入(显示态由父组件渲染) */
export function EditableText({
  label,
  value,
  editing,
  draft,
  setDraft,
  field,
  placeholder,
  maxLength,
  mono = false,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  field: string;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
  hint?: string;
}) {
  if (!editing) {
    return (
      <div>
        <FieldLabel label={label} hint={hint} />
        <div className={`text-[14.5px] text-foreground/85 ${mono ? "font-mono text-[13px]" : ""}`}>
          {value ?? <span className="text-foreground/40">—</span>}
        </div>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <Input
        type="text"
        value={(draft[field] as string | number | undefined)?.toString() ?? ""}
        onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
        placeholder={placeholder}
        maxLength={maxLength}
        className={mono ? "font-mono text-[13px]" : ""}
        data-testid={`field-${field}`}
      />
    </div>
  );
}

export function EditableTextarea({
  label,
  value,
  editing,
  draft,
  setDraft,
  field,
  placeholder,
  rows = 4,
  fullscreen = false,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  field: string;
  placeholder?: string;
  rows?: number;
  fullscreen?: boolean;
  /** R24: 查看态是否用 mono pre 卡片样式(长文本/代码);默认 false 用普通文本 */
  mono?: boolean;
}) {
  const [zoom, setZoom] = React.useState(false);
  if (!editing) {
    if (mono) {
      return (
        <div>
          <FieldLabel label={label} />
          <pre className="whitespace-pre-wrap rounded-2xl bg-card p-6 font-mono text-[13px] leading-relaxed text-foreground/85 ring-1 ring-border">
{typeof value === "string" && value ? value : <span className="text-foreground/40">—</span>}
          </pre>
        </div>
      );
    }
    return (
      <div>
        <FieldLabel label={label} />
        <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">
          {value ?? <span className="text-foreground/40">—</span>}
        </div>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel label={label} />
      <div className="relative">
        <textarea
          value={(draft[field] as string | undefined) ?? ""}
          onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          data-testid={`field-${field}`}
        />
        {fullscreen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1.5 text-[11px]"
            onClick={() => setZoom(true)}
          >
            全屏
          </Button>
        )}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-mono uppercase tracking-[0.2em] text-foreground/55">
              {label}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setZoom(false)}>
              关闭
            </Button>
          </div>
          <textarea
            autoFocus
            value={(draft[field] as string | undefined) ?? ""}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            className="flex-1 w-full resize-none rounded-lg border border-input bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none focus-visible:border-ring dark:bg-input/30"
            data-testid={`field-${field}-fullscreen`}
          />
        </div>
      )}
    </div>
  );
}

export function EditableSelect<T extends string>({
  label,
  value,
  editing,
  draft,
  setDraft,
  field,
  options,
  render,
}: {
  label: string;
  value: React.ReactNode;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  field: string;
  options: { value: T; label: string }[];
  render?: (v: T) => React.ReactNode;
}) {
  const current = (draft[field] as T | undefined) ?? (value as T);
  if (!editing) {
    return (
      <div>
        <FieldLabel label={label} />
        <div className="text-[14.5px] text-foreground/85">
          {value === undefined || value === null || value === "" ? (
            <span className="text-foreground/40">—</span>
          ) : render ? (
            render(value as T)
          ) : (
            value
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel label={label} />
      <Select value={current} onValueChange={(v) => setDraft({ ...draft, [field]: v })}>
        <SelectTrigger className="h-9 w-full text-[13px]" data-testid={`field-${field}`}>
          <SelectValue placeholder="选择…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── 列表编辑 ──────────────────────────────────────────────────

/** chip 列表编辑器:capabilities / tools / skills / knowledge_folders 复用 */
export function ChipListEditor({
  label,
  items,
  editing,
  draft,
  setDraft,
  field,
  placeholder = "新增一项,回车添加",
  renderItem,
  pickerConfig,
}: {
  label: string;
  items: string[];
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  field: string;
  placeholder?: string;
  /** R24: 自定义 chip 渲染(用于 skills 显示描述) */
  renderItem?: (item: string) => React.ReactNode;
  /** R25: 可选 — 提供 pickerConfig 时,显示"从库选"按钮,弹出 ResourcePicker */
  pickerConfig?: {
    title: string;
    items: ResourceItem[];
    loading?: boolean;
    placeholder?: string;
  };
}) {
  const list: string[] = editing
    ? Array.isArray(draft[field]) ? (draft[field] as string[]) : items
    : items;
  const [input, setInput] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (list.includes(t)) return;
    setDraft({ ...draft, [field]: [...list, t] });
    setInput("");
  };
  const remove = (v: string) => {
    setDraft({ ...draft, [field]: list.filter((x) => x !== v) });
  };

  // R25: 从库选 — 合并去重
  const mergePicked = (picked: ResourceItem[]) => {
    const ids = picked.map((p) => p.id);
    const merged = Array.from(new Set([...list, ...ids]));
    setDraft({ ...draft, [field]: merged });
  };

  return (
    <div>
      <FieldLabel label={label} hint={`${list.length} 项`} />
      {editing && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(input);
              }
            }}
            placeholder={placeholder}
            className="text-[13px] flex-1 min-w-[160px]"
            data-testid={`field-${field}-input`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add(input)}
            className="gap-1 text-[12px]"
            data-testid={`field-${field}-add`}
          >
            <Plus className="size-3.5" /> 添加
          </Button>
          {pickerConfig && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="gap-1 text-[12px]"
              data-testid={`field-${field}-picker`}
            >
              <Library className="size-3.5" /> 从库选
            </Button>
          )}
        </div>
      )}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-foreground/45">
          {editing ? "暂无项,输入后回车添加" : "尚未配置"}
        </div>
      ) : (
        <ul className={editing ? "flex flex-col gap-1.5" : "flex flex-wrap gap-1.5"}>
          {list.map((item) => (
            <li
              key={item}
              className={editing
                ? "inline-flex items-center justify-between gap-1.5 rounded-lg bg-card px-2.5 py-1 font-mono text-[12px] ring-1 ring-border"
                : "inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 font-mono text-[12px] ring-1 ring-border"
              }
              data-testid={`chip-${field}-${item}`}
            >
              {renderItem ? renderItem(item) : <span>{item}</span>}
              {editing && (
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="text-foreground/40 hover:text-destructive"
                  aria-label={`删除 ${item}`}
                  data-testid={`chip-${field}-${item}-del`}
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pickerConfig && (
        <ResourcePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={pickerConfig.title}
          items={pickerConfig.items}
          selectedIds={list}
          loading={pickerConfig.loading}
          multi
          placeholder={pickerConfig.placeholder ?? "搜索…"}
          onConfirm={mergePicked}
        />
      )}
    </div>
  );
}

/** Iron Laws 编辑器:可增删改排序,每条是 textarea */
export function IronLawsEditor({
  label,
  items,
  editing,
  draft,
  setDraft,
  field,
}: {
  label: string;
  items: string[];
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  field: string;
}) {
  const list: string[] = editing
    ? Array.isArray(draft[field]) ? (draft[field] as string[]) : items
    : items;

  const setItem = (i: number, v: string) => {
    const next = list.slice();
    next[i] = v;
    setDraft({ ...draft, [field]: next });
  };
  const remove = (i: number) => {
    setDraft({ ...draft, [field]: list.filter((_, idx) => idx !== i) });
  };
  const add = () => {
    setDraft({ ...draft, [field]: [...list, ""] });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, [field]: next });
  };

  return (
    <div>
      <FieldLabel label={label} hint={`${list.length} 条`} />
      {list.length === 0 && !editing ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-foreground/45">
          这位 bot 还没设铁律
        </div>
      ) : (
        <ol className="space-y-2">
          {list.map((law, i) => (
            <li key={i} className="rounded-2xl bg-card p-3 ring-1 ring-border">
              <div className="flex items-start gap-2">
                <span className="mt-2 font-mono text-[10.5px] tabular-nums text-foreground/35">
                  {(i + 1).toString().padStart(2, "0")}
                </span>
                {editing ? (
                  <textarea
                    value={law}
                    onChange={(e) => setItem(i, e.target.value)}
                    rows={2}
                    className="flex-1 resize-y rounded-md border border-input bg-transparent px-2 py-1 text-[13px] leading-relaxed outline-none focus-visible:border-ring dark:bg-input/30"
                    data-testid={`ironlaw-${i}`}
                  />
                ) : (
                  <p className="flex-1 text-[14px] leading-relaxed text-foreground/90">{law}</p>
                )}
                {editing && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-foreground/40 hover:text-foreground disabled:opacity-30"
                      aria-label="上移"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === list.length - 1}
                      className="text-foreground/40 hover:text-foreground disabled:opacity-30"
                      aria-label="下移"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="text-foreground/40 hover:text-destructive"
                      aria-label="删除"
                      data-testid={`ironlaw-${i}-del`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="mt-2 gap-1 text-[12px]"
          data-testid={`ironlaw-add`}
        >
          <Plus className="size-3.5" /> 加一条铁律
        </Button>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────

/** 把 Agent 对象的若干字段提取为 snake_case patch draft(后端要 snake) */
export function agentToDraft(agent: Agent, fields: string[]): Record<string, unknown> {
  const raw = agent.raw ?? {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in raw) {
      out[f] = raw[f];
    } else if (f === "persona") {
      out[f] = agent.persona;
    } else if (f === "system_prompt") {
      out[f] = agent.systemPrompt;
    } else if (f === "complexity_level") {
      out[f] = agent.complexityLevel;
    } else if (f === "default_engine") {
      out[f] = agent.defaultEngine;
    } else if (f === "default_model") {
      out[f] = agent.defaultModel;
    } else if (f === "default_context_window") {
      out[f] = agent.defaultContextWindow;
    } else if (f === "default_max_turns") {
      out[f] = agent.defaultMaxTurns;
    } else if (f === "template_type") {
      out[f] = agent.templateType;
    } else if (f === "engine") {
      out[f] = agent.engine;
    } else if (f === "status") {
      out[f] = agent.status;
    } else if (f === "name") {
      out[f] = agent.name;
    } else if (f === "description") {
      out[f] = agent.description;
    } else if (f === "role_template") {
      out[f] = agent.role;
    } else if (f === "category") {
      out[f] = (raw as any).category ?? "general";
    } else if (f === "capabilities") {
      out[f] = agent.skills;
    } else if (f === "tools") {
      out[f] = agent.tools;
    } else if (f === "skills") {
      out[f] = agent.raw && Array.isArray((raw as any).skills) ? (raw as any).skills : [];
    } else if (f === "iron_laws") {
      out[f] = agent.ironLaws;
    } else if (f === "knowledge_folders") {
      out[f] = agent.knowledgeFolders;
    } else if (f === "owner_user_id") {
      out[f] = (raw as any).owner_user_id ?? agent.ownerId ?? "";
    } else if (f === "visibility") {
      out[f] = agent.visibility ?? "team";
    } else if (f === "channel_ids") {
      out[f] = Array.isArray(agent.channelIds) ? agent.channelIds : [];
    } else if (f === "working_dir") {
      out[f] = agent.workingDir ?? null;
    }
  }
  return out;
}

/** 把 draft 的字段 diff 出真实变更(避免发空字段覆盖)。 */
export function diffDraft(
  original: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(draft)) {
    const a = JSON.stringify(original[k] ?? null);
    const b = JSON.stringify(draft[k] ?? null);
    if (a !== b) patch[k] = draft[k];
  }
  return patch;
}
