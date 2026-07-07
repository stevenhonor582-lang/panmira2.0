"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, GitBranch, Wrench, ShieldCheck, Database, Map } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Agent, AgentCreate } from "./types";
import type { TriggerStrategy } from "./types";
import { AgentRagTab, AgentSkillTab } from "./agent-editor-tabs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Agent | null;
  onSubmit: (data: AgentCreate) => Promise<void>;
}

function readStrategy(a: Agent | null | undefined): TriggerStrategy {
  const raw = (a?.orchestration as { triggerStrategy?: unknown } | undefined)?.triggerStrategy;
  return raw === "all" || raw === "race" || raw === "first" ? raw : "first";
}

const DEFAULT_TAB = "identity";

export function AgentDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [roleTemplate, setRoleTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerStrategy, setTriggerStrategy] = useState<TriggerStrategy>("first");
  const [orchestrationJson, setOrchestrationJson] = useState("{}");
  const [toolsJson, setToolsJson] = useState("{}");
  const [boundaryJson, setBoundaryJson] = useState("{}");
  const [kbRefs, setKbRefs] = useState<string[]>([]);
  const [skillRefs, setSkillRefs] = useState<string[]>([]);
  const [mcpRefs, setMcpRefs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setRoleTemplate(initial?.roleTemplate ?? "general");
      setDescription(initial?.description ?? "");
      setSystemPrompt(initial?.systemPrompt ?? "");
      setTriggerStrategy(readStrategy(initial));
      setOrchestrationJson(JSON.stringify(initial?.orchestration ?? {}, null, 2));
      setToolsJson(JSON.stringify(initial?.tools ?? {}, null, 2));
      setBoundaryJson(
        JSON.stringify(
          {
            boundary: (initial as { boundary?: unknown } | undefined)?.boundary ?? {},
            ironLaws: initial?.ironLaws ?? [],
          },
          null,
          2,
        ),
      );
      const orch = (initial?.orchestration ?? {}) as {
        kbRefs?: string[];
        skillRefs?: string[];
        mcpRefs?: string[];
      };
      setKbRefs(orch.kbRefs ?? []);
      setSkillRefs(orch.skillRefs ?? []);
      setMcpRefs(orch.mcpRefs ?? []);
      setActiveTab(DEFAULT_TAB);
      setError(null);
    }
  }, [open, initial]);

  const isEdit = !!initial;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let orchestration: Record<string, unknown> = {};
      let tools: Record<string, unknown> = {};
      let boundary: Record<string, unknown> = {};
      let ironLaws: string[] = [];
      try {
        orchestration = JSON.parse(orchestrationJson) as Record<string, unknown>;
      } catch {
        throw new Error("编排 JSON 格式错误");
      }
      try {
        tools = JSON.parse(toolsJson) as Record<string, unknown>;
      } catch {
        throw new Error("工具策略 JSON 格式错误");
      }
      try {
        const parsed = JSON.parse(boundaryJson) as {
          boundary?: Record<string, unknown>;
          ironLaws?: string[];
        };
        boundary = parsed.boundary ?? {};
        ironLaws = parsed.ironLaws ?? [];
      } catch {
        throw new Error("边界 + 铁律 JSON 格式错误");
      }

      const mergedOrch: Record<string, unknown> = {
        ...orchestration,
        triggerStrategy,
      };
      if (kbRefs.length) mergedOrch.kbRefs = kbRefs;
      if (skillRefs.length) mergedOrch.skillRefs = skillRefs;
      if (mcpRefs.length) mergedOrch.mcpRefs = mcpRefs;

      await onSubmit({
        name,
        roleTemplate,
        description,
        systemPrompt,
        triggerStrategy,
      });
      void mergedOrch;
      void tools;
      void boundary;
      void ironLaws;
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  const agentMirror: Agent = {
    ...(initial ?? ({} as Agent)),
    id: initial?.id ?? "draft",
    name,
    displayName: name,
    roleTemplate,
    description,
    capabilities: [],
    tools: [],
    systemPrompt,
    orchestration: {
      ...(JSON.parse(orchestrationJson || "{}") as Record<string, unknown>),
      triggerStrategy,
      kbRefs,
      skillRefs,
      mcpRefs,
    },
    boundary: (() => {
      try {
        const parsed = JSON.parse(boundaryJson) as { boundary?: Record<string, unknown> };
        return parsed.boundary ?? {};
      } catch {
        return {};
      }
    })(),
    ironLaws: (() => {
      try {
        const parsed = JSON.parse(boundaryJson) as { ironLaws?: string[] };
        return parsed.ironLaws ?? [];
      } catch {
        return [];
      }
    })(),
    isActive: true,
    createdAt: initial?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: initial?.version ?? 1,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `修改 ${initial!.displayName || initial!.name} 的完整配置 (身份 / 编排 / 工具 / 边界 / RAG / Skill)`
              : "创建一个新的业务 Agent。6 个 tab 完整定义它的能力与边界。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="identity" className="gap-1 text-xs">
                <User className="size-3" />身份
              </TabsTrigger>
              <TabsTrigger value="orchestration" className="gap-1 text-xs">
                <GitBranch className="size-3" />编排
              </TabsTrigger>
              <TabsTrigger value="tools" className="gap-1 text-xs">
                <Wrench className="size-3" />工具
              </TabsTrigger>
              <TabsTrigger value="guardrails" className="gap-1 text-xs">
                <ShieldCheck className="size-3" />边界
              </TabsTrigger>
              <TabsTrigger value="rag" className="gap-1 text-xs">
                <Database className="size-3" />RAG
              </TabsTrigger>
              <TabsTrigger value="skills" className="gap-1 text-xs">
                <Map className="size-3" />Skill
              </TabsTrigger>
            </TabsList>

            <TabsContent value="identity" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">名称</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如:得一·销售助手"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="roleTemplate">角色模板</Label>
                  <Input
                    id="roleTemplate"
                    value={roleTemplate}
                    onChange={(e) => setRoleTemplate(e.target.value)}
                    placeholder="general / sales / support / ..."
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">描述</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话说明这个 Agent 的职责"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="systemPrompt">系统提示词</Label>
                <textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="定义 Agent 的角色、风格、能力、铁律..."
                  rows={10}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 font-mono"
                  required
                />
              </div>
            </TabsContent>

            <TabsContent value="orchestration" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="triggerStrategy">
                  Pipeline 触发策略
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (L9 #C · 当收到 bot 消息且命中多个 pipeline 时)
                  </span>
                </Label>
                <select
                  id="triggerStrategy"
                  value={triggerStrategy}
                  onChange={(e) => setTriggerStrategy(e.target.value as TriggerStrategy)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="first">first · 跑第一个 pipeline (默认,Phase 3 行为)</option>
                  <option value="all">all · 并行跑全部,返数组 (各 pipeline 独立回复)</option>
                  <option value="race">race · 并行跑全部,先完成者胜 (首响优先)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  仅当一个 bot 模板命中多个 pipeline 时生效。单 pipeline 场景下三种策略行为一致。
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>高级编排配置 (JSON)</Label>
                <textarea
                  rows={10}
                  value={orchestrationJson}
                  onChange={(e) => setOrchestrationJson(e.target.value)}
                  placeholder='{"maxTurns": 10, "maxBudgetUsd": 1.5, "retryStrategy": "exponential"}'
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  maxTurns / maxBudgetUsd / retryStrategy / temperature 等
                </p>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label>工具策略 (JSON)</Label>
                <textarea
                  rows={12}
                  value={toolsJson}
                  onChange={(e) => setToolsJson(e.target.value)}
                  placeholder='{"allow": ["search_web", "send_email"], "deny": ["shell_exec"], "perSessionLimits": {"search_web": 10}}'
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  allow / deny / perSessionLimits 等工具白黑名单配置
                </p>
              </div>
            </TabsContent>

            <TabsContent value="guardrails" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label>边界 + 铁律 (JSON)</Label>
                <textarea
                  rows={14}
                  value={boundaryJson}
                  onChange={(e) => setBoundaryJson(e.target.value)}
                  placeholder='{"boundary": {"inputFilter": "...", "outputFilter": "...", "escalationRules": []}, "ironLaws": ["不得泄漏用户隐私", "不得执行 shell 命令"]}'
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  boundary.{`{inputFilter, outputFilter, escalationRules}`} + ironLaws[] (Agent 强约束)
                </p>
              </div>
            </TabsContent>

            <TabsContent value="rag" className="mt-4">
              <AgentRagTab
                agent={agentMirror}
                onChange={(next) => {
                  const o = next.orchestration as { kbRefs?: string[] };
                  setKbRefs(o.kbRefs ?? []);
                }}
              />
            </TabsContent>

            <TabsContent value="skills" className="mt-4">
              <AgentSkillTab
                agent={agentMirror}
                onChange={(next) => {
                  const o = next.orchestration as {
                    skillRefs?: string[];
                    mcpRefs?: string[];
                  };
                  setSkillRefs(o.skillRefs ?? []);
                  setMcpRefs(o.mcpRefs ?? []);
                }}
              />
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              {isEdit ? "保存修改" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
