"use client";
import * as React from "react";
import type { WizardForm, ChannelBotInfo, Visibility } from "./form";
import { Info, FolderCog, Radio, Users, Eye, Lock } from "lucide-react";

const VIS: { v: Visibility; label: string; hint: string }[] = [
  { v: "private", label: "私有", hint: "只有我能看到 / 调用 · 草稿态" },
  { v: "team",    label: "团队可见", hint: "默认 · 同工作区成员都能调用" },
  { v: "public",  label: "公开", hint: "可被外部链接 / API 调用" },
];

export function Step6({
  form,
  setForm,
  channels,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  channels: ChannelBotInfo[];
}) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  const toggleChannel = (agentId: string) => {
    const has = form.channelIds.includes(agentId);
    set("channelIds", has ? form.channelIds.filter((x) => x !== agentId) : [...form.channelIds, agentId]);
  };

  // Default working dir proposal based on name (lazy-initialized once)
  React.useEffect(() => {
    if (form.workingDir) return;
    const slug = (form.name || "").trim();
    if (!slug) return;
    set("workingDir", `/workspace/agents/${slug}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  return (
    <div className="space-y-7">
      {/* 6a — Visibility */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Eye className="size-3.5" /> 可见性 · 谁能用这个员工
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-3">
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
                <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/65">{v.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6b — Who can dispatch / invoke */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Users className="size-3.5" /> 谁可以调度 · 自由文本添加(目前没有 user 表)
        </h3>
        <p className="mb-3 text-[12px] text-foreground/55">
          可填用户名 / 邮箱 / 角色。这些值会保存到 orchestration.callableByUsers,
          未来对接 user 表后可改为多选。
        </p>
        <CallableEditor
          values={form.callableBy}
          onChange={(arr) => set("callableBy", arr)}
          placeholder="例:史德飞 / 张三 / 销售部"
        />
      </section>

      {/* 6c — 入口绑定(原"频道绑定")— R34-B 改名 */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Radio className="size-3.5 text-rose-600 dark:text-rose-400" />
          入口绑定 · 一个员工可绑多个入口 · 来自 /api/bots
        </h3>
        <div className="mb-3 flex items-start gap-1.5 rounded-xl bg-rose-500/10 p-3 text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            一个员工可以同时绑定多个入口(例:同一销售助手同时挂飞书 + 企微)。
            绑定后,员工在任一入口被人调用都进入同一个工作目录 →
            <b>员工在飞书和微信里是同一个人,记忆一致</b>。
          </span>
        </div>
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
            还没有配置入口。可以去 /channels/endpoints 创建。
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {channels.map((bot) => {
              const on = form.channelIds.includes(bot.agentId);
              return (
                <li key={bot.agentId}>
                  <label
                    className={
                      "flex cursor-pointer items-start gap-2.5 rounded-2xl bg-card p-3.5 ring-1 transition-all " +
                      (on ? "ring-rose-500/50 bg-rose-500/5" : "ring-border hover:ring-foreground/30")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleChannel(bot.agentId)}
                      className="mt-0.5 size-4 accent-rose-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13.5px] font-semibold tracking-tight">
                          {bot.displayName || bot.name}
                        </span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                          {bot.platform}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-foreground/65 line-clamp-2">
                        {bot.remark || bot.name}
                      </p>
                      {bot.workingDirectory && (
                        <p className="mt-1 font-mono text-[10.5px] text-foreground/45 truncate">
                          {bot.workingDirectory}
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 font-mono text-[11px] text-foreground/45">
          已绑 {form.channelIds.length} 个入口
        </p>
      </section>

      {/* 6d — Working directory · R34-B 系统生成 + 锁定(关闭手动编辑) */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <FolderCog className="size-3.5" /> 工作目录 · 系统生成 · 多入口共享
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={form.workingDir}
            readOnly
            placeholder="/workspace/agents/<员工名>(保存时由系统生成)"
            className="w-full rounded-xl bg-muted/40 px-4 py-3 font-mono text-[13px] ring-1 ring-border cursor-not-allowed text-foreground/70"
            aria-label="工作目录(系统生成,只读)"
          />
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground/5 px-2 py-1.5 text-[10.5px] font-mono text-foreground/55">
            <Lock className="size-3" />
            锁定
          </span>
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-foreground/65">
          <Info className="mt-0.5 size-3 shrink-0 text-foreground/45" />
          <span>
            员工的所有记录(对话/文件/记忆)都存在这一个目录,由系统按员工名自动生成,不可手动修改。
            多个入口绑同一个员工时,共享这个目录 → 跨入口体验一致。
            默认规则:<span className="font-mono">/workspace/agents/&lt;员工名&gt;</span>。
          </span>
        </div>
      </section>
    </div>
  );
}

// Lightweight chip-based editor for the callableBy string list.
function CallableEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = React.useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (values.includes(v)) { setInput(""); return; }
    onChange([...values, v]);
    setInput("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 rounded-xl bg-background px-3.5 py-2 text-[13px] ring-1 ring-border focus:outline-none focus:ring-foreground/40"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-xl bg-foreground px-3.5 py-2 text-[12.5px] font-medium text-background hover:opacity-90"
        >
          添加
        </button>
      </div>
      {values.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12px] ring-1 ring-border"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-foreground/45 hover:text-rose-600"
                aria-label={`移除 ${v}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
