"use client";
import * as React from "react";
import type { WizardForm, KbFolderInfo, KbInfo } from "./form";
import { Folder, FileText, ChevronRight, ChevronDown, Database, Info, Lock } from "lucide-react";

/**
 * Step 5 — 记忆注入
 * R51-B5: 文件夹视图 — 只保留组织公共区(扁平化)
 *   - 群协作区段去掉(用户原话:'群协作区不要重复')
 *   - 数字员工区段去掉(用户原话:'数字员工 / 海联智达子目录全去掉')
 *   - 整棵树扁平化,只显示组织公共区内容
 */
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
      {/* 三层结构 - 自动注入(B4 保留) */}
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          知识三层结构 · 自动注入
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <LayerCard level="L1" label="短期记忆" desc="24 小时上下文窗口 — 系统自动维护" auto />
          <LayerCard level="L2" label="长期事实" desc="下方勾选的公共知识库 / 文件夹 — 自动索引" auto />
          <LayerCard level="L3" label="永久原则" desc="人格那一步设的铁律 — 自动进入此层" auto />
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-foreground/55">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>三层结构由系统按规则自动维护,你只需要在下方勾选 L2 的知识来源。</span>
        </div>
      </div>

      {/* 公共知识库 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
            <Database className="size-3.5" />
            公共知识库
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-foreground/55">可选</span>
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
            {form.knowledgeBaseIds.length} / {knowledgeBases.length}
          </span>
        </div>
        <div className="mb-3 rounded-xl bg-muted/30 p-3 text-[11.5px] leading-relaxed text-foreground/70 ring-1 ring-border">
          <div className="flex items-start gap-1.5">
            <Lock className="mt-0.5 size-3 shrink-0 text-foreground/45" />
            <div>
              <b className="text-foreground/85">什么是"公共知识库"</b>
              <span className="ml-1">— 组织内全员共享的资料库(产品手册 / 制度文档 / 行业标准)。</span>
              <div className="mt-1">
                勾选后,这位员工在 L2 长期事实里会自动按需检索这些文档;<br />
                后端按你的身份过滤,无权限的不会返回。
              </div>
            </div>
          </div>
        </div>
        {knowledgeBases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
            还没有公共知识库。可以去 知识库管理 创建。
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

      {/* R51-B5: 文件夹视图 — 只保留组织公共区(扁平化) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
            <Folder className="size-3.5" />
            文件夹 · 组织公共区
          </h3>
          <span className="font-mono text-[10.5px] text-foreground/45">
            {countOrgTier(folders)} 个真实节点
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/55">
          数字员工个人库、群组协作库、他人私人库不在这里出现 — 已按权限自动隔离。
        </p>

        {renderOrgBlock({
          folders: folders,
          selected: form.kbFolderIds,
          onToggle: toggleFolder,
        })}
      </section>

      {/* Summary + selected chips */}
      <section className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
            L2 已选注入
          </span>
          <span className="font-mono text-[11px] text-foreground/55">
            公共知识库 {form.knowledgeBaseIds.length} · 文件夹 {form.kbFolderIds.length} · 铁律 {form.ironLaws.length}
          </span>
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-foreground/65">
          <Info className="mt-0.5 size-3 shrink-0 text-foreground/45" />
          <span>
            勾选后,这位员工在 L2 长期事实里会自动按需检索这些文档,
            但 prompt 注入是受控的,不会整本塞进上下文。
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
  auto,
}: {
  level: string;
  label: string;
  desc: string;
  auto?: boolean;
}) {
  return (
    <div className={"rounded-xl p-2.5 ring-1 bg-card ring-foreground/30"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">{level}</span>
          <span className="text-[12.5px] font-semibold">{label}</span>
        </div>
        {auto && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
            自动注入
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-foreground/65">{desc}</p>
    </div>
  );
}

// R51-B5: 只统计组织公共区
function countOrgTier(folders: KbFolderInfo[]): number {
  return folders.filter((f) => (f.accessTier ?? "other") === "organization").length;
}

// R51-B5: 扁平化渲染 — 只显示"组织公共区"
function renderOrgBlock({
  folders,
  selected,
  onToggle,
}: {
  folders: KbFolderInfo[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const orgFolders = folders.filter((f) => (f.accessTier ?? "other") === "organization");
  if (orgFolders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
        组织公共区还没有任何文件夹。
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-emerald-500/25">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder className="size-3.5 text-emerald-600/80 dark:text-emerald-400/80" />
          <span className="text-[12.5px] font-semibold">组织公共区</span>
          <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/55">
            {orgFolders.length}
          </span>
        </div>
        <span className="text-[10.5px] text-foreground/50">全员可见 · 制度 / 模板 / 公告</span>
      </div>
      <FolderTree
        folders={orgFolders}
        selected={selected}
        onToggle={onToggle}
      />
    </div>
  );
}

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
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh"));
    }
    return m;
  }, [folders]);

  const roots = childrenMap.get(null) || [];
  const rootNode = folders.find((f) => f.id === "root" || f.parentId === undefined);
  const effectiveRoots = rootNode ? (childrenMap.get(rootNode.id) || []) : [];
  const allRoots = [...roots, ...effectiveRoots];

  if (allRoots.length === 0 && folders.length > 0) {
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
            {f.docCount != null ? `${f.docCount} 文档` : ""}
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
