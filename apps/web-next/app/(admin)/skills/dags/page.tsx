"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface DagNode { id: string; type: string; label: string; config: Record<string, unknown>; }
interface DagEdge { from: string; to: string; condition?: string; }
interface SkillDag {
  id: string;
  skillId: string;
  version: number;
  nodes: DagNode[];
  edges: DagEdge[];
  validationStatus: string;
  validationErrors: string[];
}

export default function SkillDagEditorPage() {
  const [skillId, setSkillId] = useState("demo-skill");
  const [dags, setDags] = useState<SkillDag[]>([]);
  const [selected, setSelected] = useState<SkillDag | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ success: boolean; data: SkillDag[] }>(
      `/api/v2/admin/skill-dags?skillId=${encodeURIComponent(skillId)}`
    );
    setDags(r.data ?? []);
    setLoading(false);
  }, [skillId]);

  useEffect(() => { load(); }, [load]);

  function selectDag(d: SkillDag) {
    setSelected(d);
    setJsonDraft(JSON.stringify({ nodes: d.nodes, edges: d.edges }, null, 2));
    setErrors(d.validationErrors ?? []);
    setMessage(null);
  }

  async function handleValidate() {
    if (!selected) return;
    setValidating(true);
    try {
      const parsed = JSON.parse(jsonDraft);
      const res = await api<{ success: boolean; validation: { ok: boolean; errors: string[] } }>(
        `/api/v2/admin/skill-dags/${selected.id}`,
        { method: "PUT", body: parsed }
      );
      if (res.validation?.ok) {
        setErrors([]);
        setMessage("校验通过 ✓");
        await load();
      } else {
        setErrors(res.validation?.errors ?? ["未知错误"]);
        setMessage("校验失败");
      }
    } catch (e: unknown) {
      setErrors([`JSON parse error: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setValidating(false);
    }
  }

  async function handleCreate() {
    const tenantId = prompt("请输入 tenantId:");
    if (!tenantId) return;
    const initial = {
      nodes: [
        { id: "n1", type: "llm", label: "LLM 节点", config: { model: "claude-opus" } },
        { id: "n2", type: "output", label: "输出", config: {} },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    const r = await api<{ success: boolean; data: SkillDag }>("/api/v2/admin/skill-dags", {
      method: "POST",
      body: { skillId, tenantId, ...initial },
    });
    if (r.data) {
      selectDag(r.data);
      await load();
    }
  }

  const STATUS_TONE: Record<string, string> = {
    valid: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    invalid: "bg-rose-500/15 text-rose-600 border-rose-500/30",
    pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    deleted: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skill DAG 编写器</h1>
          <p className="text-sm text-muted-foreground">结构化 Skill 定义(节点 + 边 + 类型) · 支持自动校验(循环/dangling/output 检查)</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Skill ID"
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            className="w-48"
          />
          <Button onClick={handleCreate}>+ 新版本</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">版本列表</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <div className="divide-y">
                {dags.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => selectDag(d)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                      selected?.id === d.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">v{d.version}</span>
                      <Badge variant="outline" className={STATUS_TONE[d.validationStatus] ?? ""}>
                        {d.validationStatus}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{d.nodes.length} nodes · {d.edges.length} edges</div>
                  </button>
                ))}
                {dags.length === 0 && (
                  <div className="px-4 py-8 text-sm text-muted-foreground text-center">暂无版本</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>v{selected.version} · {selected.skillId}</CardTitle>
              <CardDescription>编辑节点(nodes)和边(edges)后点击"校验"触发服务端验证</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                rows={18}
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                spellCheck={false}
              />

              {errors.length > 0 && (
                <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                    <AlertTriangle className="size-4" />
                    校验错误
                  </div>
                  <ul className="list-disc list-inside text-xs text-destructive space-y-0.5 font-mono">
                    {errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {message && (
                <div className={`text-sm ${message.includes("通过") ? "text-emerald-600" : "text-destructive"}`}>
                  {message}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={handleValidate} disabled={validating}>
                  {validating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
                  校验
                </Button>
                <span className="text-xs text-muted-foreground">
                  类型: llm / tool / kb_retrieval / http / branch / loop / parallel / output
                </span>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">节点预览</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(JSON.parse(jsonDraft || "{\"nodes\":[]}").nodes ?? []).map((n: DagNode) => (
                    <div key={n.id} className="border rounded-lg p-2 bg-muted/30">
                      <div className="text-xs font-mono text-muted-foreground">{n.id}</div>
                      <div className="text-sm font-medium truncate">{n.label}</div>
                      <div className="text-xs text-primary">{n.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              选择左侧版本,或点击"+ 新版本"创建一个
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
