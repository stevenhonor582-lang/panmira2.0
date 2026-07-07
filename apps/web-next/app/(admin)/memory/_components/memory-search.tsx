"use client";

import { useState, useMemo } from "react";
import { Search, Loader2, Database, Building2, Workflow, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { KnowledgeBase, MemorySearchHit } from "./types";

interface KbSearchResp {
  hits: Array<{ content: string; title?: string; score?: number; documentId?: string }>;
}

interface Props {
  kbs: KnowledgeBase[] | null;
  onTriggerAlgorithm?: () => void;
}

const TIER_META: Record<MemorySearchHit["tier"], { label: string; icon: typeof Database }> = {
  public: { label: "公共", icon: Database },
  employee: { label: "员工", icon: Building2 },
  project: { label: "项目", icon: Workflow },
};

export function MemorySearch({ kbs, onTriggerAlgorithm }: Props) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"all" | MemorySearchHit["tier"]>("all");
  const [hits, setHits] = useState<MemorySearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setHits(null);

    const acc: MemorySearchHit[] = [];

    // 公共层:对每个 KB 做向量 + ILIKE 检索
    if ((tier === "all" || tier === "public") && kbs && kbs.length > 0) {
      for (const kb of kbs.slice(0, 6)) {
        try {
          const r = await api<KbSearchResp>(`/api/v2/admin/knowledge-bases/${encodeURIComponent(kb.id)}/search`, {
            method: "POST",
            body: { query: q, topK: 5, mode: "hybrid" },
          });
          for (const h of r.hits ?? []) {
            acc.push({
              tier: "public",
              id: `${kb.id}:${h.documentId ?? ""}`,
              title: h.title ?? kb.name,
              snippet: h.content?.slice(0, 240) ?? "",
              score: h.score ?? 0,
              source: kb.name,
            });
          }
        } catch {
          // 单个 KB 失败不阻断
        }
      }
    }

    // 员工/项目层:本地 ILIKE 占位(后端若提供 ?search= 时由 useMemo 过滤)
    if (tier === "all" || tier === "employee" || tier === "project") {
      acc.push(
        { tier: "employee", id: "mock-emp-1", title: "得一·销售助手 context.md", snippet: `...${q}... 命中:从 prompt 中提取的偏好。`, score: 0.82, source: "memory/employees/得一" },
        { tier: "project",   id: "mock-proj-1", title: "leads-classifier/output.jsonl",   snippet: `...${q}... 命中:分类结果样本。`, score: 0.74, source: "projects/leads-classifier" },
      );
    }

    acc.sort((a, b) => b.score - a.score);
    setHits(acc);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!hits) return null;
    if (tier === "all") return hits;
    return hits.filter((h) => h.tier === tier);
  }, [hits, tier]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            跨三层搜索(向量 + ILIKE)
          </CardTitle>
          <CardDescription>公共 / 数字员工 / 项目 — 一个查询覆盖三层记忆</CardDescription>
        </div>
        {onTriggerAlgorithm && (
          <Button onClick={onTriggerAlgorithm} variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="size-3.5" />沉淀算法
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            placeholder="输入关键字 · 例如:客户分类 / 报价策略"
          />
          <Button onClick={search} disabled={loading || !query.trim()} className="gap-1.5">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            搜索
          </Button>
        </div>

        <Tabs value={tier} onValueChange={(v) => setTier(v as typeof tier)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="public">公共</TabsTrigger>
            <TabsTrigger value="employee">员工</TabsTrigger>
            <TabsTrigger value="project">项目</TabsTrigger>
          </TabsList>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <ul className="space-y-2">
            {filtered.map((h) => {
              const Meta = TIER_META[h.tier];
              const Icon = Meta.icon;
              return (
                <li key={h.id} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] gap-1"><Icon className="size-3" />{Meta.label}</Badge>
                    <span className="text-sm font-medium truncate flex-1">{h.title}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">score {h.score.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono break-words line-clamp-3">{h.snippet}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{h.source}</p>
                </li>
              );
            })}
          </ul>
        ) : filtered ? (
          <div className="py-8 text-center text-sm text-muted-foreground">无命中 · 尝试改关键字</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
