"use client";

import { useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { AuditLog } from "./_components/types";

function fmtTs(s?: string): string {
  if (!s) return "—";
  const t = new Date(s);
  if (isNaN(t.getTime())) return s;
  return t.toLocaleString("zh-CN");
}

const ACTION_TONE: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  login: "outline",
  logout: "outline",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api<{ logs: AuditLog[] }>(`/api/v2/admin/audit?limit=${limit}`);
      setLogs(r.logs ?? []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [limit]);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ScrollText className="size-5 text-muted-foreground" />
          审计日志
        </h2>
        <p className="text-sm text-muted-foreground">
          谁改过什么 · 时间倒序
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">查询</CardTitle>
          <CardDescription>显示最近 {limit} 条</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="limit" className="text-xs">条数</Label>
            <Input
              id="limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.min(Number(e.target.value) || 50, 200))}
              min={1}
              max={200}
              className="w-[120px]"
            />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
            刷新
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            暂无审计日志
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l, i) => (
                  <TableRow key={l.id ?? i}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmtTs(l.created_at)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {String(l.actor ?? l.user_id ?? l.userId ?? "—")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_TONE[l.action ?? ""] ?? "outline"}>
                        {l.action ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[280px] truncate">
                      {l.resource ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
