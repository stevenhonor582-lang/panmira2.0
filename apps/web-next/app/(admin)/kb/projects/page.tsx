"use client";

import { useEffect, useState } from "react";
import { Database, Plus, Loader2, Eye, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface KB {
  id: string;
  name: string;
  description: string | null;
  type: string;
  visibility: string;
  indexStatus: string;
  documentCount: number;
  chunkCount: number;
  createdAt: string;
}

const KB_TYPE_LABEL: Record<string, string> = {
  industry: "行业资料",
  product: "产品手册",
  competitor: "竞品资料",
  solution: "解决方案",
  pricing: "价格表",
  company: "公司资料",
  department: "部门资料",
  personal: "个人笔记",
};

const STATUS_TONE: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  indexing: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  pending: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  failed: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

export default function MemoryPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = '/api/v2/admin/knowledge-bases?type=department';


    api<{ success: boolean; data: KB[] }>(url)
      .then((r) => setKbs(r.data ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">项目记忆</h1>
        <p className="text-sm text-muted-foreground">每个项目私有 KB(per-project),仅项目内成员可见。</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      ) : kbs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Database className="size-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">暂无 KB</p>
            <Button className="mt-4">
              <Plus className="size-4 mr-2" /> 新建知识库
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kbs.map((kb) => (
            <Card key={kb.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{kb.name}</CardTitle>
                    {kb.description && (
                      <CardDescription className="line-clamp-2 mt-1">{kb.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[kb.indexStatus] ?? ""}>
                    {kb.indexStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="size-3.5" />
                    <span>{kb.documentCount} 文档</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Database className="size-3.5" />
                    <span>{kb.chunkCount} chunks</span>
                  </div>
                  <Badge variant="secondary" className="ml-auto">{KB_TYPE_LABEL[kb.type] ?? kb.type}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Eye className="size-3.5 mr-1" /> 浏览
                  </Button>
                  <Button size="sm" variant="outline">配置</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
