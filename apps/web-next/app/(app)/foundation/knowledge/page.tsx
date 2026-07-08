"use client";

/**
 * R17-5 · 数智底座 / 知识库浏览器 (2026-07-09)
 * 真数据驱动: GET /api/v2/foundation/folders/tree + GET /api/v2/foundation/documents
 * CRUD: 新建/重命名/删除文件夹 · 上传/删除/移动/重建索引 文档
 *
 * R17-5 改动:
 *  - 三栏独立滚动(参考 R16-4 memory 修法):外层 + grid + 各栏 overflow-hidden,内部原生 div.overflow-y-auto
 *  - 全中文(技术名词 module enum / visibility enum 保留 DB 值)
 *  - 顶部统计区(总文档/总分片/今日新增/待索引)
 *  - 列表加 质量分 + 最后命中;详情加 关联 Bot + 版本组
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight, Folder, FolderOpen, FileText, Search, Upload, Eye,
  Plus, Pencil, Trash2, RefreshCcw, ArrowUpDown, Home,
  AlertCircle, Loader2, Tag, Hash, Layers, X, Bot, Clock, Gauge, Sparkles,
} from "lucide-react";
import { mf, fmtDate, tagsToString, type FolderItem, type DocumentItem, type ChunkItem } from "@/lib/foundation/api";

// ── 本地中文相对时间(避免改共享 helper 影响其他模块)──────────────────────
function fmtRelCN(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

// ── tree helpers ────────────────────────────────────────────────────────
interface TreeNode extends FolderItem {
  children: TreeNode[];
  expanded?: boolean;
}

function buildTree(folders: FolderItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (n: TreeNode[]) => {
    n.sort((a, b) => a.name.localeCompare(b.name));
    n.forEach((c) => sortRec(c.children));
  };
  sortRec(roots);
  return roots;
}

// ── module 中文标签(DB enum 值保留,展示翻译)──────────────────────────
const MODULE_LABEL: Record<string, string> = {
  knowledge: "知识",
  feedback: "反馈",
  log: "日志",
  other: "其他",
};

const VISIBILITY_LABEL: Record<string, string> = {
  team: "团队",
  private: "私有",
  public: "公开",
};

// ── dialog state ────────────────────────────────────────────────────────
type DialogState =
  | { kind: "none" }
  | { kind: "folder-new"; parent: FolderItem | null }
  | { kind: "folder-rename"; folder: FolderItem }
  | { kind: "folder-delete"; folder: FolderItem }
  | { kind: "doc-upload"; folder: FolderItem | null }
  | { kind: "doc-delete"; doc: DocumentItem }
  | { kind: "doc-tags"; doc: DocumentItem };

export default function KnowledgePage() {
  const [folders, setFolders] = React.useState<FolderItem[]>([]);
  const [docs, setDocs] = React.useState<DocumentItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<"updated" | "title" | "hits">("updated");
  const [loading, setLoading] = React.useState(true);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "none" });

  const [chunks, setChunks] = React.useState<ChunkItem[]>([]);
  const [chunksTotal, setChunksTotal] = React.useState(0);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const loadFolders = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await mf.foldersTree();
      setFolders(r.folders ?? []);
      if (!selectedFolderId && r.folders.length > 0) {
        const root = r.folders.find((f) => !f.parentId) ?? r.folders[0];
        setSelectedFolderId(root.id);
        if (root.parentId === null) setExpanded((s) => new Set([...s, root.id]));
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId]);

  const loadDocs = React.useCallback(async () => {
    setDocsLoading(true);
    try {
      const r = await mf.allDocuments(2000);
      setDocs(r.documents ?? []);
    } catch (e: any) {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadFolders();
    loadDocs();
  }, [loadFolders, loadDocs]);

  const visibleDocs = React.useMemo(() => {
    let list = docs;
    if (selectedFolderId) {
      const childIds = new Set<string>([selectedFolderId]);
      let added = true;
      while (added) {
        added = false;
        folders.forEach((f) => {
          if (f.parentId && childIds.has(f.parentId) && !childIds.has(f.id)) {
            childIds.add(f.id);
            added = true;
          }
        });
      }
      list = list.filter((d) => d.folderId && childIds.has(d.folderId));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((d) => (d.title ?? "").toLowerCase().includes(q) || (d.summary ?? "").toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    else if (sort === "hits") sorted.sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0));
    else sorted.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    return sorted;
  }, [docs, selectedFolderId, query, sort, folders]);

  const activeDoc = docs.find((d) => d.id === selectedDocId) ?? visibleDocs[0];

  // ── 顶部统计(运营价值)──────────────────────────────────────────────
  const stats = React.useMemo(() => {
    const totalDocs = docs.length;
    const totalChunks = docs.reduce((s, d) => s + (d.chunkCount ?? 0), 0);
    const todayNew = docs.filter((d) => isToday(d.createdAt)).length;
    const pendingIndex = docs.filter((d) => !d.chunkCount || d.chunkCount === 0).length;
    const totalHits = docs.reduce((s, d) => s + (d.hitCount ?? 0), 0);
    return { totalDocs, totalChunks, todayNew, pendingIndex, totalHits };
  }, [docs]);

  React.useEffect(() => {
    if (!activeDoc?.id) return;
    let cancel = false;
    setPreviewLoading(true);
    mf.getDocumentChunks(activeDoc.id, 200, 0)
      .then((r) => {
        if (cancel) return;
        setChunks(r.chunks ?? []);
        setChunksTotal(r.total ?? 0);
      })
      .catch(() => {
        if (cancel) return;
        setChunks([]);
        setChunksTotal(0);
      })
      .finally(() => { if (!cancel) setPreviewLoading(false); });
    return () => { cancel = true; };
  }, [activeDoc?.id]);

  const tree = React.useMemo(() => buildTree(folders), [folders]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function renderTree(nodes: TreeNode[], depth = 0): React.ReactNode {
    return (
      <ul className="text-xs">
        {nodes.map((n) => {
          const isOpen = expanded.has(n.id);
          const isSelected = selectedFolderId === n.id;
          return (
            <li key={n.id}>
              <div
                className={cn(
                  "group flex items-center gap-1 py-1 pr-2 rounded transition-colors cursor-pointer",
                  "hover:bg-muted/60",
                  isSelected && "bg-muted",
                )}
                style={{ paddingLeft: `${depth * 10 + 6}px` }}
                onClick={() => setSelectedFolderId(n.id)}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(n.id); }}
                  className="size-3 grid place-items-center shrink-0"
                >
                  <ChevronRight className={cn("size-3 text-muted-foreground/60 transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-amber-500" /> : <Folder className="size-3.5 shrink-0 text-amber-500/80" />}
                <span className="truncate flex-1">{n.name}</span>
                {n.docCount !== undefined && n.docCount > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground/60">{n.docCount}</span>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                  <button title="新建子文件夹" onClick={(e) => { e.stopPropagation(); setDialog({ kind: "folder-new", parent: n }); }}
                    className="size-4 grid place-items-center text-muted-foreground hover:text-foreground">
                    <Plus className="size-3" />
                  </button>
                  <button title="重命名" onClick={(e) => { e.stopPropagation(); setDialog({ kind: "folder-rename", folder: n }); }}
                    className="size-4 grid place-items-center text-muted-foreground hover:text-foreground">
                    <Pencil className="size-3" />
                  </button>
                  <button title="删除" onClick={(e) => { e.stopPropagation(); setDialog({ kind: "folder-delete", folder: n }); }}
                    className="size-4 grid place-items-center text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
              {isOpen && n.children.length > 0 && renderTree(n.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 pt-5 pb-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">知识库</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="检索文档标题 / 摘要…"
              className="pl-7 h-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => { loadFolders(); loadDocs(); }}>
            <RefreshCcw className="size-3" />刷新
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setDialog({ kind: "folder-new", parent: folders.find((f) => f.id === selectedFolderId) ?? null })}>
            <Plus className="size-3" />新文件夹
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setDialog({ kind: "doc-upload", folder: folders.find((f) => f.id === selectedFolderId) ?? null })}>
            <Upload className="size-3" />上传
          </Button>
        </div>
        {/* 统计区(运营价值)*/}
        <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
          <StatCard icon={FileText} label="总文档" value={stats.totalDocs} accent="text-sky-600 dark:text-sky-400" />
          <StatCard icon={Layers} label="总分片" value={stats.totalChunks} accent="text-violet-600 dark:text-violet-400" />
          <StatCard icon={Sparkles} label="今日新增" value={stats.todayNew} accent="text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={Gauge} label="待索引" value={stats.pendingIndex} accent="text-amber-600 dark:text-amber-400" />
          <StatCard icon={Hash} label="累计命中" value={stats.totalHits} accent="text-rose-600 dark:text-rose-400" />
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 shrink-0">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" /><div>{error}</div>
        </div>
      )}

      {/* 3-pane finder · 三栏各自独立滚(外层 overflow-hidden 锁总高)*/}
      <div className="flex-1 grid grid-cols-[280px_1fr_360px] min-h-0 overflow-hidden divide-x divide-border">
        {/* 左:文件夹树 */}
        <aside className="flex flex-col min-h-0 overflow-hidden bg-muted/20">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">文件夹</span>
            <span className="text-[10px] font-mono text-muted-foreground/60">{folders.length} 个</span>
          </div>
          <Separator className="shrink-0" />
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-2">
              {loading ? (
                <div className="grid place-items-center py-10"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
              ) : tree.length === 0 ? (
                <div className="m-4 rounded-md border border-dashed border-border p-4 text-[11px] text-muted-foreground text-center">
                  尚无文件夹。点上方"新文件夹"开始。
                </div>
              ) : renderTree(tree)}
            </div>
          </div>
          <Separator className="shrink-0" />
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              "px-4 py-2 text-[11px] flex items-center gap-2 hover:bg-muted/60 shrink-0",
              selectedFolderId === null && "bg-muted",
            )}
          >
            <Home className="size-3" />全部文档 ({docs.length})
          </button>
        </aside>

        {/* 中:文档列表 */}
        <section className="flex flex-col min-h-0 overflow-hidden bg-background">
          <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono truncate max-w-[200px]">
              {selectedFolderId ? (folders.find((f) => f.id === selectedFolderId)?.path ?? selectedFolderId) : "全部"}
            </span>
            <span className="text-xs text-muted-foreground">· {visibleDocs.length} 个文档</span>
            <div className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              <ArrowUpDown className="size-3" />
              {([
                { k: "updated", label: "更新" },
                { k: "title", label: "标题" },
                { k: "hits", label: "命中" },
              ] as const).map((s) => (
                <button key={s.k} type="button" onClick={() => setSort(s.k)}
                  className={cn("px-1.5 py-0.5 rounded transition-colors", sort === s.k ? "bg-foreground text-background" : "hover:text-foreground")}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {docsLoading ? (
              <div className="grid place-items-center py-10"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
            ) : visibleDocs.length === 0 ? (
              <div className="m-4 rounded-md border border-dashed border-border p-6 text-xs text-muted-foreground text-center">
                该位置尚无文档。点上方"上传"添加。
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {visibleDocs.slice(0, 200).map((d) => {
                  const isActive = d.id === activeDoc?.id;
                  const tags = tagsToString(d.tags);
                  return (
                    <li key={d.id} className="group">
                      <button
                        type="button"
                        onClick={() => setSelectedDocId(d.id)}
                        className={cn(
                          "w-full text-left px-5 py-3 transition-colors",
                          isActive ? "bg-muted" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate">{d.title || "(无标题)"}</span>
                          {d.module && d.module !== "knowledge" && (
                            <Badge variant="outline" className="text-[9px] font-mono uppercase">{MODULE_LABEL[d.module] ?? d.module}</Badge>
                          )}
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0 flex items-center gap-2">
                            {d.hitCount !== undefined && d.hitCount > 0 && (
                              <span className="flex items-center gap-0.5" title="命中次数"><Hash className="size-2.5" />{d.hitCount}</span>
                            )}
                            {d.chunkCount !== undefined && d.chunkCount > 0 && (
                              <span title="分片数">{d.chunkCount}片</span>
                            )}
                          </span>
                        </div>
                        {d.summary && (
                          <p className={cn("mt-1 text-[11px] leading-relaxed line-clamp-1", isActive ? "text-foreground/80" : "text-muted-foreground")}>
                            {d.summary}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/80 font-mono">
                          <span className="flex items-center gap-0.5" title="最后更新"><Clock className="size-2.5" />{fmtRelCN(d.updatedAt)}</span>
                          {d.qualityScore !== undefined && d.qualityScore > 0 && (
                            <span className="flex items-center gap-0.5" title="质量分"><Gauge className="size-2.5" />{d.qualityScore}</span>
                          )}
                          {d.lastHitAt && (
                            <span className="flex items-center gap-0.5" title="最后命中"><Sparkles className="size-2.5" />{fmtRelCN(d.lastHitAt)}</span>
                          )}
                          {tags.length > 0 && (
                            <span className="flex items-center gap-0.5"><Tag className="size-2.5" />{tags.slice(0, 3).join(",")}{tags.length > 3 && ` +${tags.length - 3}`}</span>
                          )}
                          <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setDialog({ kind: "doc-tags", doc: d }); }}
                              className="px-1.5 py-0.5 rounded border border-border hover:bg-background">标签</span>
                            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); mf.reindexDocument(d.id).then(() => loadDocs()); }}
                              className="px-1.5 py-0.5 rounded border border-border hover:bg-background">重建索引</span>
                            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setDialog({ kind: "doc-delete", doc: d }); }}
                              className="px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600 hover:bg-rose-500/10">删除</span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {visibleDocs.length > 200 && (
                  <li className="px-5 py-3 text-center text-[10px] text-muted-foreground font-mono">
                    显示 200 / 共 {visibleDocs.length} — 请细化搜索
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        {/* 右:详情预览 */}
        <aside className="flex flex-col min-h-0 overflow-hidden bg-muted/20">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">详情预览</span>
            <Eye className="size-3 text-muted-foreground/60" />
          </div>
          <Separator className="shrink-0" />
          <div className="flex-1 overflow-y-auto min-h-0">
            {previewLoading ? (
              <div className="grid place-items-center py-10"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
            ) : activeDoc ? (
              <div className="p-4 space-y-4">
                <div>
                  <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">文档</Badge>
                  <h3 className="mt-2 text-sm font-semibold leading-snug">{activeDoc.title}</h3>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground font-mono flex-wrap">
                    {activeDoc.chunkCount !== undefined && <span>{activeDoc.chunkCount} 分片</span>}
                    {activeDoc.hitCount !== undefined && <span>· 命中 {activeDoc.hitCount}</span>}
                    {activeDoc.qualityScore !== undefined && activeDoc.qualityScore > 0 && <span>· 质量 {activeDoc.qualityScore}</span>}
                    {activeDoc.feedbackCount !== undefined && activeDoc.feedbackCount > 0 && <span>· 反馈 {activeDoc.feedbackCount}</span>}
                    <span>· {fmtDate(activeDoc.updatedAt)}</span>
                  </div>
                </div>

                {activeDoc.summary && (
                  <>
                    <Separator />
                    <section>
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">摘要</h4>
                      <p className="mt-1 text-[11px] text-foreground/80 leading-relaxed">{activeDoc.summary}</p>
                    </section>
                  </>
                )}

                <Separator />
                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">标签</h4>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    {tagsToString(activeDoc.tags).length === 0 ? (
                      <span className="text-[10px] text-muted-foreground italic">无标签</span>
                    ) : (
                      tagsToString(activeDoc.tags).map((t) => (
                        <span key={t} className="text-[10px] font-mono uppercase tracking-wider border border-border/60 rounded px-1.5 py-0.5">{t}</span>
                      ))
                    )}
                  </div>
                </section>

                <Separator />
                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">内容</h4>
                  <div className="mt-2 rounded-md border border-border bg-background p-3 text-[11px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {(activeDoc as any).content ?? "(content 字段未在列表返回,看下方分片)"}
                  </div>
                </section>

                <Separator />
                <section>
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                      分片 ({chunks.length} / {chunksTotal})
                    </h4>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => mf.reindexDocument(activeDoc.id).then(() => mf.getDocumentChunks(activeDoc.id, 200, 0).then((r) => { setChunks(r.chunks ?? []); setChunksTotal(r.total ?? 0); }))}>
                      <RefreshCcw className="size-3" />重建索引
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {chunks.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">无分片</p>
                    ) : chunks.slice(0, 8).map((c) => (
                      <div key={c.id} className="rounded border border-border bg-background px-2 py-1.5 text-[10px] leading-relaxed">
                        <div className="flex items-center justify-between font-mono text-muted-foreground mb-1">
                          <span>分片-{String(c.chunkIndex).padStart(3, "0")} · {c.tokens ?? "?"} tokens</span>
                          {c.heading && <span className="truncate ml-2 text-foreground/60">{c.heading}</span>}
                        </div>
                        <p className="text-foreground/80 line-clamp-3">{c.content}</p>
                      </div>
                    ))}
                    {chunksTotal > 8 && (
                      <p className="text-[10px] text-muted-foreground/60 font-mono text-center pt-1">另 {chunksTotal - 8} 个</p>
                    )}
                  </div>
                </section>

                <Separator />
                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">元信息</h4>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <dt className="text-muted-foreground">ID</dt>
                    <dd className="font-mono truncate">{activeDoc.id}</dd>
                    <dt className="text-muted-foreground">模块</dt>
                    <dd className="font-mono">{MODULE_LABEL[activeDoc.module ?? ""] ?? activeDoc.module ?? "—"}</dd>
                    <dt className="text-muted-foreground">可见性</dt>
                    <dd className="font-mono">{VISIBILITY_LABEL[activeDoc.visibility ?? ""] ?? activeDoc.visibility ?? "—"}</dd>
                    <dt className="text-muted-foreground">版本</dt>
                    <dd className="font-mono">{activeDoc.version ?? "—"} / KB v{activeDoc.kbVersion ?? 1}</dd>
                    {activeDoc.versionGroup && (
                      <>
                        <dt className="text-muted-foreground">版本组</dt>
                        <dd className="font-mono truncate">{activeDoc.versionGroup}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">文件夹</dt>
                    <dd className="font-mono truncate">{activeDoc.folderName ?? activeDoc.folderId ?? "—"}</dd>
                    <dt className="text-muted-foreground">关联 Bot</dt>
                    <dd className="font-mono truncate flex items-center gap-1">
                      <Bot className="size-2.5" />{activeDoc.botId ? activeDoc.botId.slice(0, 8) : "—"}
                    </dd>
                    <dt className="text-muted-foreground">最后命中</dt>
                    <dd className="font-mono">{fmtRelCN(activeDoc.lastHitAt)}</dd>
                    <dt className="text-muted-foreground">创建</dt>
                    <dd className="font-mono">{fmtDate(activeDoc.createdAt)}</dd>
                  </dl>
                </section>
              </div>
            ) : (
              <div className="p-6 text-xs text-muted-foreground">未选中任何文档</div>
            )}
          </div>
        </aside>
      </div>

      {/* dialogs */}
      <KnowledgeDialogs
        state={dialog}
        onClose={() => setDialog({ kind: "none" })}
        onChanged={() => { loadFolders(); loadDocs(); }}
      />
    </div>
  );
}

// ── 统计卡片 ────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
      <Icon className={cn("size-4 shrink-0", accent)} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono truncate">{label}</div>
        <div className="text-sm font-semibold font-mono">{value}</div>
      </div>
    </div>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────
function KnowledgeDialogs({
  state, onClose, onChanged,
}: {
  state: DialogState;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (state.kind === "none") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border border-border rounded-md shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">{dialogTitle(state)}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-4">
          {state.kind === "folder-new" && <FolderNewForm parent={state.parent} onDone={onClose} onChanged={onChanged} />}
          {state.kind === "folder-rename" && <FolderRenameForm folder={state.folder} onDone={onClose} onChanged={onChanged} />}
          {state.kind === "folder-delete" && <FolderDeleteForm folder={state.folder} onDone={onClose} onChanged={onChanged} />}
          {state.kind === "doc-upload" && <DocUploadForm folder={state.folder} onDone={onClose} onChanged={onChanged} />}
          {state.kind === "doc-delete" && <DocDeleteForm doc={state.doc} onDone={onClose} onChanged={onChanged} />}
          {state.kind === "doc-tags" && <DocTagsForm doc={state.doc} onDone={onClose} onChanged={onChanged} />}
        </div>
      </div>
    </div>
  );
}

function dialogTitle(s: DialogState): string {
  switch (s.kind) {
    case "folder-new": return "新建文件夹";
    case "folder-rename": return "重命名文件夹";
    case "folder-delete": return "删除文件夹";
    case "doc-upload": return "上传文档";
    case "doc-delete": return "删除文档";
    case "doc-tags": return "编辑标签 / 模块";
    default: return "";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "mt-0 w-full h-7 rounded border border-border bg-background px-2 text-[11px]";

function FolderNewForm({ parent, onDone, onChanged }: { parent: FolderItem | null; onDone: () => void; onChanged: () => void }) {
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Field label={`父路径: ${parent?.path ?? "/(根)"}`}><div /></Field>
      <Field label="文件夹名">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="如:销售话术 / 北区客户" autoFocus />
      </Field>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true); setErr(null);
            try { await mf.createFolder({ name: name.trim(), parentId: parent?.id ?? null }); onChanged(); onDone(); }
            catch (e: any) { setErr(String(e?.message ?? e)); }
            finally { setSaving(false); }
          }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}创建
        </Button>
      </div>
    </div>
  );
}

function FolderRenameForm({ folder, onDone, onChanged }: { folder: FolderItem; onDone: () => void; onChanged: () => void }) {
  const [name, setName] = React.useState(folder.name);
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="space-y-3">
      <Field label="新名称"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" disabled={!name.trim() || saving}
          onClick={async () => { setSaving(true); try { await mf.patchFolder(folder.id, { name: name.trim() }); onChanged(); onDone(); } finally { setSaving(false); } }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}保存
        </Button>
      </div>
    </div>
  );
}

function FolderDeleteForm({ folder, onDone, onChanged }: { folder: FolderItem; onDone: () => void; onChanged: () => void }) {
  const [mode, setMode] = React.useState<"reassign" | "cascade">("reassign");
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
        将删除 <span className="font-mono">{folder.path}</span> ({folder.docCount ?? 0} 个文档)
      </div>
      <Field label="删除方式">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[11px]">
            <input type="radio" checked={mode === "reassign"} onChange={() => setMode("reassign")} />
            保留(reassign)— 文档与子文件夹上移到父级(推荐)
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="radio" checked={mode === "cascade"} onChange={() => setMode("cascade")} />
            级联(cascade)— 递归删除所有子文档与子文件夹(不可恢复)
          </label>
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button variant="destructive" size="sm" className="h-7 text-[11px] gap-1" disabled={saving}
          onClick={async () => { setSaving(true); try { await mf.deleteFolder(folder.id, mode); onChanged(); onDone(); } finally { setSaving(false); } }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}确认删除
        </Button>
      </div>
    </div>
  );
}

function DocUploadForm({ folder, onDone, onChanged }: { folder: FolderItem | null; onDone: () => void; onChanged: () => void }) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [module, setModule] = React.useState("knowledge");
  const [tagsV, setTags] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Field label={`目标: ${folder?.path ?? "/(根)"}`}><div /></Field>
      <Field label="标题 *"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <Field label="内容 *">
        <textarea className="w-full min-h-[160px] rounded border border-border bg-background p-2 text-[11px] leading-relaxed font-mono resize-y"
          value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="模块">
          <select className={inputCls} value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="knowledge">知识</option>
            <option value="feedback">反馈</option>
            <option value="log">日志</option>
            <option value="other">其他</option>
          </select>
        </Field>
        <Field label="标签(逗号分隔)"><input className={inputCls} value={tagsV} onChange={(e) => setTags(e.target.value)} /></Field>
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" disabled={!title.trim() || !content.trim() || saving}
          onClick={async () => {
            setSaving(true); setErr(null);
            try {
              await mf.uploadDocument({
                title: title.trim(), content,
                folderId: folder?.id ?? null,
                module,
                tags: tagsV.split(",").map((t) => t.trim()).filter(Boolean),
              });
              onChanged(); onDone();
            } catch (e: any) { setErr(String(e?.message ?? e)); }
            finally { setSaving(false); }
          }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}上传 + 切片
        </Button>
      </div>
    </div>
  );
}

function DocDeleteForm({ doc, onDone, onChanged }: { doc: DocumentItem; onDone: () => void; onChanged: () => void }) {
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="space-y-3">
      <p className="text-[12px]">将删除文档 <span className="font-medium">{doc.title}</span> 及其所有分片。不可恢复。</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button variant="destructive" size="sm" className="h-7 text-[11px] gap-1" disabled={saving}
          onClick={async () => { setSaving(true); try { await mf.deleteDocument(doc.id); onChanged(); onDone(); } finally { setSaving(false); } }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}确认
        </Button>
      </div>
    </div>
  );
}

function DocTagsForm({ doc, onDone, onChanged }: { doc: DocumentItem; onDone: () => void; onChanged: () => void }) {
  const [tagsV, setTags] = React.useState(tagsToString(doc.tags).join(", "));
  const [moduleV, setModule] = React.useState(doc.module ?? "knowledge");
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="space-y-3">
      <Field label="标签(逗号分隔)"><input className={inputCls} value={tagsV} onChange={(e) => setTags(e.target.value)} autoFocus /></Field>
      <Field label="模块">
        <select className={inputCls} value={moduleV} onChange={(e) => setModule(e.target.value)}>
          <option value="knowledge">知识</option>
          <option value="feedback">反馈</option>
          <option value="log">日志</option>
          <option value="other">其他</option>
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onDone}>取消</Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await mf.patchDocument(doc.id, {
                tags: tagsV.split(",").map((t) => t.trim()).filter(Boolean),
                module: moduleV,
              });
              onChanged(); onDone();
            } finally { setSaving(false); }
          }}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Tag className="size-3" />}保存
        </Button>
      </div>
    </div>
  );
}
