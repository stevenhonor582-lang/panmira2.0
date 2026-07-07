"use client";
import * as React from "react";
import type { WizardForm } from "./form";

const VIS: { v: WizardForm["visibility"]; label: string; hint: string }[] = [
  { v: "private",   label: "仅自己",      hint: "草稿态 · 只你能调" },
  { v: "team",      label: "同组可见",    hint: "默认 · 团队内可调" },
  { v: "workspace", label: "工作区可见",  hint: "整个工作区" },
  { v: "public",    label: "公开",        hint: "可被外部链接调用" },
];

const USERS = ["史德飞", "李清然", "梅小满", "周慎言"];
const BOTS = ["不盈", "墨言", "守静", "得一", "玄鉴"];

export function Step6({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });
  const toggle = (k: "callableBy" | "dispatcher", v: string) => {
    const list = form[k];
    set(k, (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) as WizardForm[typeof k]);
  };

  return (
    <div className="space-y-7">
      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">可见性</h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {VIS.map((v) => {
            const on = form.visibility === v.v;
            return (
              <button
                key={v.v}
                type="button"
                onClick={() => set("visibility", v.v)}
                className={
                  "rounded-2xl bg-card p-4 text-left ring-1 transition-all " +
                  (on ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
              >
                <div className="text-[14px] font-semibold tracking-tight">{v.label}</div>
                <p className="mt-1 text-[12px] text-foreground/65">{v.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          谁能直接调用
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {USERS.map((u) => {
            const on = form.callableBy.includes(u);
            return (
              <Chip key={u} on={on} onClick={() => toggle("callableBy", u)}>
                {u}
              </Chip>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          谁可以调度这个 bot
        </h3>
        <p className="mb-3 text-[12px] text-foreground/55">
          这些 bot 或人在编排链路里可以拉起它。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BOTS.map((b) => {
            const on = form.dispatcher.includes(b);
            return (
              <Chip key={b} on={on} onClick={() => toggle("dispatcher", b)}>
                {b}
              </Chip>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition-all " +
        (on ? "bg-foreground text-background ring-foreground" : "bg-card text-foreground/75 ring-border hover:ring-foreground/30")
      }
    >
      {children}
    </button>
  );
}
