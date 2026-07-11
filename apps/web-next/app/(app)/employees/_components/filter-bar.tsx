"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, X, Pencil, Check, XIcon } from "lucide-react";

// R66-A 2.4: 筛选栏改造
// - 保留:模型、状态
// - 删:主理人
// - 改:角色 → 部门
// - 新:工作类型(工程/创意/运营/业务/研究/自定义)
// - 所有展示名称支持编辑(本地 state,会话内有效)
export interface FilterState {
  query: string;
  department: string;  // R66-A 2.4: 改:原 role → department(部门)
  model: string;
  status: string;
  workType: string;     // R66-A 2.4: 新增:工程/创意/运营/业务/研究/自定义
}

// R66-A 2.4: 6 类工作类型(与 hr-library 的 6 类岗位类型一一对应)
export const WORK_TYPES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "engineering", label: "工程" },
  { id: "painting",    label: "创意" },
  { id: "ops",         label: "运营" },
  { id: "business",    label: "业务" },
  { id: "research",    label: "研究" },
  { id: "custom",      label: "自定义" },
];

export const EMPTY_FILTER: FilterState = {
  query: "",
  department: "all",
  model: "all",
  status: "all",
  workType: "all",
};

export function FilterBar({
  value,
  onChange,
  facets,
  resultCount,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  facets: {
    departments: [string, number][];  // R66-A 2.4: 原 roles → departments
    models: [string, number][];
    workTypes: [string, number][];    // R66-A 2.4: 新增:facets 提供的工作类型计数(可空,fallback 静态 6 类)
  };
  resultCount: number;
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: v });

  // R66-A 2.4: 4 个 group label 都可编辑(本地 state,无后端)
  const [editableLabels, setEditableLabels] = React.useState<Record<string, string>>({
    model:      "模型",
    status:     "状态",
    department: "部门",
    workType:   "工作类型",
  });
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [draftLabel, setDraftLabel] = React.useState<string>("");

  const startEdit = (key: string, current: string) => {
    setEditingKey(key);
    setDraftLabel(current);
  };
  const commitEdit = () => {
    if (editingKey && draftLabel.trim()) {
      setEditableLabels((prev) => ({ ...prev, [editingKey]: draftLabel.trim() }));
    }
    setEditingKey(null);
    setDraftLabel("");
  };
  const cancelEdit = () => {
    setEditingKey(null);
    setDraftLabel("");
  };

  // R66-A 2.4: facet.workTypes 为空时使用静态 6 类
  const workTypeFacets: [string, number][] = facets.workTypes && facets.workTypes.length > 0
    ? facets.workTypes
    : WORK_TYPES.map((w) => [w.id, 0] as [string, number]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 p-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-background/80 px-3 py-2 ring-1 ring-border">
          <Search className="size-3.5 text-foreground/40" />
          <input
            type="text"
            value={value.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="按名字 / 部门 / 模型 检索"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
          {value.query && (
            <button
              onClick={() => set("query", "")}
              aria-label="清除检索"
              className="rounded-md p-0.5 text-foreground/40 hover:bg-foreground/5"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Stat label="结果" value={resultCount.toString().padStart(2, "0")} />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-3">
        <EditableGroup
          labelKey="model"
          label={editableLabels.model}
          editingKey={editingKey}
          draftLabel={draftLabel}
          onStartEdit={startEdit}
          onDraftChange={setDraftLabel}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        >
          <Pill active={value.model === "all"} onClick={() => set("model", "all")}>全部</Pill>
          {facets.models.map(([m, n]) => (
            <Pill key={m} active={value.model === m} onClick={() => set("model", m)}>
              {m.split("-").slice(0, 2).join(" ")} · {n}
            </Pill>
          ))}
        </EditableGroup>
        <EditableGroup
          labelKey="status"
          label={editableLabels.status}
          editingKey={editingKey}
          draftLabel={draftLabel}
          onStartEdit={startEdit}
          onDraftChange={setDraftLabel}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        >
          <Pill active={value.status === "all"} onClick={() => set("status", "all")}>全部</Pill>
          {["active", "paused", "draft", "deprecated"].map((s) => (
            <Pill key={s} active={value.status === s} onClick={() => set("status", s)}>
              {s}
            </Pill>
          ))}
        </EditableGroup>
        <EditableGroup
          labelKey="department"
          label={editableLabels.department}
          editingKey={editingKey}
          draftLabel={draftLabel}
          onStartEdit={startEdit}
          onDraftChange={setDraftLabel}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        >
          <Pill active={value.department === "all"} onClick={() => set("department", "all")}>
            全部 {facets.departments.reduce((s, [, n]) => s + n, 0)}
          </Pill>
          {facets.departments.map(([d, n]) => (
            <Pill key={d} active={value.department === d} onClick={() => set("department", d)}>
              {d} · {n}
            </Pill>
          ))}
        </EditableGroup>
        <EditableGroup
          labelKey="workType"
          label={editableLabels.workType}
          editingKey={editingKey}
          draftLabel={draftLabel}
          onStartEdit={startEdit}
          onDraftChange={setDraftLabel}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        >
          <Pill active={value.workType === "all"} onClick={() => set("workType", "all")}>全部</Pill>
          {workTypeFacets.map(([w, n]) => {
            const meta = WORK_TYPES.find((x) => x.id === w);
            const label = meta?.label ?? w;
            return (
              <Pill key={w} active={value.workType === w} onClick={() => set("workType", w)}>
                {label}{typeof n === "number" && n > 0 ? ` · ${n}` : ""}
              </Pill>
            );
          })}
        </EditableGroup>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

// R66-A 2.4: 可编辑 group label — hover 显示铅笔,点 → input,enter/blur 保存,esc 取消
function EditableGroup({
  labelKey, label, editingKey, draftLabel,
  onStartEdit, onDraftChange, onCommit, onCancel,
  children,
}: {
  labelKey: string;
  label: string;
  editingKey: string | null;
  draftLabel: string;
  onStartEdit: (key: string, current: string) => void;
  onDraftChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const isEditing = editingKey === labelKey;
  return (
    <div className="group/edit flex items-center gap-2">
      {isEditing ? (
        <span className="flex items-center gap-1">
          <input
            type="text"
            value={draftLabel}
            autoFocus
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              else if (e.key === "Escape") onCancel();
            }}
            onBlur={onCommit}
            maxLength={12}
            className="w-20 rounded border border-foreground/40 bg-background px-1.5 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground focus:outline-none"
            data-testid={`filter-label-input-${labelKey}`}
          />
          <button onClick={onCommit} aria-label="保存" className="rounded p-0.5 text-foreground/60 hover:bg-foreground/5">
            <Check className="size-3" />
          </button>
          <button onClick={onCancel} aria-label="取消" className="rounded p-0.5 text-foreground/60 hover:bg-foreground/5">
            <XIcon className="size-3" />
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">{label}</span>
          <button
            type="button"
            onClick={() => onStartEdit(labelKey, label)}
            aria-label={`编辑 ${label} 标签`}
            data-testid={`filter-label-edit-${labelKey}`}
            className="rounded p-0.5 text-foreground/30 opacity-0 transition-opacity hover:bg-foreground/5 hover:text-foreground/60 group-hover/edit:opacity-100"
          >
            <Pencil className="size-2.5" />
          </button>
        </span>
      )}
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors ring-1",
        active
          ? "bg-foreground text-background ring-foreground"
          : "bg-background text-foreground/70 ring-border hover:text-foreground hover:ring-foreground/30",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1 rounded-xl bg-background/80 px-3 py-1.5 ring-1 ring-border">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}
