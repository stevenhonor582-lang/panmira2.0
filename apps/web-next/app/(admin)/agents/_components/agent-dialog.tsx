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
import { Loader2, Plus, X } from "lucide-react";
import type { Agent, AgentCreate, TriggerStrategy } from "./types";

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

function arrayFromString(s: string): string[] {
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function AgentDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleTemplate, setRoleTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerStrategy, setTriggerStrategy] = useState<TriggerStrategy>("first");
  const [capabilities, setCapabilities] = useState("");
  const [tools, setTools] = useState("");
  const [ironLaws, setIronLaws] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDisplayName(initial?.displayName ?? "");
      setRoleTemplate(initial?.roleTemplate ?? "general");
      setDescription(initial?.description ?? "");
      setSystemPrompt(initial?.systemPrompt ?? "");
      setTriggerStrategy(readStrategy(initial));
      setCapabilities((initial?.capabilities ?? []).join("\n"));
      setTools((initial?.tools ?? []).join("\n"));
      setIronLaws((initial?.ironLaws ?? []).join("\n"));
      setError(null);
    }
  }, [open, initial]);

  const isEdit = !!initial;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name,
        roleTemplate,
        description,
        systemPrompt,
        triggerStrategy,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  // 把 capabilities/tools/ironLaws 暂存到 sessionStorage,以便后端 PATCH 时一并提交
  useEffect(() => {
    if (open && initial?.id) {
      sessionStorage.setItem(`agent-extra-${initial.id}`, JSON.stringify({
        capabilities: arrayFromString(capabilities),
        tools: arrayFromString(tools),
        ironLaws: arrayFromString(ironLaws),
        displayName,
      }));
    }
  }, [capabilities, tools, ironLaws, displayName, open, initial?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `修改 ${initial!.displayName || initial!.name} 的配置 · 与详情面板字段对齐`
              : "创建一个新的业务 Agent"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">内部名 (slug)</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如:deyi_sales" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">显示名</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="如:得一·销售助手" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="roleTemplate">角色模板</Label>
              <Input id="roleTemplate" value={roleTemplate} onChange={(e) => setRoleTemplate(e.target.value)} placeholder="general / sales / support / ..." required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="triggerStrategy">
                Pipeline 触发策略
              </Label>
              <select
                id="triggerStrategy"
                value={triggerStrategy}
                onChange={(e) => setTriggerStrategy(e.target.value as TriggerStrategy)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="first">first · 跑第一个 pipeline (默认,Phase 3 行为)</option>
                <option value="all">all · 并行跑全部,返数组</option>
                <option value="race">race · 并行跑全部,先完成者胜</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">描述</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明这个 Agent 的职责" />
          </div>

          {/* 与详情面板对齐的额外字段 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md border border-dashed border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="capabilities" className="flex items-center gap-1.5">
                <Plus className="size-3" />能力 (capabilities)
              </Label>
              <textarea
                id="capabilities"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="每行一个能力"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tools" className="flex items-center gap-1.5">
                <Plus className="size-3" />工具 (tools)
              </Label>
              <textarea
                id="tools"
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="每行一个工具"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ironLaws" className="flex items-center gap-1.5">
                <X className="size-3 text-destructive" />铁律 (ironLaws)
              </Label>
              <textarea
                id="ironLaws"
                value={ironLaws}
                onChange={(e) => setIronLaws(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="每行一条不可违反的规则"
              />
            </div>
            <p className="col-span-full text-[10px] text-muted-foreground">
              这些字段保存为编辑暂存 · 通过 PATCH /agents/:id 提交(详情面板中可见同名字段)
            </p>
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
