"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Search,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  Upload,
  Filter,
  Eye,
  Hash,
  Calendar,
  Layers,
} from "lucide-react";

interface KbNode {
  id: string;
  name: string;
  type: "folder" | "kb" | "doc";
  count?: number;
  children?: KbNode[];
  kb_type?: "industry" | "product" | "competitor" | "solution" | "pricing" | "company" | "department" | "personal";
  updated_at?: string;
  size?: string;
  tags?: string[];
  preview?: string;
}

// Realistic 2526-doc tree
const TREE: KbNode[] = [
  {
    id: "kb-company",
    name: "公司",
    type: "folder",
    children: [
      { id: "kb-c-intro", name: "公司简介", type: "kb", kb_type: "company", count: 12, updated_at: "2026-06-30" },
      { id: "kb-c-policy", name: "内部政策", type: "kb", kb_type: "company", count: 28, updated_at: "2026-07-02" },
      { id: "kb-c-org", name: "组织架构", type: "kb", kb_type: "company", count: 8, updated_at: "2026-05-12" },
      { id: "kb-c-history", name: "公司沿革", type: "kb", kb_type: "company", count: 18, updated_at: "2026-04-08" },
    ],
  },
  {
    id: "kb-product",
    name: "产品",
    type: "folder",
    children: [
      {
        id: "kb-p-metal",
        name: "金属加工件",
        type: "folder",
        children: [
          { id: "kb-p-m-6061", name: "6061-T6 铝板", type: "kb", kb_type: "product", count: 124, updated_at: "2026-07-04" },
          { id: "kb-p-m-304", name: "304 不锈钢", type: "kb", kb_type: "product", count: 87, updated_at: "2026-07-03" },
          { id: "kb-p-m-cu", name: "紫铜 T2", type: "kb", kb_type: "product", count: 56, updated_at: "2026-06-29" },
        ],
      },
      {
        id: "kb-p-fastener",
        name: "紧固件",
        type: "folder",
        children: [
          { id: "kb-p-f-bolt", name: "螺栓 GB/T 5783", type: "kb", kb_type: "product", count: 312, updated_at: "2026-07-06" },
          { id: "kb-p-f-nut", name: "螺母 GB/T 6170", type: "kb", kb_type: "product", count: 184, updated_at: "2026-07-06" },
          { id: "kb-p-f-wash", name: "垫圈 GB/T 97.1", type: "kb", kb_type: "product", count: 96, updated_at: "2026-07-05" },
        ],
      },
      {
        id: "kb-p-bear",
        name: "轴承",
        type: "folder",
        children: [
          { id: "kb-p-b-deep", name: "深沟球轴承 6000", type: "kb", kb_type: "product", count: 218, updated_at: "2026-07-04" },
          { id: "kb-p-b-taper", name: "圆锥滚子 30000", type: "kb", kb_type: "product", count: 142, updated_at: "2026-07-04" },
        ],
      },
    ],
  },
  {
    id: "kb-industry",
    name: "行业",
    type: "folder",
    children: [
      { id: "kb-i-auto", name: "汽车零部件", type: "kb", kb_type: "industry", count: 247, updated_at: "2026-07-05" },
      { id: "kb-i-aero", name: "航空航天", type: "kb", kb_type: "industry", count: 89, updated_at: "2026-06-28" },
      { id: "kb-i-energy", name: "能源装备", type: "kb", kb_type: "industry", count: 156, updated_at: "2026-07-01" },
    ],
  },
  {
    id: "kb-solution",
    name: "解决方案",
    type: "folder",
    children: [
      { id: "kb-s-rfq", name: "RFQ 响应模板", type: "kb", kb_type: "solution", count: 64, updated_at: "2026-07-06" },
      { id: "kb-s-qoute", name: "报价生成器", type: "kb", kb_type: "solution", count: 38, updated_at: "2026-06-30" },
    ],
  },
  {
    id: "kb-competitor",
    name: "竞品",
    type: "folder",
    children: [
      { id: "kb-cmp-a", name: "竞品 A 报价体系", type: "kb", kb_type: "competitor", count: 41, updated_at: "2026-06-22" },
      { id: "kb-cmp-b", name: "竞品 B 服务条款", type: "kb", kb_type: "competitor", count: 28, updated_at: "2026-06-15" },
    ],
  },
  {
    id: "kb-pricing",
    name: "价格表",
    type: "folder",
    children: [
      { id: "kb-pr-2026", name: "2026 主力价目", type: "kb", kb_type: "pricing", count: 86, updated_at: "2026-07-01" },
      { id: "kb-pr-prom", name: "促销政策", type: "kb", kb_type: "pricing", count: 24, updated_at: "2026-06-12" },
    ],
  },
  {
    id: "kb-dept",
    name: "部门",
    type: "folder",
    children: [
      { id: "kb-d-sell", name: "销售部 SOP", type: "kb", kb_type: "department", count: 73, updated_at: "2026-07-06" },
      { id: "kb-d-buy", name: "采购部 SOP", type: "kb", kb_type: "department", count: 91, updated_at: "2026-07-05" },
      { id: "kb-d-ops", name: "运营部 SOP", type: "kb", kb_type: "department", count: 64, updated_at: "2026-06-30" },
    ],
  },
  {
    id: "kb-personal",
    name: "个人",
    type: "folder",
    children: [
      { id: "kb-p-zhang", name: "张总 · 客户笔记", type: "kb", kb_type: "personal", count: 47, updated_at: "2026-07-06" },
      { id: "kb-p-li", name: "李总 · 供应商笔记", type: "kb", kb_type: "personal", count: 32, updated_at: "2026-07-04" },
    ],
  },
];

interface FlatDoc {
  id: string;
  title: string;
  size: string;
  updated: string;
  chunks: number;
  preview: string;
  tags: string[];
}

const KB_DOCS: Record<string, FlatDoc[]> = {
  "kb-p-f-bolt": [
    {
      id: "d-001",
      title: "M5×16 内六角圆柱头螺栓 GB/T 70.1",
      size: "12 KB",
      updated: "2026-07-06",
      chunks: 18,
      tags: ["M5", "内六角", "8.8级"],
      preview:
        "标准 GB/T 70.1-2008 等同 ISO 4762。材料 8.8 级合金钢,表面发黑或镀锌。常用扭矩 5.6 N·m (M5) / 14 N·m (M6)...",
    },
    {
      id: "d-002",
      title: "M6×20 外六角螺栓 GB/T 5783",
      size: "8 KB",
      updated: "2026-07-05",
      chunks: 12,
      tags: ["M6", "外六角", "8.8级"],
      preview: "标准 GB/T 5783-2000 等同 ISO 4014。半螺纹规格,常用长度 12-100 mm。8.8 级抗拉 800 MPa...",
    },
    {
      id: "d-003",
      title: "M8×30 1.4301 不锈钢螺栓",
      size: "6 KB",
      updated: "2026-07-04",
      chunks: 9,
      tags: ["M8", "不锈钢", "A2-70"],
      preview: "材质 1.4301 (304) 不锈钢,A2-70 等级。适用于弱腐蚀工况,不可用于含氯环境...",
    },
    {
      id: "d-004",
      title: "M10×40 12.9 级高强度螺栓",
      size: "10 KB",
      updated: "2026-07-03",
      chunks: 14,
      tags: ["M10", "12.9级", "合金钢"],
      preview: "12.9 级抗拉 1200 MPa,屈服 1100 MPa。常用于机械传动结构,需控制预紧力...",
    },
    {
      id: "d-005",
      title: "M12×50 法兰面螺栓 DIN 6921",
      size: "9 KB",
      updated: "2026-07-02",
      chunks: 11,
      tags: ["M12", "法兰", "DIN"],
      preview: "DIN 6921 标准,带法兰面六角头。提供更大接触面积,适用于薄壁件连接...",
    },
  ],
};

const ALL_FLAT: FlatDoc[] = Object.values(KB_DOCS).flat();

const TYPE_COLOR: Record<string, string> = {
  industry: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  product: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  competitor: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  solution: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  pricing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  company: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  department: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  personal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
};

function FolderTree({
  nodes,
  depth = 0,
  expanded,
  setExpanded,
  selected,
  setSelected,
}: {
  nodes: KbNode[];
  depth?: number;
  expanded: Set<string>;
  setExpanded: (id: string) => void;
  selected: string;
  setSelected: (id: string) => void;
}) {
  return (
    <ul className="text-xs">
      {nodes.map((n) => {
        const isFolder = n.type === "folder";
        const isOpen = expanded.has(n.id);
        const isSelected = selected === n.id;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                if (isFolder) setExpanded(n.id);
                setSelected(n.id);
              }}
              className={cn(
                "w-full flex items-center gap-1 py-1 pr-2 text-left rounded transition-colors",
                "hover:bg-muted/60",
                isSelected && "bg-muted",
              )}
              style={{ paddingLeft: `${depth * 10 + 6}px` }}
            >
              {isFolder ? (
                <>
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 text-muted-foreground/60 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  {isOpen ? (
                    <FolderOpen className="size-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-amber-500/80" />
                  )}
                  <span className="truncate">{n.name}</span>
                  {n.children && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
                      {n.children.reduce((acc, c) => acc + (c.count ?? 0) + (c.children?.length ?? 0), 0)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="w-3" />
                  <Layers className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{n.name}</span>
                  {n.count !== undefined && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">{n.count}</span>
                  )}
                </>
              )}
            </button>
            {isFolder && isOpen && n.children && (
              <FolderTree
                nodes={n.children}
                depth={depth + 1}
                expanded={expanded}
                setExpanded={setExpanded}
                selected={selected}
                setSelected={setSelected}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function KnowledgePage() {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    new Set(["kb-product", "kb-p-fastener"]),
  );
  const [selected, setSelected] = React.useState<string>("kb-p-f-bolt");
  const [view, setView] = React.useState<"list" | "grid">("list");
  const [sort, setSort] = React.useState<"updated" | "title" | "size">("updated");
  const [activeDoc, setActiveDoc] = React.useState<string>(ALL_FLAT[0]?.id ?? "");
  const [query, setQuery] = React.useState("");

  const docs = KB_DOCS[selected] ?? ALL_FLAT;
  const sorted = [...docs].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "size") return parseInt(b.size) - parseInt(a.size);
    return b.updated.localeCompare(a.updated);
  });
  const active = sorted.find((d) => d.id === activeDoc) ?? sorted[0];

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col">
      {/* Header */}
      <header className="px-6 pt-5 pb-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">知识库浏览器</span>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            2526 docs · 8 KBs · grouped
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="跨库全文检索 (chunked) ..."
              className="pl-7 h-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <Filter className="size-3" />
            过滤
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <ArrowUpDown className="size-3" />
            排序
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <div className="flex items-center rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "size-6 grid place-items-center rounded transition-colors",
                  view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="list view"
              >
                <ListIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "size-6 grid place-items-center rounded transition-colors",
                  view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="grid view"
              >
                <LayoutGrid className="size-3" />
              </button>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1">
              <Upload className="size-3" />
              upload
            </Button>
          </div>
        </div>
      </header>

      {/* 3-pane finder */}
      <div className="flex-1 grid grid-cols-[260px_1fr_360px] min-h-0 divide-x divide-border">
        {/* Tree pane */}
        <aside className="flex flex-col min-h-0 bg-muted/20">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              knowledge tree
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {Object.values(KB_DOCS).reduce((a, b) => a + b.length, 0)} shown
            </span>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-2">
              <FolderTree
                nodes={TREE}
                expanded={expanded}
                setExpanded={(id) => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  });
                }}
                selected={selected}
                setSelected={setSelected}
              />
            </div>
          </ScrollArea>
        </aside>

        {/* List pane */}
        <section className="flex flex-col min-h-0 bg-background">
          <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              {selected}
            </span>
            <span className="text-xs text-muted-foreground">· {sorted.length} docs</span>
            <div className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              <span>sort</span>
              {(["updated", "title", "size"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSort(s)}
                  className={cn(
                    "px-1.5 py-0.5 rounded transition-colors",
                    sort === s ? "bg-foreground text-background" : "hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            {view === "list" ? (
              <ul className="divide-y divide-border/60">
                {sorted.map((d) => {
                  const isActive = d.id === activeDoc;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setActiveDoc(d.id)}
                        className={cn(
                          "w-full text-left px-5 py-3 transition-colors",
                          isActive ? "bg-muted" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-3 text-muted-foreground" />
                          <span className="text-xs font-medium truncate">{d.title}</span>
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0">
                            {d.size}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-1 text-[11px] leading-relaxed line-clamp-1",
                            isActive ? "text-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {d.preview}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/80 font-mono">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-2.5" />
                            {d.updated}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="size-2.5" />
                            {d.chunks} chunks
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            {d.tags.map((t) => (
                              <span
                                key={t}
                                className="border border-border/60 rounded px-1.5 py-0.5 text-[9px]"
                              >
                                {t}
                              </span>
                            ))}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-3">
                {sorted.map((d) => {
                  const isActive = d.id === activeDoc;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setActiveDoc(d.id)}
                      className={cn(
                        "text-left rounded-md border p-3 transition-colors",
                        isActive
                          ? "border-foreground/40 bg-muted"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <FileText className="size-3.5 text-muted-foreground" />
                      <p className="mt-1.5 text-xs font-medium leading-snug line-clamp-2">{d.title}</p>
                      <p className="mt-1.5 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {d.preview}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[9px] font-mono text-muted-foreground/80">
                        <span>{d.chunks}ch</span>
                        <span className="ml-auto">{d.updated}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </section>

        {/* Preview pane */}
        <aside className="flex flex-col min-h-0 bg-muted/20">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              preview
            </span>
            <Eye className="size-3 text-muted-foreground/60" />
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            {active ? (
              <div className="p-4 space-y-4">
                <div>
                  <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                    document
                  </Badge>
                  <h3 className="mt-2 text-sm font-semibold leading-snug">{active.title}</h3>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span>{active.size}</span>
                    <span>·</span>
                    <span>{active.chunks} chunks</span>
                    <span>·</span>
                    <span>{active.updated}</span>
                  </div>
                </div>

                <Separator />

                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                    tags
                  </h4>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    {active.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono uppercase tracking-wider border border-border/60 rounded px-1.5 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </section>

                <Separator />

                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                    content
                  </h4>
                  <div className="mt-2 rounded-md border border-border bg-background p-3 text-[11px] leading-relaxed space-y-2 font-mono">
                    <p>{active.preview}</p>
                    <p className="text-muted-foreground">
                      常用扭矩 M5=5.6 N·m, M6=14 N·m, M8=34 N·m, M10=66 N·m (8.8级, 摩擦系数 μ=0.14)。
                    </p>
                    <p className="text-muted-foreground">
                      包装规格 100/盒、500/盒、2000/箱。可定制非标长度 8-300 mm,起订量 1000 支。
                    </p>
                  </div>
                </section>

                <Separator />

                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                    chunks
                  </h4>
                  <div className="mt-2 space-y-1.5">
                    {Array.from({ length: active.chunks }).slice(0, 5).map((_, i) => (
                      <div
                        key={i}
                        className="rounded border border-border bg-background px-2 py-1.5 text-[10px] font-mono leading-relaxed text-muted-foreground"
                      >
                        <span className="text-foreground/60">ch-{i.toString().padStart(3, "0")}</span>
                        <span className="ml-2">embedding 1536d · bm25 ready</span>
                      </div>
                    ))}
                    {active.chunks > 5 && (
                      <p className="text-[10px] text-muted-foreground/60 font-mono text-center pt-1">
                        + {active.chunks - 5} more chunks
                      </p>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                    indexing
                  </h4>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <dt className="text-muted-foreground">embedder</dt>
                    <dd className="font-mono text-right">text-embedding-3-small</dd>
                    <dt className="text-muted-foreground">chunk size</dt>
                    <dd className="font-mono text-right">512</dd>
                    <dt className="text-muted-foreground">overlap</dt>
                    <dd className="font-mono text-right">64</dd>
                    <dt className="text-muted-foreground">last reindex</dt>
                    <dd className="font-mono text-right">{active.updated}</dd>
                  </dl>
                </section>
              </div>
            ) : (
              <div className="p-6 text-xs text-muted-foreground">未选中任何文档</div>
            )}
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}