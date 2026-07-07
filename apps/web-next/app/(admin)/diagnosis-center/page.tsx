"use client";

import { useState, useMemo, type KeyboardEvent } from "react";
import { Search, Loader2, AlertTriangle, Filter, X, RefreshCw, FileSearch, Database, ListTree } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

interface AlertItem { id: string; type: string; bot_name: string; error_message?: string; created_at: string | number; }
interface DiagnoseEvent { id: string; type: string; bot_name?: string; timestamp?: string | number; prompt?: string; response_preview?: string; error_message?: string; }
interface DiagnoseResult { found: number; session?: Record<string, unknown>; events?: DiagnoseEvent[]; }

const TYPE_BADGE: Record<string, { tone: "default" | "destructive" | "secondary"; label: string }> = {
  task_failed: { tone: "destructive", label: "task_failed" },
  error: { tone: "destructive", label: "error" },
};

function formatTs(ms: string | number): string {
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!n) return "—";
  return new Date(n).toLocaleString("zh-CN");
}

export default function DiagnosisCenterPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FileSearch className="size-5 text-muted-foreground" />
          诊断中心
        </h2>
        <p className="text-sm text-muted-foreground">告警监控 + 异常诊断排查 — 一个入口查全部</p>
      </header>

      <Tabs defaultValue="alerts" className="space-y-5">
        <TabsList>
          <TabsTrigger value="alerts" className="gap-1.5"><AlertTriangle className="size-3.5" />告警监控</TabsTrigger>
          <TabsTrigger value="diagnose" className="gap-1.5"><FileSearch className="size-3.5" />异常诊断</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
        <TabsContent value="diagnose"><DiagnoseTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AlertsTab() {
  const [botFilter, setBotFilter] = useState<string>("__all__");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const { data: alerts = [], loading, refresh, nextIn } = usePolling<AlertItem[]>({
    fetcher: async () => {
      const r = await api<{ alerts: AlertItem[] }>("/api/v2/admin/alerts");
      return r.alerts ?? [];
    },
    intervalMs: 60000,
  });
  const bots = useMemo(() => Array.from(new Set((alerts ?? []).map((a) => a.bot_name))).sort(), [alerts]);
  const filtered = useMemo(() => (alerts ?? []).filter((a) => {
    if (botFilter !== "__all__" && a.bot_name !== botFilter) return false;
    if (typeFilter !== "__all__" && a.type !== typeFilter) return false;
    return true;
  }), [alerts, botFilter, typeFilter]);
  const reset = () => { setBotFilter("__all__"); setTypeFilter("__all__"); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">task_failed + error 事件流 · {(alerts ?? []).length} 条</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">下次 {nextIn}s</span>
          <button onClick={refresh} className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors" aria-label="立即刷新">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Filter className="size-3.5 text-muted-foreground" />过滤</CardTitle><CardDescription>按 bot 或事件类型筛选</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs text-muted-foreground">Bot</label>
            <Select value={botFilter} onValueChange={(v) => v && setBotFilter(v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">全部</SelectItem>{bots.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs text-muted-foreground">类型</label>
            <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}><SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">全部</SelectItem><SelectItem value="task_failed">task_failed</SelectItem><SelectItem value="error">error</SelectItem></SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5"><X className="size-3.5" />清除过滤</Button>
          <p className="ml-auto text-xs text-muted-foreground self-end">显示 {filtered.length} / {(alerts ?? []).length}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">{(alerts ?? []).length === 0 ? "暂无告警 — 系统正常运行" : "没有匹配的告警"}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const badge = TYPE_BADGE[a.type] ?? { tone: "secondary" as const, label: a.type };
            return (
              <Card key={a.id} className="hover:border-rose-500/30 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-md bg-rose-500/10 text-rose-500 grid place-items-center shrink-0"><AlertTriangle className="size-4" /></div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={badge.tone}>{badge.label}</Badge>
                        <span className="font-medium text-sm">{a.bot_name}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatTs(a.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono break-all">{a.error_message}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">id: {a.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiagnoseTab() {
  const [taskId, setTaskId] = useState("");
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!taskId.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api<DiagnoseResult>(`/api/v2/admin/diagnose/${encodeURIComponent(taskId.trim())}`);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally { setLoading(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") search(); };
  const fmt = (v: unknown) => { if (v === null || v === undefined) return "—"; if (typeof v === "string" || typeof v === "number") return String(v); return JSON.stringify(v); };
  const fmtTs = (ms: string | number | undefined): string => { if (ms === undefined || ms === null) return "—"; const n = typeof ms === "string" ? Number(ms) : ms; if (!n) return "—"; return new Date(n).toLocaleString("zh-CN"); };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">输入 task id / chat id / bot name — 查 session + events 时间线</p>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">查询</CardTitle><CardDescription>支持 task id(完整 / 前 8 位)、chat id、bot name</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} onKeyDown={onKey} placeholder="如:17ed95c6 或 bot name '得一'" autoFocus />
          <Button onClick={search} disabled={loading || !taskId.trim()} className="gap-1.5">{loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}诊断</Button>
        </CardContent>
      </Card>
      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" /></div>}
      {result && !loading && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={result.found > 0 ? "default" : "secondary"}>found: {result.found}</Badge>
                <span className="text-sm text-muted-foreground">session: <strong className="text-foreground">{result.session ? 1 : 0}</strong>· events: <strong className="text-foreground">{result.events?.length ?? 0}</strong></span>
              </div>
            </CardContent>
          </Card>
          {result.session && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Database className="size-4 text-muted-foreground" />Session 详情</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {Object.entries(result.session).filter(([k]) => !["id", "session_id", "session_id_engine"].includes(k)).slice(0, 16).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1">
                      <dt className="text-xs text-muted-foreground font-mono shrink-0">{k}</dt>
                      <dd className="text-xs font-mono text-right truncate max-w-[300px]" title={fmt(v)}>{fmt(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
          {result.events && result.events.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ListTree className="size-4 text-muted-foreground" />事件时间线 ({result.events.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.events.map((e, i) => (
                    <div key={`${e.id}-${i}`} className="rounded-md border border-border bg-card p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={e.error_message ? "destructive" : "secondary"}>{e.type}</Badge>
                        <span className="text-sm font-medium">{e.bot_name ?? "—"}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTs(e.timestamp)}</span>
                      </div>
                      {e.prompt && <p className="text-xs text-muted-foreground line-clamp-2"><span className="text-[10px] uppercase tracking-wider mr-1">prompt</span>{e.prompt}</p>}
                      {e.response_preview && <p className="text-xs line-clamp-3"><span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">response</span>{e.response_preview}</p>}
                      {e.error_message && <p className="text-xs text-destructive font-mono break-all">{e.error_message}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {!result && !loading && !error && <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">输入 task id / bot name 开始诊断</CardContent></Card>}
    </div>
  );
}
