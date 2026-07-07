"use client";

import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  isActive: boolean | null;
  orchestration?: unknown;
  tools?: unknown;
  boundary?: unknown;
  ironLaws?: unknown;
}

type Tab = "identity" | "orchestration" | "tools" | "guardrails";

export default function AgentTemplateEditorPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("identity");
  const [jsonDraft, setJsonDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ success: boolean; agents?: Agent[]; data?: Agent[] }>("/api/v2/admin/agents")
      .then((r) => {
        const items = r.agents ?? r.data ?? [];
        setAgents(items);
        if (items.length > 0) {
          setSelectedId(items[0].id);
          setSelected(items[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (tab === "identity") return; // identity uses selected state directly
    if (tab === "orchestration") setJsonDraft(JSON.stringify(selected.orchestration ?? {}, null, 2));
    else if (tab === "tools") setJsonDraft(JSON.stringify(selected.tools ?? {}, null, 2));
    else if (tab === "guardrails") setJsonDraft(JSON.stringify({ boundary: selected.boundary ?? {}, ironLaws: selected.ironLaws ?? [] }, null, 2));
  }, [tab, selected]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      let payload: Record<string, unknown>;
      if (tab === "identity") {
        payload = {
          name: selected.name,
          description: selected.description,
          systemPrompt: selected.systemPrompt,
          isActive: selected.isActive,
        };
      } else {
        const parsed = JSON.parse(jsonDraft);
        if (tab === "orchestration") payload = { orchestration: parsed };
        else if (tab === "tools") payload = { tools: parsed };
        else payload = { boundary: parsed.boundary, ironLaws: parsed.ironLaws };
      }
      const res = await api<{ success: boolean }>(`/api/v2/admin/agents/${selected.id}`, {
        method: "PUT",
        body: payload,
      });
      setMessage({ type: res.success ? "ok" : "err", text: res.success ? "已保存" : "保存失败" });
    } catch (e: unknown) {
      setMessage({ type: "err", text: `错误: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent 执行蓝图</h1>
        <p className="text-sm text-muted-foreground">编辑 Agent 的完整执行配置(身份/编排/工具/边界)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Agent 列表</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedId(a.id); setSelected(a); setMessage(null); }}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                    selectedId === a.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="font-medium text-sm">{a.name}</div>
                  {a.description && (
                    <div className="text-xs text-muted-foreground truncate">{a.description.slice(0, 50)}</div>
                  )}
                </button>
              ))}
              {agents.length === 0 && (
                <div className="px-4 py-8 text-sm text-muted-foreground text-center">暂无 Agent</div>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selected.name}</span>
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
                  保存
                </Button>
              </CardTitle>
              {message && (
                <CardDescription className={message.type === "ok" ? "text-emerald-600" : "text-destructive"}>
                  {message.text}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="identity">身份</TabsTrigger>
                  <TabsTrigger value="orchestration">编排</TabsTrigger>
                  <TabsTrigger value="tools">工具策略</TabsTrigger>
                  <TabsTrigger value="guardrails">边界 & 铁律</TabsTrigger>
                </TabsList>

                <TabsContent value="identity" className="space-y-3 mt-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">名称</label>
                    <Input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">描述</label>
                    <Input value={selected.description ?? ""} onChange={(e) => setSelected({ ...selected, description: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">系统提示词</label>
                    <textarea rows={10} value={selected.systemPrompt ?? ""} onChange={(e) => setSelected({ ...selected, systemPrompt: e.target.value })} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input id="active" type="checkbox" checked={selected.isActive ?? true} onChange={(e) => setSelected({ ...selected, isActive: e.target.checked })} />
                    <label htmlFor="active" className="text-sm">启用</label>
                  </div>
                </TabsContent>

                {tab !== "identity" && (
                  <TabsContent value={tab} className="mt-4 space-y-3">
                    <CardDescription>
                      {tab === "orchestration" && "编排配置: skillRefs / mcpRefs / kbRetrievalMap / maxTurns / maxBudgetUsd / retryStrategy"}
                      {tab === "tools" && "工具策略: allow / deny / perSessionLimits"}
                      {tab === "guardrails" && "边界 + 铁律: boundary.{inputFilter, outputFilter, escalationRules} + ironLaws[]"}
                    </CardDescription>
                    <textarea
                      rows={20}
                      value={jsonDraft}
                      onChange={(e) => setJsonDraft(e.target.value)}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      spellCheck={false}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
