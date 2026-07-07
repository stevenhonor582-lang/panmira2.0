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
import { Loader2 } from "lucide-react";
import type { Agent, AgentCreate } from "./types";
import type { TriggerStrategy } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Agent | null;
  onSubmit: (data: AgentCreate) => Promise<void>;
}

/**
 * Helper: read triggerStrategy from the persisted agent record.
 * The backend stores it under `orchestration.triggerStrategy`. For brand-new
 * agents (no orchestration yet) we default to 'first' to preserve Phase 3
 * behaviour unless the operator explicitly opts in to a different strategy.
 */
function readStrategy(a: Agent | null | undefined): TriggerStrategy {
  const raw = (a?.orchestration as { triggerStrategy?: unknown } | undefined)?.triggerStrategy;
  return raw === "all" || raw === "race" || raw === "first" ? raw : "first";
}

export function AgentDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [roleTemplate, setRoleTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerStrategy, setTriggerStrategy] = useState<TriggerStrategy>("first");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setRoleTemplate(initial?.roleTemplate ?? "general");
      setDescription(initial?.description ?? "");
      setSystemPrompt(initial?.systemPrompt ?? "");
      setTriggerStrategy(readStrategy(initial));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `修改 ${initial!.displayName || initial!.name} 的配置`
              : "创建一个新的业务 Agent"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
