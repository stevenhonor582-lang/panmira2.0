"use client";

import { useEffect, useState } from "react";
import { Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface EmbeddingProvider {
  id: string;
  name: string;
  baseUrl: string;
  modelName: string;
  dimensions: number;
  isDefault: boolean;
}

export default function EmbeddingPage() {
  const [providers, setProviders] = useState<EmbeddingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    api<{ success: boolean; data: EmbeddingProvider[] }>("/api/v2/admin/embedding-providers")
      .then((r) => setProviders(r.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleTest(id: string) {
    setTestingId(id);
    await new Promise((r) => setTimeout(r, 1500));
    setTestingId(null);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">数智底座 · Embedding 配置</h1>
        <p className="text-sm text-muted-foreground">管理知识库向量化使用的 Embedding 模型(每个 KB 选一个)</p>
      </div>

      {loading ? (
        <Skeleton className="h-40" />
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Cpu className="size-12 mx-auto mb-3 text-muted-foreground" />
            <p>暂未配置 Embedding Provider</p>
            <Button className="mt-4">+ 添加 Provider</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">{p.modelName}</CardDescription>
                  </div>
                  {p.isDefault && <Badge variant="default">默认</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Base URL: <span className="font-mono">{p.baseUrl}</span></div>
                  <div>维度: <span className="font-mono">{p.dimensions}</span></div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleTest(p.id)} disabled={testingId === p.id} className="w-full">
                  {testingId === p.id ? "测试中..." : "连接测试"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
