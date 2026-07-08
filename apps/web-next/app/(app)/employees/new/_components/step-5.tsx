"use client";
import * as React from "react";
import type { WizardForm, KbFolderInfo, KbInfo } from "./form";
import { Folder, FileText, ChevronRight, ChevronDown, Database, Info } from "lucide-react";

export function Step5({
  form,
  setForm,
  folders,
  knowledgeBases,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  folders: KbFolderInfo[];
  knowledgeBases: KbInfo[];
}) {
  const toggleFolder = (id: string) => {
    const has = form.kbFolderIds.includes(id);
    setForm({
      ...form,
      kbFolderIds: has ? form.kbFolderIds.filter((x) => x !== id) : [...form.kbFolderIds, id],
    });
  };
  const toggleKb = (id: string) => {
    const has = form.knowledgeBaseIds.includes(id);
    setForm({
      ...form,
      knowledgeBaseIds: has ? form.knowledgeBaseIds.filter((x) => x !== id) : [...form.knowledgeBaseIds, id],
    });
  };

  return (
    <div className="space-y-7">
      {/* Three-layer explanation */}
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          知识三层结构 · 公共记忆
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <LayerCard level="L1" label="短期记忆" desc="24h 上下文窗口,自动维护,无需选" disabled />
          <LayerCard level="L2" label="长期事实" desc="下方勾选 KB / 文件夹 → 注入此层" />
          <LayerCard level="L3" label="永久原则" desc="Step 3 设置的 iron_laws 自动入此层" disabled />
        </div>
      </div>

      {/* KB level */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Database className="size-3.5" />
          公共知识库 · 来自 /api/v2/admin/knowledge-bases ({knowledgeBases.length} 个真实可用)
        </h3>
        {knowledgeBases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
            还没有公共知识库。可以去 /foundation/knowledge 创建。
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {knowledgeBases.map((kb) => {
              const on = form.knowledgeBaseIds.includes(kb.id);
              return (
                <li key={kb.id}>
                  <label
                    className={
                      "flex cursor-pointer items-start gap-2.5 rounded-2xl bg-card p-3.5 ring-1 transition-all " +
                      (on ? "ring-foreground" : "ring-border hover:ring-foreground/30")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleKb(kb.id)}
                      className="mt-0.5 size-4 accent-foreground"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold tracking-tight">{kb.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-foreground/55">
                        {kb.id === "00000000-0000-0000-0000-000000000001" ? "默认库" : "自定义库"}
                        {kb.documentCount != null && ` · ${kb.documentCount} 文档`}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Folders level — tree builder */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Folder className="size-3.5" />
          文件夹 · 来自 /api/knowledge/folders ({folders.length} 个真实节点 · 可选更细粒度)
        </h3>
        <FolderTree
          folders={folders}
          selected={form.kbFolderIds}
          onToggle={toggleFolder}
        />
      </section>

      {/* Summary + selected chips */}
      <section className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
            已选注入
          </span>
          <span className="font-mono text-[11px] text-foreground/55">
            {form.knowledgeBaseIds.length} KB · {form.kbFolderIds.length} folders · {form.ironLaws.length} iron laws
          </span>
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-foreground/65">
          <Info className="mt-0.5 size-3 shrink-0 text-foreground/45" />
          <span>
            勾选后,这位员工在 L2 长期记忆里会自动索引这些文档,
            但 prompt 注入仍是受控的,不会整本塞进上下文。
          </span>
        </div>
      </section>
    </div>
  );
}

function LayerCard({
  level,
  label,
  desc,
  disabled,
}: {
  level: string;
  label: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <div className={"rounded-xl p-2.5 ring-1 " + (disabled ? "bg-muted/40 ring-border opacity-70" : "bg-card ring-foreground/30")}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">{level}</span>
        <span className="text-[12.5px] font-semibold">{label}</span>
      </div>
      <p className="mt-1 text-[11px] text-foreground/65">{desc}</p>
    </div>
  );
}

// Build a parent → children map and render top-level nodes recursively.
function FolderTree({
  folders,
  selected,
  onToggle,
}: {
  folders: KbFolderInfo[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const childrenMap = React.useMemo(() => {
    const m = new Map<string | null, KbFolderInfo[]>();
    for (const f of folders) {
      const key = f.parentId ?? null;
      const arr = m.get(key) || [];
      arr.push(f);
      m.set(key, arr);
    }
    // Sort children by name for stable display
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh"));
    }
    return m;
  }, [folders]);

  const roots = childrenMap.get(null) || [];
  // If "root" is itself a node (id="root"), surface its children as top-level too.
  const rootNode = folders.find((f) => f.id === "root" || f.parentId === undefined);
  const effectiveRoots = rootNode ? (childrenMap.get(rootNode.id) || []) : [];
  const allRoots = [...roots, ...effectiveRoots];

  if (allRoots.length === 0 && folders.length > 0) {
    // Fallback: surface everything as flat list
    return (
      <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
        {folders.slice(0, 50).map((f) => (
          <FolderRow key={f.id} f={f} depth={0} selected={selected} onToggle={onToggle} childrenMap={childrenMap} />
        ))}
      </ul>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
      {allRoots.slice(0, 50).map((f) => (
        <FolderRow key={f.id} f={f} depth={0} selected={selected} onToggle={onToggle} childrenMap={childrenMap} />
      ))}
    </ul>
  );
}

function FolderRow({
  f,
  depth,
  selected,
  onToggle,
  childrenMap,
}: {
  f: KbFolderInfo;
  depth: number;
  selected: string[];
  onToggle: (id: string) => void;
  childrenMap: Map<string | null, KbFolderInfo[]>;
}) {
  const [open, setOpen] = React.useState(depth < 1);
  const children = childrenMap.get(f.id) || [];
  const on = selected.includes(f.id);
  const isRoot = f.id === "root";
  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "折叠" : "展开"}
            className="rounded-md p-0.5 text-foreground/45 hover:bg-muted/40"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <FileText className="size-3.5 text-foreground/35" />
        )}
        {!isRoot && <Folder className="size-4 text-foreground/55" />}
        {!isRoot && (
          <button
            type="button"
            onClick={() => onToggle(f.id)}
            className="flex-1 truncate text-left text-[13px] font-medium hover:underline"
            title={f.path || f.name}
          >
            {f.name}
          </button>
        )}
        {isRoot && <span className="flex-1 truncate font-mono text-[11px] text-foreground/45">{f.name}</span>}
        {!isRoot && (
          <span className="font-mono text-[10.5px] text-foreground/45">
            {f.docCount != null ? `${f.docCount} docs` : ""}
          </span>
        )}
        {!isRoot && (
          <input
            type="checkbox"
            checked={on}
            onChange={() => onToggle(f.id)}
            className="size-4 accent-foreground"
          />
        )}
      </div>
      {open && children.length > 0 && (
        <ul className="divide-y divide-border/50 border-t border-border/50">
          {children.slice(0, 100).map((c) => (
            <FolderRow
              key={c.id}
              f={c}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
              childrenMap={childrenMap}
            />
          ))}
          {children.length > 100 && (
            <li className="px-3 py-1.5 text-center font-mono text-[10.5px] text-foreground/45">
              还有 {children.length - 100} 个子节点未显示
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
