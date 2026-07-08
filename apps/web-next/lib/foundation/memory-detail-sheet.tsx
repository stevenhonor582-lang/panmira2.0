"use client";

/**
 * R13-C · Memory 详情抽屉
 * - 显示 layer/importance/subject/content/tags/meta
 * - 改 importance (slider 0-1, step 0.05)
 * - 改 layer (1/2/3, promote 按钮)
 * - 改 content / subject (inline edit)
 * - 删除 (确认弹窗)
 * - 复制内容
 */
import * as React from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Trash2, Copy, Check, RefreshCcw, ArrowUpCircle, Edit3, Save, X, AlertCircle, Loader2,
} from "lucide-react";
import { mf, fmtRel, type MemoryItem } from "./api";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  memoryId: string | null;
  layer: 1 | 2 | 3;
  onChanged?: () => void; // 通知父组件 reload list
}

export function MemoryDetailSheet({ open, onOpenChange, memoryId, layer, onChanged }: Props) {
  const [item, setItem] = React.useState<MemoryItem | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draftContent, setDraftContent] = React.useState("");
  const [draftSubject, setDraftSubject] = React.useState("");
  const [draftImportance, setDraftImportance] = React.useState(0.5);
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!memoryId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await mf.getMemory(memoryId);
      setItem(r.memory);
      setDraftContent(r.memory.content ?? "");
      setDraftSubject(r.memory.subject ?? "");
      setDraftImportance(r.memory.importance ?? 0.5);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  React.useEffect(() => {
    if (open && memoryId) load();
  }, [open, memoryId, load]);

  async function save() {
    if (!item) return;
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, unknown> = {};
      if (draftContent !== (item.content ?? "")) patch.content = draftContent;
      if (draftSubject !== (item.subject ?? "")) patch.subject = draftSubject;
      if (Math.abs(draftImportance - (item.importance ?? 0.5)) > 0.001) patch.importance = draftImportance;
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      const r = await mf.patchMemory(item.id, patch);
      setItem(r.memory);
      setEditing(false);
      onChanged?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function promote(toLayer: 1 | 2 | 3) {
    if (!item || item.layer === toLayer) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await mf.patchMemory(item.id, { layer: toLayer });
      setItem(r.memory);
      onChanged?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!item) return;
    setSaving(true);
    try {
      await mf.deleteMemory(item.id);
      setConfirmDel(false);
      onOpenChange(false);
      onChanged?.();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function copyContent() {
    if (!item?.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:w-[480px] p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono uppercase">L{item?.layer ?? layer}</Badge>
            <span className="truncate flex-1">{item?.subject ?? "(loading)"}</span>
          </SheetTitle>
          <SheetDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            id {item?.id ?? memoryId}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <div>{err}</div>
            </div>
          )}

          {loading && (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}

          {!loading && item && (
            <>
              {/* subject + content */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">subject</h4>
                  {editing ? (
                    <Input compact value={draftSubject} onChange={(e: any) => setDraftSubject(e.target.value)} className="h-6 text-xs flex-1" />
                  ) : (
                    <span className="text-xs font-medium truncate flex-1">{item.subject || "—"}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">content</h4>
                  <div className="flex items-center gap-1">
                    {editing ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => { setEditing(false); load(); }} disabled={saving}>
                          <X className="size-3" />取消
                        </Button>
                        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={save} disabled={saving}>
                          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}保存
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1" onClick={copyContent}>
                          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}复制
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1" onClick={() => setEditing(true)}>
                          <Edit3 className="size-3" />编辑
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {editing ? (
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    className="w-full min-h-[180px] rounded border border-border bg-background p-2 text-xs leading-relaxed font-mono resize-y"
                  />
                ) : (
                  <div className="rounded-md border border-border bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto">
                    {item.content || "(empty)"}
                  </div>
                )}
              </section>

              {/* importance slider */}
              <Separator />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">importance</h4>
                  <span className="text-xs font-mono">{draftImportance.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={draftImportance}
                  onChange={(e) => setDraftImportance(parseFloat(e.target.value))}
                  onMouseUp={async () => {
                    if (item && Math.abs(draftImportance - (item.importance ?? 0.5)) > 0.001) {
                      try {
                        const r = await mf.patchMemory(item.id, { importance: draftImportance });
                        setItem(r.memory);
                        onChanged?.();
                      } catch (e: any) { setErr(String(e?.message ?? e)); }
                    }
                  }}
                  className="w-full accent-foreground"
                />
                <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground/60">
                  <span>0.0</span><span>0.5</span><span>1.0</span>
                </div>
              </section>

              {/* layer promote */}
              <Separator />
              <section className="space-y-2">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">layer</h4>
                <div className="flex items-center gap-1.5">
                  {([1, 2, 3] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      disabled={item.layer === l || saving}
                      onClick={() => promote(l)}
                      className={
                        "px-2.5 py-1 rounded text-[11px] font-mono border transition-colors " +
                        (item.layer === l
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:bg-muted/60 disabled:opacity-40")
                      }
                    >
                      {l === 1 ? "L1 短期" : l === 2 ? "L2 长期" : "L3 永久"}
                    </button>
                  ))}
                  <span className="ml-2 text-[10px] text-muted-foreground/60">
                    <ArrowUpCircle className="inline size-3 mr-0.5" />promote = 写入更高层
                  </span>
                </div>
              </section>

              {/* tags */}
              {item.tags.length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span key={t} className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">{t}</span>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* meta */}
              <Separator />
              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2">meta</h4>
                <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                  <dt className="text-muted-foreground">type</dt>
                  <dd className="font-mono">{item.type ?? "—"}</dd>
                  <dt className="text-muted-foreground">polarity</dt>
                  <dd className="font-mono">{item.polarity ?? "—"}</dd>
                  <dt className="text-muted-foreground">hit count</dt>
                  <dd className="font-mono">{item.hitCount}</dd>
                  <dt className="text-muted-foreground">bot</dt>
                  <dd className="font-mono truncate">{item.botId ?? "—"}</dd>
                  <dt className="text-muted-foreground">tenant</dt>
                  <dd className="font-mono truncate">{item.tenantId ?? "—"}</dd>
                  <dt className="text-muted-foreground">created</dt>
                  <dd className="font-mono">{fmtRel(item.createdAt)}</dd>
                  <dt className="text-muted-foreground">updated</dt>
                  <dd className="font-mono">{fmtRel(item.updatedAt)}</dd>
                  <dt className="text-muted-foreground">last hit</dt>
                  <dd className="font-mono">{fmtRel(item.lastHitAt)}</dd>
                </dl>
              </section>

              {/* delete */}
              <Separator />
              <section>
                {!confirmDel ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => setConfirmDel(true)}>
                    <Trash2 className="size-3" />删除记忆
                  </Button>
                ) : (
                  <div className="rounded border border-rose-500/40 bg-rose-500/5 p-2.5 space-y-2">
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">确认删除?该操作不可撤销。</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setConfirmDel(false)} disabled={saving}>取消</Button>
                      <Button size="sm" variant="destructive" className="h-6 text-[11px] gap-1" onClick={del} disabled={saving}>
                        {saving ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}确认删除
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <SheetClose />
      </SheetContent>
    </Sheet>
  );
}

// minimal Input shim to avoid pulling full ui/input styling mismatch
function Input({ value, onChange, className, compact }: { value: string; onChange: (e: any) => void; className?: string; compact?: boolean }) {
  return (
    <input
      value={value}
      onChange={onChange}
      className={
        "rounded border border-border bg-background px-2 text-xs " +
        (compact ? "h-6 " : "h-8 ") +
        (className ?? "")
      }
    />
  );
}
