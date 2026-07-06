"use client";

import { useState, type KeyboardEvent } from "react";
import { Search, Loader2, FileSearch, Database, ListTree } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { DiagnoseResult } from "./_components/types";

export default function DiagnosePage() {
  const [taskId, setTaskId] = useState("");
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!taskId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<DiagnoseResult>(
        `/api/v2/admin/diagnose/${encodeURIComponent(taskId.trim())}`,
      );
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") search();
  };

  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" || typeof v === "number") return String(v);
    return JSON.stringify(v);
  };

  const fmtTs = (ms: string | number | undefined): string => {
    if (ms === undefined || ms === null) return "—";
    const n = typeof ms === "string" ? Number(ms) : ms;
    if (!n) return "—";
    return new Date(n).toLocaleString("zh-CN");
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FileSearch className="size-5 text-muted-foreground" />
          异常诊断
        </h2>
        <p className="text-sm text-muted-foreground">
          输入 task id / chat id / bot name — 查 session + events 时间线
        </p>
      </header>

      {/* Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">查询</CardTitle>
          <CardDescription>支持 task id(完整 / 前 8 位)、chat id、bot name</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            onKeyDown={onKey}
            placeholder="如:17ed95c6 或 bot name '得一'"
            autoFocus
          />
          <Button onClick={search} disabled={loading || !taskId.trim()} className="gap-1.5">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            诊断
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <>
          {/* Summary bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={result.found > 0 ? "default" : "secondary"}>
                  found: {result.found}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  session: <strong className="text-foreground">{result.session ? 1 : 0}</strong>
                  · events: <strong className="text-foreground">{result.events?.length ?? 0}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Session */}
          {result.session && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="size-4 text-muted-foreground" />
                  Session 详情
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {Object.entries(result.session)
                    .filter(([k]) => !["id", "session_id", "session_id_engine"].includes(k))
                    .slice(0, 16)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1">
                        <dt className="text-xs text-muted-foreground font-mono shrink-0">{k}</dt>
                        <dd className="text-xs font-mono text-right truncate max-w-[300px]" title={fmt(v)}>
                          {fmt(v)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Events */}
          {result.events && result.events.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListTree className="size-4 text-muted-foreground" />
                  事件时间线 ({result.events.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.events.map((e, i) => (
                    <div key={`${e.id}-${i}`} className="rounded-md border border-border bg-card p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={e.error_message ? "destructive" : "secondary"}>
                          {e.type}
                        </Badge>
                        <span className="text-sm font-medium">{e.bot_name ?? "—"}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtTs(e.timestamp)}
                        </span>
                      </div>
                      {e.prompt && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          <span className="text-[10px] uppercase tracking-wider mr-1">prompt</span>
                          {e.prompt}
                        </p>
                      )}
                      {e.response_preview && (
                        <p className="text-xs line-clamp-3">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">response</span>
                          {e.response_preview}
                        </p>
                      )}
                      {e.error_message && (
                        <p className="text-xs text-destructive font-mono break-all">
                          {e.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty hint */}
      {!result && !loading && !error && (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            输入 task id / bot name 开始诊断
          </CardContent>
        </Card>
      )}
    </div>
  );
}
