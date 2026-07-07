"use client";

import { Database, Plus, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { KnowledgeBase } from "./types";

const TYPE_LABELS: Record<string, string> = {
  industry: "行业",
  product: "产品",
  competitor: "竞品",
  solution: "方案",
  pricing: "报价",
  company: "公司",
  department: "部门",
  personal: "个人",
};

const INDEX_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "default",
  indexing: "secondary",
  pending: "outline",
  failed: "destructive",
};

interface Props {
  kbs: KnowledgeBase[] | null;
  loading: boolean;
  onCreate?: () => void;
}

export function PublicTier({ kbs, loading, onCreate }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="size-4 text-blue-500" />
            公共记忆(知识库)
          </CardTitle>
          <CardDescription>公司级 KB · 全员共享 · 由 admin 配置权限和绑定</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/knowledge" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors">
            <ExternalLink className="size-3.5" />KB 管理
          </Link>
          {onCreate && (
            <Button onClick={onCreate} size="sm" className="gap-1.5">
              <Plus className="size-3.5" />创建 KB
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !kbs || kbs.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            还没有 KB — 点击"KB 管理"创建第一个
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {kbs.map((kb) => (
              <Link
                key={kb.id}
                href={`/knowledge`}
                className="rounded-md border border-border p-3 hover:border-primary/30 hover:bg-muted/30 transition-colors block"
              >
                <div className="flex items-start gap-2">
                  <div className="size-7 rounded-md bg-blue-500/10 text-blue-500 grid place-items-center shrink-0">
                    <Database className="size-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{kb.name}</p>
                      <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[kb.type] ?? kb.type}</Badge>
                      <Badge variant={INDEX_TONE[kb.indexStatus]} className="text-[10px]">
                        {kb.indexStatus}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{kb.description || "—"}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{kb.documentCount} 文档</span>
                      <span>{kb.chunkCount} chunks</span>
                      <span className="inline-flex items-center gap-1"><Sparkles className="size-3" />{kb.visibility}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
