"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/channels/status-pill";
import {
  SettingsPageShell,
  SettingsMeta,
} from "@/components/settings/settings-shell";
import {
  Sliders,
  Trash2,
  Download,
  TerminalSquare,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Server,
  Hash,
  Clock,
  Eye,
} from "lucide-react";

/**
 * /settings/advanced — power-user surface.
 *
 * All toggles are LOCAL (localStorage). Backend voice_settings / dev_flags
 * tables do not exist yet — explicitly flagged in handoff §遗留.
 *
 * - Reset confirmation is a red destructive modal — never a single-click.
 * - Export downloads a JSON snapshot of all panmira.* localStorage keys
 *   (NOT the access/refresh tokens).
 * - Developer mode unlocks the verbose error panel + WS events log.
 * - System info is static (server version / build hash / uptime) — sourced
 *   from a build-time constant plus page-load time.
 */

const STORAGE_PREFIX = "panmira.";
const DEV_KEY = "panmira.dev.mode.v1";
const VERBOSE_KEY = "panmira.dev.verbose.v1";
const WS_LOG_KEY = "panmira.dev.ws.log.v1";
const BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH ?? "dev-local";

interface ToastItem {
  id: number;
  kind: "ok" | "err";
  message: string;
}

interface WsEvent {
  id: number;
  at: string;
  topic: string;
  payload: string;
}

export default function AdvancedPage() {
  const [devMode, setDevMode] = React.useState(false);
  const [verbose, setVerbose] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [wsEvents, setWsEvents] = React.useState<WsEvent[]>([]);
  const [storageSize, setStorageSize] = React.useState(0);
  const [uptime, setUptime] = React.useState(0);

  const bootAt = React.useRef(Date.now());

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setDevMode(window.localStorage.getItem(DEV_KEY) === "1");
    setVerbose(window.localStorage.getItem(VERBOSE_KEY) === "1");

    function refreshSize() {
      let total = 0;
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const v = window.localStorage.getItem(k) ?? "";
          total += k.length + v.length;
        }
      }
      setStorageSize(total);
    }
    refreshSize();

    function tick() {
      setUptime(Math.floor((Date.now() - bootAt.current) / 1000));
    }
    tick();
    const t = window.setInterval(tick, 1000);

    function onWsEvent(ev: Event) {
      const ce = ev as CustomEvent<{ topic?: string; payload?: unknown }>;
      setWsEvents((arr) =>
        [
          {
            id: Date.now() + Math.random(),
            at: new Date().toISOString(),
            topic: ce.detail?.topic ?? "unknown",
            payload: JSON.stringify(ce.detail?.payload ?? {}).slice(0, 280),
          },
          ...arr,
        ].slice(0, 50),
      );
    }
    window.addEventListener("panmira:ws-event", onWsEvent);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("panmira:ws-event", onWsEvent);
    };
  }, []);

  function toggleDevMode(next: boolean) {
    setDevMode(next);
    if (typeof window !== "undefined") {
      if (next) window.localStorage.setItem(DEV_KEY, "1");
      else window.localStorage.removeItem(DEV_KEY);
    }
    pushToast("ok", `开发者模式 ${next ? "已开启" : "已关闭"}`);
  }

  function toggleVerbose(next: boolean) {
    setVerbose(next);
    if (typeof window !== "undefined") {
      if (next) window.localStorage.setItem(VERBOSE_KEY, "1");
      else window.localStorage.removeItem(VERBOSE_KEY);
    }
  }

  function pushToast(kind: ToastItem["kind"], message: string) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  function doReset() {
    setResetting(true);
    try {
      if (typeof window === "undefined") return;
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
      }
      // IMPORTANT: preserve auth tokens. Caller will re-login otherwise.
      const preserve = ["panmira.token", "panmira.refresh", "panmira.user"];
      for (const k of toRemove) {
        if (preserve.includes(k)) continue;
        window.localStorage.removeItem(k);
      }
      pushToast("ok", `已清除 ${toRemove.length - preserve.length} 项本地偏好`);
      setResetOpen(false);
    } finally {
      setResetting(false);
    }
  }

  function exportData() {
    if (typeof window === "undefined") return;
    const snapshot: Record<string, string> = {};
    const sensitive = ["panmira.token", "panmira.refresh", "panmira.user"];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && !sensitive.includes(k)) {
        snapshot[k] = window.localStorage.getItem(k) ?? "";
      }
    }
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), snapshot }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `panmira-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast("ok", `已导出 ${Object.keys(snapshot).length} 项偏好`);
  }

  function fmtUptime(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  return (
    <>
      <SettingsPageShell
        meta={
          <SettingsMeta
            items={[
              { label: "dev_mode", value: devMode ? "on" : "off" },
              { label: "verbose", value: verbose ? "on" : "off" },
              { label: "ls_keys", value: "panmira.*" },
              { label: "ls_size", value: `${(storageSize / 1024).toFixed(2)} kb` },
              { label: "build", value: <span className="font-mono">{BUILD_HASH.slice(0, 10)}</span> },
              { label: "uptime", value: fmtUptime(uptime) },
            ]}
            footnote={
              <>
                所有 toggle 仅作用于本地 <code className="font-mono">localStorage</code>。
                重置 = 删除所有 <code className="font-mono">panmira.*</code> 键,
                但保留 token / refresh / user(auth 关键三件)。
                导出 = JSON 快照(已剔除敏感字段)。
              </>
            }
          />
        }
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">高级</h2>
              <span className="text-[11px] text-muted-foreground font-mono">
                dev · 内部开关
              </span>
            </div>
            <div className="flex items-center gap-2">
              {devMode ? (
                <StatusPill tone="warn" label="DEV MODE" />
              ) : (
                <StatusPill tone="muted" label="PROD-LIKE" />
              )}
            </div>
          </>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Toggles card */}
          <div className="ring-1 ring-border rounded-sm bg-card/40">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                toggles · local
              </div>
            </div>
            <div className="p-3 grid gap-3">
              <ToggleRow
                icon={<TerminalSquare className="size-3.5" />}
                label="开发者模式"
                desc="开启后展示原始错误、WS 事件流、内部标记。"
                value={devMode}
                onChange={toggleDevMode}
              />
              <ToggleRow
                icon={<Activity className="size-3.5" />}
                label="详细错误日志"
                desc="console 打印完整堆栈与请求头。仅 dev_mode 下生效。"
                value={verbose}
                onChange={toggleVerbose}
                disabled={!devMode}
              />
            </div>
          </div>

          {/* Danger zone */}
          <div className="ring-1 ring-rose-500/30 rounded-sm bg-rose-500/[0.04]">
            <div className="px-3 py-2 border-b border-rose-500/30 flex items-center gap-2">
              <ShieldAlert className="size-3.5 text-rose-600 dark:text-rose-300" />
              <div className="text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300 font-mono">
                danger zone
              </div>
            </div>
            <div className="p-3 grid gap-3">
              <div className="text-[11.5px] text-muted-foreground leading-snug">
                重置会清除所有 <code className="font-mono">panmira.*</code>{" "}
                本地偏好(主题、布局、缓存)。auth 三件套(
                <code className="font-mono">token</code> /{" "}
                <code className="font-mono">refresh</code> /{" "}
                <code className="font-mono">user</code>
                )保留,不会被强制登出。
              </div>
              <Button
                variant="destructive"
                className="gap-1.5"
                onClick={() => setResetOpen(true)}
              >
                <Trash2 className="size-3.5" />
                重置确认 · 清除所有 panmira.* localStorage
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={exportData}
              >
                <Download className="size-3.5" />
                导出数据 (JSON)
              </Button>
            </div>
          </div>
        </div>

        {/* System info */}
        <div className="mt-4 ring-1 ring-border rounded-sm bg-card/40">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              system info
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
            <InfoCell icon={<Server className="size-3.5" />} label="server version" value="0.1.0" />
            <InfoCell icon={<Hash className="size-3.5" />} label="build hash" value={BUILD_HASH} mono />
            <InfoCell icon={<Hash className="size-3.5" />} label="db version" value="P6-A1" />
            <InfoCell icon={<Clock className="size-3.5" />} label="uptime (session)" value={fmtUptime(uptime)} />
          </div>
        </div>

        {/* Dev panels (gated by dev_mode) */}
        {devMode && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="ring-1 ring-amber-500/30 rounded-sm bg-amber-500/[0.04]">
              <div className="px-3 py-2 border-b border-amber-500/30 flex items-center gap-2">
                <Eye className="size-3.5 text-amber-700 dark:text-amber-300" />
                <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 font-mono">
                  internal error log · verbose
                </div>
              </div>
              <div className="p-3">
                <div className="text-[11.5px] text-muted-foreground mb-2 leading-snug">
                  {verbose
                    ? "开启中 — 浏览器 console 会打印完整堆栈与请求头。"
                    : "关闭 — 仅 console.error 摘要。"}
                </div>
                <div className="rounded-sm ring-1 ring-border bg-card/60 p-2 font-mono text-[11px] leading-relaxed max-h-48 overflow-auto">
                  <div className="text-muted-foreground">[boot] panmira web-next</div>
                  <div className="text-muted-foreground">[boot] dev_mode active</div>
                  <div className="text-muted-foreground">[boot] localStorage keys: {typeof window !== "undefined" ? window.localStorage.length : 0}</div>
                  <div className="text-muted-foreground">[boot] build = {BUILD_HASH}</div>
                </div>
              </div>
            </div>

            <div className="ring-1 ring-amber-500/30 rounded-sm bg-amber-500/[0.04]">
              <div className="px-3 py-2 border-b border-amber-500/30 flex items-center gap-2">
                <Activity className="size-3.5 text-amber-700 dark:text-amber-300" />
                <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 font-mono">
                  ws events · last 50
                </div>
              </div>
              <div className="p-3 max-h-72 overflow-auto">
                {wsEvents.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground font-mono">
                    no events yet · dispatch one via{" "}
                    <code>window.dispatchEvent(new CustomEvent("panmira:ws-event", ...))</code>
                  </div>
                ) : (
                  <ul className="grid gap-1.5">
                    {wsEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className="text-[11px] font-mono leading-snug"
                      >
                        <span className="text-muted-foreground">
                          {new Date(ev.at).toLocaleTimeString("zh-CN", {
                            hour12: false,
                          })}
                        </span>
                        <span className="mx-1.5 text-amber-700 dark:text-amber-300">
                          {ev.topic}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {ev.payload}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </SettingsPageShell>

      {/* Reset confirmation modal */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 size-8 rounded-sm bg-rose-500/10 ring-1 ring-rose-500/30 grid place-items-center text-rose-600 dark:text-rose-300">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base">
                  确认重置本地偏好?
                </DialogTitle>
                <DialogDescription className="text-xs mt-1">
                  将清除所有 <code className="font-mono">panmira.*</code>{" "}
                  localStorage 键。auth token / refresh / user
                  不会被清除(避免强制登出)。此操作不可撤销。
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={resetting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={doReset}
              disabled={resetting}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              {resetting ? "清除中..." : "确认清除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast layer */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto ring-1 rounded-sm px-3 py-2 text-[12px] shadow-md backdrop-blur-sm flex items-start gap-2 ${
              t.kind === "ok"
                ? "bg-emerald-500/[0.08] ring-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/[0.08] ring-rose-500/30 text-rose-700 dark:text-rose-300"
            }`}
          >
            {t.kind === "ok" ? (
              <span className="size-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            ) : (
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            )}
            <span className="max-w-[360px] leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  value,
  onChange,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-sm ring-1 px-3 py-2.5 transition-colors ${
        disabled
          ? "ring-border bg-muted/20 opacity-60"
          : value
            ? "ring-amber-500/40 bg-amber-500/[0.06]"
            : "ring-border bg-card/60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-[12.5px] font-medium">{label}</span>
          {value && (
            <span className="ml-1 text-[10px] font-mono text-amber-700 dark:text-amber-300">
              ON
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {desc}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed ${
          value ? "bg-amber-500" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function InfoCell({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-sm ring-1 ring-border bg-card/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-[12.5px] truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}