"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { KB_FOLDERS } from "../../_lib/data";
import { Folder, FileText, ChevronRight, ChevronDown } from "lucide-react";

export function Step5({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = (v: string[]) => setForm({ ...form, kbFolders: v });
  const [expanded, setExpanded] = React.useState<string[]>([KB_FOLDERS[0].id]);

  const toggle = (id: string) => {
    const has = form.kbFolders.includes(id);
    set(has ? form.kbFolders.filter((x) => x !== id) : [...form.kbFolders, id]);
  };

  const expandToggle = (id: string) =>
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          知识库 · 树状选择
        </h3>
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          <ul className="divide-y divide-border">
            {KB_FOLDERS.map((f) => {
              const open = expanded.includes(f.id);
              const checked = form.kbFolders.includes(f.id);
              return (
                <li key={f.id}>
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => expandToggle(f.id)}
                      aria-label={open ? "折叠" : "展开"}
                      className="rounded-md p-0.5 text-foreground/45 hover:bg-muted/40"
                    >
                      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </button>
                    <Folder className={`size-4 text-${f.hue}-500`} />
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      className="flex-1 text-left text-[13.5px] font-medium hover:underline"
                    >
                      {f.name}
                    </button>
                    <span className="font-mono text-[10.5px] text-foreground/45">{f.files} files</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(f.id)}
                      className="size-4 accent-foreground"
                    />
                  </div>
                  {open && (
                    <ul className="bg-muted/20 px-4 py-2 space-y-1.5">
                      <Sub>
                        <FileText className="size-3.5 text-foreground/40" />
                        README.md
                      </Sub>
                      <Sub>
                        <FileText className="size-3.5 text-foreground/40" />
                        历史决策 · 12 篇
                      </Sub>
                      <Sub>
                        <FileText className="size-3.5 text-foreground/40" />
                        客户 FAQ · {Math.floor(f.files * 0.6)} 条
                      </Sub>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          已选 · {form.kbFolders.length} 个
        </h3>
        {form.kbFolders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/50">
            还没勾选任何 KB。bot 也能上线,只是没背景知识。
          </div>
        ) : (
          <ul className="space-y-2">
            {form.kbFolders.map((id) => {
              const f = KB_FOLDERS.find((x) => x.id === id)!;
              return (
                <li
                  key={id}
                  className="flex items-center justify-between rounded-2xl bg-card px-4 py-2.5 ring-1 ring-border"
                >
                  <div className="flex items-center gap-2.5">
                    <Folder className={`size-4 text-${f.hue}-500`} />
                    <span className="text-[13.5px] font-medium">{f.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-foreground/45">{f.files} files</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border text-[12px] text-foreground/65">
          勾选 KB 后,这位 bot 在 L2 长期记忆里会自动索引这些文档,
          但 prompt 注入仍是受控的,不会整本塞进上下文。
        </div>
      </section>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 pl-7 text-[12.5px] text-foreground/65">{children}</li>
  );
}
