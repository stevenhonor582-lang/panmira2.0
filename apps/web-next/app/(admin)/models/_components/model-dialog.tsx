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
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2 } from "lucide-react";
import {
  MODEL_TYPE_META,
  MODEL_TYPES,
  normalizeModelName,
  type Model,
  type ModelInput,
  type ModelType,
} from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Model | null;
  onSubmit: (data: ModelInput) => Promise<void>;
}

export function ModelDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [type, setType] = useState<ModelType>("llm");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [routingStrategy, setRoutingStrategy] = useState<Model["routingStrategy"]>("auto");
  const [routingTags, setRoutingTags] = useState("");
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
      setRoutingStrategy(initial?.routingStrategy ?? "auto");
      setRoutingTags((initial?.routingTags ?? []).join(", "));
      setError(null);
    }
  }, [open, initial]);

  const isEdit = !!initial;
  const meta = MODEL_TYPE_META[type];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: ModelInput = {
        type,
        name,
        baseUrl,
        model,
        isDefault,
        routingStrategy,
        routingTags: routingTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (apiKey) payload.apiKey = apiKey;
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  const applyNormalize = () => {
    const { normalized } = normalizeModelName(model);
    if (normalized !== model) setModel(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑模型" : "新建模型"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `修改 ${initial!.name} 的配置`
              : `添加一个 ${meta.label} 模型 Provider · Base URL 形如 ${meta.placeholderUrl}`}
            <a href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline mt-1 inline-block">
              查看 API 文档参考 →
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
                onChange={(e) => setType(e.target.value as ModelType)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isEdit}
              >
                {MODEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MODEL_TYPE_META[t].label} — {MODEL_TYPE_META[t].desc}
                  </option>
                ))}
              </select>
              {type !== "llm" && type !== "embedding" && (
                <p className="text-[10px] text-amber-600 mt-1">
                  该类型为前端预留字段,后端 API 仍按 {type === "image" || type === "video" ? "image" : type === "tts" ? "llm(tts 路由)" : type === "stt" ? "audio(stt 路由)" : type} 处理
                </p>
              )}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`如:${type === "llm" ? "DeepSeek V4" : type === "image" ? "DALL-E Pool" : type === "tts" ? "Edge TTS" : "Whisper"}`}
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
              placeholder={meta.placeholderUrl}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="model">模型名</Label>
              <div className="flex gap-1">
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={meta.placeholderModel}
                  required
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyNormalize}
                  disabled={!model}
                  className="gap-1 px-2"
                  title="自动识别大小写 / 别名"
                >
                  <Wand2 className="size-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                知名模型(Claude/GPT-4/DeepSeek/Qwen)自动归一化为标准形式
              </p>
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

          {/* 智能路由预留字段 */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="routingStrategy" className="flex items-center gap-1.5">
                路由策略 <Badge variant="outline" className="text-[10px]">预留</Badge>
              </Label>
              <select
                id="routingStrategy"
                value={routingStrategy}
                onChange={(e) => setRoutingStrategy(e.target.value as Model["routingStrategy"])}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="auto">auto · 自动</option>
                <option value="fallback">fallback · 兜底</option>
                <option value="fastest">fastest · 最快</option>
                <option value="cheapest">cheapest · 最便宜</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="routingTags" className="flex items-center gap-1.5">
                路由标签 <Badge variant="outline" className="text-[10px]">预留</Badge>
              </Label>
              <Input
                id="routingTags"
                value={routingTags}
                onChange={(e) => setRoutingTags(e.target.value)}
                placeholder="comma,separated,tags"
                className="text-xs"
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
            <Button type="submit" disabled={loading} className="gap-1.5">
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
