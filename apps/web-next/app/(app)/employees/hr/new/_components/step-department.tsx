"use client";

import * as React from "react";
import { Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDepartmentColor } from "@/lib/department-color";
import { getToken } from "@/lib/auth";
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
 * R57 · Step 部门(在「类型」和「人格」之间)
 * ----------------------------------------------------------------
 * 必填,19 系统部门 + 用户自建 custom 部门,GET /api/v2/departments 拉取。
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-[13px] font-medium text-foreground/80">
          所属部门 <span className="text-rose-500">*</span>
        </div>
        <p className="text-[12px] text-foreground/45">
          部门是岗位的属性,用来在岗位库里分类与筛选。19 系统部门 + 你创建的 custom 部门都可挂。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-foreground/50">
          <Loader2 className="size-4 animate-spin" /> 正在载入部门…
        </div>
      ) : err ? (
        <div className="rounded-xl border border-rose-300/60 bg-rose-50/60 px-4 py-3 text-[13px] text-rose-600">
          载入部门失败:{err}
        </div>
      ) : (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="hr-dept-grid"
        >
          {rows.map((d) => {
            const active = form.departmentId === d.id;
            const color = d.color || getDepartmentColor(d.name);
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
                    ? { borderColor: color, boxShadow: `0 6px 18px -10px ${color}55` }
                    : undefined
                }
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                  style={{
                    backgroundColor: `${color}1a`,
                    color,
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
    </div>
  );
}
