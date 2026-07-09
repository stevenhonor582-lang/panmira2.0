"use client";

/**
 * 全局命令面板 (Cmd+K / Ctrl+K)
 * ============================================================================
 * 功能:
 *  - Cmd+K(Mac)/ Ctrl+K(Windows)全局唤出
 *  - 模糊搜索:
 *    * 页面跳转(来自 sidebar NAV_GROUPS)
 *    * 数字员工(/api/v2/employees)
 *    * 真人(/api/auth/users)
 *    * 任务(/api/v2/admin/pipelines)
 *  - 快捷操作:新建员工/任务、切换主题、退出登录
 *  - 键盘导航(↑↓选择 / Enter 确认 / Esc 关闭)
 *
 * 通讯:
 *  - 全局 keydown 监听 Cmd/Ctrl+K
 *  - 监听 window 事件 'panmira:command-palette-open'(供 topbar 按钮触发)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Search,
  CornerDownLeft,
  Plus,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Bot,
  User,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS } from "@/components/layout/sidebar";
import { logout } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: string;
  keywords?: string;
  onSelect: () => void;
}

interface AgentResult {
  id: string;
  name?: string;
  display_name?: string;
  description?: string;
}
interface UserResult {
  id: string;
  name?: string;
  email?: string;
}
interface PipelineResult {
  id: string;
  name?: string;
  description?: string;
}

/** 从分页/封装 API 响应中提取数组。 */
function extractList<T>(r: unknown): T[] {
  if (!r || typeof r !== "object") return [];
  const obj = r as { data?: unknown; items?: unknown; users?: unknown };
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (obj.data && typeof obj.data === "object") {
    const inner = (obj.data as { items?: unknown }).items;
    if (Array.isArray(inner)) return inner as T[];
  }
  if (Array.isArray(obj.items)) return obj.items as T[];
  if (Array.isArray(obj.users)) return obj.users as T[];
  if (Array.isArray(r)) return r as T[];
  return [];
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [agents, setAgents] = React.useState<AgentResult[]>([]);
  const [users, setUsers] = React.useState<UserResult[]>([]);
  const [pipelines, setPipelines] = React.useState<PipelineResult[]>([]);

  // 打开时懒加载搜索数据(首次打开后常驻内存)
  const loadedRef = React.useRef(false);
  const loadData = React.useCallback(async () => {
    const results = await Promise.allSettled([
      api("/api/v2/employees?limit=20"),
      api("/api/auth/users"),
      api("/api/v2/admin/pipelines?limit=20"),
    ]);
    if (results[0].status === "fulfilled") {
      setAgents(extractList<AgentResult>(results[0].value));
    }
    if (results[1].status === "fulfilled") {
      setUsers(extractList<UserResult>(results[1].value));
    }
    if (results[2].status === "fulfilled") {
      setPipelines(extractList<PipelineResult>(results[2].value));
    }
  }, []);

  // 全局快捷键 Cmd/Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 监听 topbar 按钮派发的打开事件
  React.useEffect(() => {
    const opener = () => setOpen(true);
    window.addEventListener("panmira:command-palette-open", opener);
    return () => window.removeEventListener("panmira:command-palette-open", opener);
  }, []);

  // 打开/关闭的副作用
  React.useEffect(() => {
    if (open) {
      if (!loadedRef.current) {
        loadedRef.current = true;
        loadData();
      }
    } else {
      setQuery("");
      setActive(0);
    }
  }, [open, loadData]);

  // 构建命令项
  const items = React.useMemo<CmdItem[]>(() => {
    const list: CmdItem[] = [];

    // 页面跳转(来自 sidebar)
    for (const g of NAV_GROUPS) {
      for (const item of g.items) {
        const Icon = item.icon;
        list.push({
          id: `page:${item.href}`,
          label: item.label,
          hint: g.title,
          icon: Icon,
          group: "页面",
          keywords: `${g.title} ${item.label}`,
          onSelect: () => {
            router.push(item.href);
            setOpen(false);
          },
        });
      }
    }

    // 数字员工
    for (const a of agents) {
      const name = a.display_name || a.name || a.id;
      list.push({
        id: `agent:${a.id}`,
        label: name,
        hint: a.description,
        icon: Bot,
        group: "数字员工",
        keywords: `agent bot 数字员工 ${name} ${a.id}`,
        onSelect: () => {
          router.push(`/employees/${a.id}`);
          setOpen(false);
        },
      });
    }

    // 真人
    for (const u of users) {
      const name = u.name || u.id;
      list.push({
        id: `user:${u.id}`,
        label: name,
        hint: u.email,
        icon: User,
        group: "真人",
        keywords: `user person 真人 员工 ${name} ${u.email ?? ""}`,
        onSelect: () => {
          router.push(`/overview/people/${u.id}`);
          setOpen(false);
        },
      });
    }

    // 任务
    for (const p of pipelines) {
      const name = p.name || p.id;
      list.push({
        id: `pipe:${p.id}`,
        label: name,
        hint: p.description,
        icon: ClipboardList,
        group: "任务",
        keywords: `pipeline task 任务 ${name} ${p.id}`,
        onSelect: () => {
          router.push(`/tasks/${p.id}`);
          setOpen(false);
        },
      });
    }

    // 快捷操作
    list.push({
      id: "action:new-employee",
      label: "新建数字员工",
      icon: Plus,
      group: "操作",
      keywords: "new create employee agent 新建",
      onSelect: () => {
        router.push("/employees/new");
        setOpen(false);
      },
    });
    list.push({
      id: "action:new-task",
      label: "新建任务",
      icon: Plus,
      group: "操作",
      keywords: "new create task pipeline 新建",
      onSelect: () => {
        router.push("/tasks/new");
        setOpen(false);
      },
    });
    list.push({
      id: "action:theme-light",
      label: "切换浅色主题",
      icon: Sun,
      group: "操作",
      keywords: "theme light 浅色 主题",
      onSelect: () => {
        setTheme("light");
        setOpen(false);
      },
    });
    list.push({
      id: "action:theme-dark",
      label: "切换深色主题",
      icon: Moon,
      group: "操作",
      keywords: "theme dark 深色 主题",
      onSelect: () => {
        setTheme("dark");
        setOpen(false);
      },
    });
    list.push({
      id: "action:theme-system",
      label: "跟随系统主题",
      icon: Monitor,
      group: "操作",
      keywords: "theme system auto 跟随 系统",
      onSelect: () => {
        setTheme("system");
        setOpen(false);
      },
    });
    list.push({
      id: "action:logout",
      label: "退出登录",
      icon: LogOut,
      group: "操作",
      keywords: "logout signout 退出 登录",
      onSelect: () => {
        setOpen(false);
        logout();
      },
    });

    return list;
  }, [agents, users, pipelines, router, setTheme]);

  // 过滤(子串匹配 + 简单权重)
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.hint ?? ""} ${it.keywords ?? ""} ${it.group}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  // 分组(保持出现顺序)
  const grouped = React.useMemo(() => {
    const map = new Map<string, CmdItem[]>();
    for (const it of filtered) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // 输入变化时重置 active
  React.useEffect(() => {
    setActive(0);
  }, [query]);

  // 键盘导航(面板内)
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[active];
        if (item) item.onSelect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active]);

  if (!open) return null;

  // 展平用于全局 index 计算
  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" />

      {/* panel */}
      <div
        className="relative w-full max-w-xl rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索页面、员工、任务、操作..."
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              没有匹配结果
            </div>
          ) : (
            grouped.map(([group, gItems]) => (
              <div key={group} className="mb-1">
                <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {group}
                </div>
                {gItems.map((it) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  const Icon = it.icon;
                  const isActive = idx === active;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseMove={() => setActive(idx)}
                      onClick={it.onSelect}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{it.label}</div>
                        {it.hint && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {it.hint}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <CornerDownLeft className="size-3 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部提示栏 */}
        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd>
              确认
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border border-border rounded px-1 py-0.5 font-mono">esc</kbd>
              关闭
            </span>
          </div>
          <span>PAMELA 全局命令</span>
        </div>
      </div>
    </div>
  );
}
