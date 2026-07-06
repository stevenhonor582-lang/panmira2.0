"use client";

import { Brain, Database, FileText, Hash, Layers, Tag } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MemoryPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Brain className="size-5 text-muted-foreground" />
          Memory 管理
        </h2>
        <p className="text-sm text-muted-foreground">
          知识沉淀 · 检索 · 综合(spec § 11.4)
        </p>
      </header>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-blue-500" />
              <p className="text-xs text-muted-foreground">Postgres + pgvector</p>
            </div>
            <p className="text-sm font-medium">3 个 memory 层</p>
          </CardContent>
        </Card>
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-emerald-500" />
              <p className="text-xs text-muted-foreground">layers</p>
            </div>
            <p className="text-sm font-medium">knowledge / facts / episodes</p>
          </CardContent>
        </Card>
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-amber-500" />
              <p className="text-xs text-muted-foreground">chunk size</p>
            </div>
            <p className="text-sm font-medium">512 (configurable)</p>
          </CardContent>
        </Card>
      </div>

      {/* Architecture */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">架构</CardTitle>
          <CardDescription>Memory 数据流 + 检索</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="space-y-2 list-decimal list-inside">
            <li>
              <strong>store</strong>: 文档切 chunk → embedding → 存入 pgvector
            </li>
            <li>
              <strong>retrieve</strong>: query → embedding → cosine top-K + BM25 → RRF 合并
            </li>
            <li>
              <strong>synthesize</strong>: 拼接 chunks → agent prompt 上下文
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Note */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="size-3.5" />
            API 访问说明
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            Memory API(<code className="font-mono text-xs">/api/v1/memory/*</code>)是 internal 接口,
            需要 <Badge variant="outline" className="text-[10px] mx-1">x-internal-key</Badge> header
            (env <code className="font-mono">MEMORY_INTERNAL_KEY</code>)。
          </p>
          <p>
            Admin JWT(role=admin → scope <code className="font-mono">*</code>)不能直接访问。
            实际使用:web bot / mobile / external CLI 通过 internal 凭证调用。
          </p>
          <p className="pt-2 text-xs">
            完整功能管理在 <Badge variant="secondary" className="text-[10px]">设置 → Memory</Badge> 内配置。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
