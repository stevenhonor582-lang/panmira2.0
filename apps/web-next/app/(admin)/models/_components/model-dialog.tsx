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
import type { Model, ModelInput } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Model | null;
  onSubmit: (data: ModelInput) => Promise<void>;
}

export function ModelDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [type, setType] = useState<"llm" | "embedding">("llm");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(initial?.type ?? "llm");
      setName(initial?.name ?? "");
      setBaseUrl(initial?.baseUrl ?? "");
      setModel(initial?.model ?? "");
      setApiKey("");
      setIsDefault(initial?.isDefault ?? false);
      setError(null);
    }
  }, [open, initial]);

  const isEdit = !!initial;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: ModelInput = { type, name, baseUrl, model, isDefault };
      if (apiKey) payload.apiKey = apiKey;
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑模型" : "新建模型"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `修改 ${initial!.name} 的配置`
              : "添加一个 LLM 或 Embedding 模型 Provider · Base URL 形如 https://api.openai.com/v1"}
            <a href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline mt-1 inline-block">
              查看 LLM API 文档参考 →
            </a>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="type">类型</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as "llm" | "embedding")}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isEdit}
              >
                <option value="llm">LLM</option>
                <option value="embedding">Embedding</option>
              </select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如:DeepSeek V4"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="model">模型名</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="如:gpt-4 / claude-3-5-sonnet"
                required
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">
                API Key {isEdit && <span className="text-muted-foreground">(留空不改)</span>}
              </Label>
              <Input
                id="apiKey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="font-mono text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-3.5"
            />
            <span>设为默认 Provider</span>
          </label>
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
