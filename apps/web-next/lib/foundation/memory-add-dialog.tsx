"use client";

/**
 * R13-C · Memory 手动添加 Dialog
 * 字段: layer / content / importance / subject / tags / type
 */
import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { mf } from "./api";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  defaultLayer?: 1 | 2 | 3;
  onCreated?: () => void;
}

const TYPES = ["event", "fact", "preference", "entity", "decision"] as const;

export function MemoryAddDialog({ open, onOpenChange, defaultLayer = 2, onCreated }: Props) {
  const [layer, setLayer] = React.useState<1 | 2 | 3>(defaultLayer);
  const [content, setContent] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [importance, setImportance] = React.useState(0.5);
  const [type, setType] = React.useState<(typeof TYPES)[number]>("event");
  const [tags, setTags] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setLayer(defaultLayer);
      setContent("");
      setSubject("");
      setImportance(defaultLayer === 3 ? 0.9 : defaultLayer === 2 ? 0.7 : 0.4);
      setType("event");
      setTags("");
      setErr(null);
    }
  }, [open, defaultLayer]);

  async function submit() {
    if (!content.trim()) {
      setErr("content 不能为空");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      await mf.createMemory({ layer, content: content.trim(), importance, subject: subject.trim() || undefined, type, tags: tagList });
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="size-4 text-muted-foreground" />手动添加记忆
          </DialogTitle>
          <DialogDescription className="text-xs">
            写入 layer / content / importance。tags 用逗号分隔。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {err && (
            <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <div>{err}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">layer</label>
              <div className="mt-1 flex rounded border border-border overflow-hidden">
                {([1, 2, 3] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLayer(l)}
                    className={
                      "flex-1 py-1 text-[11px] font-mono transition-colors " +
                      (layer === l ? "bg-foreground text-background" : "hover:bg-muted/60")
                    }
                  >L{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="mt-1 w-full h-7 rounded border border-border bg-background px-1 text-[11px] font-mono"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">importance</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input type="range" min={0} max={1} step={0.05} value={importance}
                  onChange={(e) => setImportance(parseFloat(e.target.value))}
                  className="flex-1 accent-foreground"
                />
                <span className="font-mono text-[11px] w-8 text-right">{importance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">subject (optional)</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="一句话标题;不填用 content 前 80 字符"
              className="mt-1 w-full h-7 rounded border border-border bg-background px-2 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">content *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="详细内容…"
              className="mt-1 w-full min-h-[140px] rounded border border-border bg-background p-2 text-[11px] leading-relaxed resize-y"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">tags (comma sep)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. 重要, 客户偏好, R13C"
              className="mt-1 w-full h-7 rounded border border-border bg-background px-2 text-[11px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
            <Button size="sm" className="h-7 text-[11px] gap-1" onClick={submit} disabled={saving || !content.trim()}>
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}创建记忆
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
