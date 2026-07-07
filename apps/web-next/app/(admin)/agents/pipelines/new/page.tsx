"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, AlertCircle, Plus, Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";



interface DagNode { id: string; label: string; agentTemplateId: string; }
interface DagEdge { from: string; to: string; }

const SAMPLE_TEMPLATE_ID = "00000000-0000-0000-0000-000000000000";

const DEFAULT_TEMPLATE = `{
  "name": "内容生产流水线",
  "description": "示例: 选题 → 协作 → 审核,演示 Pipeline 编辑",
  "triggerType": "manual",
  "nodes": [
    { "id": "n1", "label": "选题", "agentTemplateId": "00000000-0000-0000-0000-000000000001" },
    { "id": "n2", "label": "协作", "agentTemplateId": "00000000-0000-0000-0000-000000000002" },
    { "id": "n3", "label": "审核", "agentTemplateId": "00000000-0000-0000-0000-000000000003" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" }
  ]
}`;

export default function NewPipelinePage() {
  const router = useRouter();
  const [json, setJson] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(json);
      const r = await api<{ success: boolean; data: { id: string } }>("/api/v2/admin/pipelines", {
        method: "POST",
        body: parsed,
      });
      router.push(`/agents/pipelines/${r.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <Link href="/agents/pipelines" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        返回 Pipeline 列表
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新建 Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline 是多个 Agent 的 DAG 编排。节点按拓扑顺序执行,前一个节点的输出作为下一个节点的输入。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>DAG 定义 (JSON)</CardTitle>
            <CardDescription>
              nodes: 每个节点引用一个 Agent 模板 (agentTemplateId)。
              edges: 连接节点,定义执行顺序。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              rows={24}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">JSON 字段说明</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2 font-mono">
              <div><b>name</b>: string</div>
              <div><b>description</b>: string (可选)</div>
              <div><b>triggerType</b>: 'manual' | 'bot' | 'cron' | 'event'</div>
              <div><b>nodes</b>: Array&lt;{'{'} id, label, agentTemplateId {'}'}&gt;</div>
              <div><b>edges</b>: Array&lt;{'{'} from, to {'}'}&gt;</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">执行流程</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p>1. 拓扑排序解析 DAG 顺序</p>
              <p>2. 检测 cycle(环检测)</p>
              <p>3. 顺序执行每个节点</p>
              <p>4. n1.output → n2.input</p>
              <p>5. 失败则跳过后续节点</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          保存 Pipeline
        </Button>
        <Link href="/agents/pipelines">
          <Button variant="outline">取消</Button>
        </Link>
      </div>
    </div>
  );
}
