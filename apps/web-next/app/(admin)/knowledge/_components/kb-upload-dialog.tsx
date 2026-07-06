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
import { Loader2, Upload } from "lucide-react";
import type { KnowledgeBase } from "./types";

interface Props {
  kb: KnowledgeBase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (kb: KnowledgeBase, data: { title: string; content: string }) => Promise<void>;
}

export function KbUploadDialog({ kb, open, onOpenChange, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!kb) return null;

  const reset = () => {
    setTitle(""); setContent(""); setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(kb, { title, content });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
          <DialogDescription>
            上传到 <strong>{kb.name}</strong> — 自动 chunk + 向量化
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="docTitle">标题</Label>
            <Input
              id="docTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如:产品手册 v2"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="docContent">内容</Label>
            <textarea
              id="docContent"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴 Markdown / 纯文本内容..."
              rows={12}
              required
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              <Upload className="size-3.5" />
              上传
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
