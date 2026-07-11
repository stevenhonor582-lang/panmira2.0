"use client";

import * as React from "react";
import { Loader2, Building2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEPARTMENT_COLOR, getDepartmentColor } from "@/lib/department-color";
import { getToken } from "@/lib/auth";
import { useToast } from "@/components/toast/toast-provider";
import type { HrFormState } from "./hr-form";

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface DepartmentRow {
  id: string;
  name: string;
  color: string;
  source: "system" | "custom";
}

/**
 * R65 . Step 部门(在「类型」和「人格」之间)
 * ----------------------------------------------------------------
 * 必填,19 系统部门 + 用户自建 custom 部门,GET /api/v2/departments 拉取。
 * R65:顶部加「新建部门」入口,弹 dialog 新建后自动选中新部门。
 */
export function StepDepartment({
  form,
  patch,
}: {
  form: HrFormState;
  patch: (p: Partial<HrFormState>) => void;
}) {
  const [rows, setRows] = React.useState<DepartmentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // R65 新建部门 dialog state
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string>("#64748b");
  const [submitting, setSubmitting] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v2/departments", {
          method: "GET",
          headers: { ...authHeaders() },
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setErr(data?.error?.message || data?.message || "拉取部门失败");
          return;
        }
        const list: DepartmentRow[] = Array.isArray(data?.data) ? data.data : [];
        setRows(list);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : "网络错误");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // R65 19 色预设(去重,防止"通用"和"其它"重复)
  const presetColors = React.useMemo(
    () => Object.values(DEPARTMENT_COLOR).filter((c, i, arr) => arr.indexOf(c) === i),
    [],
  );

  const closeDialog = React.useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setName("");
    setColor("#64748b");
  }, [submitting]);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v2/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error?.message || data?.message || "新建部门失败");
        return;
      }
      const newDept: DepartmentRow = (data?.data ?? {
        id: data?.id ?? "",
        name: trimmed,
        color,
        source: "custom",
      }) as DepartmentRow;
      setRows((prev) => [...prev, newDept]);
      patch({ departmentId: newDept.id }); // 自动选中新部门
      toast.success(`已新建部门「${trimmed}」`);
      closeDialog();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-foreground/80">
            所属部门 <span className="text-rose-500">*</span>
          </div>
          <p className="text-[12px] text-foreground/45">
            部门是岗位的属性,用来在岗位库里分类与筛选。
            已有 <span className="font-mono text-foreground/70">{rows.length}</span> 个部门可选,
            也可以新建一个。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="hr-step-dept-new"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> 新建部门
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-foreground/50">
          <Loader2 className="size-4 animate-spin" /> 正在载入部门…
        </div>
      ) : err ? (
        <div className="rounded-xl border border-rose-300/60 bg-rose-50/60 px-4 py-3 text-[13px] text-rose-600">
          载入部门失败:{err}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-[13px] text-foreground/55">
          暂无部门。点右上「新建部门」创建一个。
        </div>
      ) : (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="hr-dept-grid"
        >
          {rows.map((d) => {
            const active = form.departmentId === d.id;
            const c = d.color || getDepartmentColor(d.name);
            return (
              <button
                key={d.id}
                type="button"
                data-testid={`hr-dept-${d.id}`}
                onClick={() => patch({ departmentId: d.id })}
                className={cn(
                  "group relative flex items-center gap-3 rounded-2xl border-2 bg-card p-4 text-left transition-all",
                  active
                    ? "border-foreground shadow-sm"
                    : "border-border hover:border-foreground/30 hover:bg-foreground/[0.02]",
                )}
                style={
                  active
                    ? { borderColor: c, boxShadow: `0 6px 18px -10px ${c}55` }
                    : undefined
                }
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                  style={{
                    backgroundColor: `${c}1a`,
                    color: c,
                  }}
                >
                  <Building2 className="size-4" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold tracking-tight">{d.name}</span>
                  <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
                    {d.source === "system" ? "系统部门" : "自定义"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 选中态预览 */}
      {form.departmentId && (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-[12.5px] text-foreground/70">
          当前已选部门 ID:
          <code className="ml-1.5 rounded bg-background px-1.5 py-0.5 font-mono text-[11.5px] text-foreground/85">
            {form.departmentId}
          </code>
        </div>
      )}

      {/* R65 . 新建部门 Dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          data-testid="hr-step-dept-dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
                  <Building2 className="size-3" /> 新建部门
                </div>
                <h2 className="text-lg font-semibold tracking-tight">新建一个部门</h2>
                <p className="text-[12px] text-foreground/55">
                  部门用于把岗位归类。颜色用于卡片描边和左上角 icon。
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="关闭"
                disabled={submitting}
                className="rounded-md p-1 text-foreground/50 transition-colors hover:bg-foreground/5 disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <label
                  htmlFor="hr-dept-new-name"
                  className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55"
                >
                  部门名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="hr-dept-new-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !submitting) onCreate();
                  }}
                  placeholder="例如:前端工程"
                  maxLength={50}
                  autoFocus
                  data-testid="hr-step-dept-name"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-1 focus:ring-foreground/40"
                />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                  部门颜色
                </div>
                <div className="flex flex-wrap gap-2">
                  {presetColors.map((c) => {
                    const active = color.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`选择颜色 ${c}`}
                        data-testid={`hr-step-dept-color-${c}`}
                        className={cn(
                          "size-7 rounded-full ring-2 transition-all",
                          active
                            ? "scale-110 ring-foreground"
                            : "ring-transparent hover:ring-foreground/30",
                        )}
                        style={{ background: c }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 px-6 py-3">
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                data-testid="hr-step-dept-cancel"
                className="rounded-md px-4 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-muted disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onCreate}
                disabled={submitting || !name.trim()}
                data-testid="hr-step-dept-submit"
                className="rounded-md bg-foreground px-4 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? "提交中…" : "新建部门"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
