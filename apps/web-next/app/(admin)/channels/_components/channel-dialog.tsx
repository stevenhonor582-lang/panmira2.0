"use client";

import { useState, type FormEvent } from "react";
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
import type { ChannelCreate } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ChannelCreate) => Promise<void>;
}

export function ChannelDialog({ open, onOpenChange, onSubmit }: Props) {
  const [groupId, setGroupId] = useState("");
  const [pattern, setPattern] = useState("");
  const [targetBotsText, setTargetBotsText] = useState("");
  const [priority, setPriority] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setGroupId(""); setPattern(""); setTargetBotsText("");
    setPriority(50); setEnabled(true); setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const targetBots = targetBotsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await onSubmit({
        groupId: groupId || undefined,
        pattern: pattern || undefined,
        targetBots,
        priority,
        enabled,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新建路由绑定</DialogTitle>
          <DialogDescription>
            把消息按 pattern 路由到一组 bot。Channel 实体待 plan B 资源池上线后扩展。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="groupId">Group ID</Label>
              <Input
                id="groupId"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="如:oc_xxx (飞书群)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">优先级</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={0}
                max={100}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pattern">Pattern (匹配规则)</Label>
            <Input
              id="pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="如:feishu:group:oc_xxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="targetBots">
              Target Bots <span className="text-muted-foreground">(逗号或换行分隔)</span>
            </Label>
            <textarea
              id="targetBots"
              value={targetBotsText}
              onChange={(e) => setTargetBotsText(e.target.value)}
              placeholder="bot-id-1, bot-id-2"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-3.5"
            />
            <span>启用</span>
          </label>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
