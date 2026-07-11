"use client";
import * as React from "react";
import type { WizardForm, ChannelBotInfo, Visibility } from "./form";
import { api } from "@/lib/api";
import { Info, FolderCog, Radio, Users, Eye, Lock, X, Search, Check, Plus, AtSign } from "lucide-react";

const VIS: { v: Visibility; label: string; hint: string }[] = [
  { v: "private", label: "私有", hint: "只有我能看到 / 调用 · 草稿态" },
  { v: "team",    label: "团队可见", hint: "默认 · 同工作区成员都能调用" },
  { v: "public",  label: "公开", hint: "可被外部链接 / API 调用" },
];

// 拼音首字母表(与后端 src/db/agent-store.ts:38 同步,217 字)
// 编码成字符串减少行数:pinyinMap[字] = 首字母
const PINYIN_MAP: Record<string, string> = (() => {
  const raw =
    "不:b|盈:y|墨:m|言:y|守:s|静:j|得:d|一:y|玄:x|鉴:j|全:q|栈:z|文:w|案:a|运:y|维:w|替:t|补:b|" +
    "阿:a|艾:a|安:a|奥:a|巴:b|白:b|包:b|宝:b|贝:b|毕:b|薄:b|卜:b|步:b|" +
    "蔡:c|曹:c|岑:c|柴:c|常:c|陈:c|成:c|程:c|迟:c|储:c|崔:c|" +
    "戴:d|邓:d|狄:d|丁:d|董:d|杜:d|段:d|鄂:e|" +
    "樊:f|范:f|方:f|房:f|费:f|冯:f|凤:f|符:f|傅:f|" +
    "高:g|戈:g|葛:g|龚:g|宫:g|巩:g|古:g|谷:g|顾:g|管:g|郭:g|" +
    "哈:h|海:h|韩:h|何:h|贺:h|洪:h|侯:h|胡:h|华:h|黄:h|霍:h|" +
    "嵇:j|吉:j|计:j|季:j|贾:j|江:j|姜:j|蒋:j|金:j|靳:j|经:j|景:j|" +
    "孔:k|寇:k|" +
    "赖:l|兰:l|蓝:l|郎:l|劳:l|雷:l|黎:l|李:l|连:l|廉:l|练:l|梁:l|林:l|凌:l|刘:l|柳:l|龙:l|楼:l|卢:l|鲁:l|陆:l|吕:l|罗:l|骆:l|" +
    "马:m|麻:m|麦:m|毛:m|梅:m|孟:m|莫:m|牟:m|苗:m|闵:m|" +
    "倪:n|宁:n|牛:n|欧:o|" +
    "潘:p|庞:p|裴:p|彭:p|皮:p|蒲:p|" +
    "戚:q|齐:q|钱:q|强:q|乔:q|秦:q|邱:q|屈:q|" +
    "任:r|荣:r|茹:r|阮:r|" +
    "桑:s|沙:s|商:s|邵:s|沈:s|施:s|石:s|史:s|舒:s|宋:s|苏:s|孙:s|隋:s|" +
    "谭:t|汤:t|唐:t|陶:t|田:t|童:t|涂:t|" +
    "万:w|汪:w|王:w|韦:w|魏:w|温:w|翁:w|吴:w|武:w|" +
    "席:x|夏:x|鲜:x|向:x|项:x|萧:x|谢:x|辛:x|徐:x|许:x|薛:x|" +
    "严:y|颜:y|杨:y|姚:y|叶:y|殷:y|于:y|余:y|俞:y|虞:y|元:y|袁:y|岳:y|" +
    "查:z|翟:z|詹:z|张:z|章:z|赵:z|郑:z|钟:z|周:z|朱:z|诸:z|祝:z|邹:z";
  const map: Record<string, string> = {};
  for (const pair of raw.split("|")) {
    const [k, v] = pair.split(":");
    if (k && v) map[k] = v;
  }
  return map;
})();

// 中文名→拼音首字母(不盈→by, 墨言→my);英文/数字原样小写;符号忽略;最多 6 字母
function toPinyinInitials(name: string): string {
  let result = "";
  for (const ch of String(name || "")) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (PINYIN_MAP[ch]) {
      result += PINYIN_MAP[ch];
    }
  }
  return result.slice(0, 6) || "agent";
}

// 预览用:与后端 generateWorkingDir() 同样的规则(/workspace/agents/<slug>-<rand6>)
// 后端保存时若前端没传 workingDir,会自动再生成一次(随机码不同,所以这是预览,不是终值)
function previewWorkingDir(name: string): string {
  const slug = toPinyinInitials(name);
  const rand = Array.from({ length: 6 }, () =>
    "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
  ).join("");
  return `/workspace/agents/${slug}-${rand}`;
}

interface UserOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface AgentChannelBinding {
  id: string;
  name: string;
  channelIds: string[];
}

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

  // 拉用户列表(/api/auth/users)用于 3.4 弹窗选人
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [usersErr, setUsersErr] = React.useState<string>("");
  React.useEffect(() => {
    let alive = true;
    api<{ users?: UserOption[] } | UserOption[]>("/api/auth/users")
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res) ? res : (res?.users || []);
        setUsers(list.filter((u) => !!u.id));
      })
      .catch((e: unknown) => {
        const err = e as { message?: string };
        if (alive) setUsersErr(err?.message || "载入用户失败");
      });
    return () => { alive = false; };
  }, []);

  // 拉所有 agent 用于 3.5.1 入口已占判定(扫描每个 instance 的 channelIds)
  const [bindings, setBindings] = React.useState<AgentChannelBinding[]>([]);
  React.useEffect(() => {
    let alive = true;
    api<{ agents?: { id: string; name: string; channelIds?: string[] }[] } | unknown>(
      "/api/agents",
    )
      .then((res) => {
        if (!alive) return;
        const list = ((res as { agents?: { id: string; name: string; channelIds?: string[] }[] })?.agents || []) as {
          id: string; name: string; channelIds?: string[];
        }[];
        setBindings(
          list.map((a) => ({ id: a.id, name: a.name, channelIds: a.channelIds || [] })),
        );
      })
      .catch(() => { if (alive) setBindings([]); });
    return () => { alive = false; };
  }, []);

  // 弹窗状态
  const [collabOpen, setCollabOpen] = React.useState(false);
  const [entryOpen, setEntryOpen] = React.useState(false);

  // 工作目录预览 — 只读(锁定),只随 name 变化更新(随机码预览)
  const workingDirPreview = React.useMemo(() => previewWorkingDir(form.name || ""), [form.name]);

  // 入口占用查询:botId → { 占用 agent }
  const occupiedByMap = React.useMemo(() => {
    const map = new Map<string, { agentId: string; agentName: string }>();
    for (const a of bindings) {
      for (const bid of a.channelIds) {
        // 当前 wizard 还没提交,所以"自己"还没创建,所有占用都视为他人占用
        map.set(bid, { agentId: a.id, agentName: a.name });
      }
    }
    return map;
  }, [bindings]);

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

      {/* 6b — Who can dispatch / invoke (R66-C: 弹窗选人) */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Users className="size-3.5" /> 谁可以调度 · 多选人员 · 来自 /api/auth/users
        </h3>
        <p className="mb-3 text-[12px] text-foreground/55">
          选中的人员可调度这个员工。保存后写到 orchestration.callableByUsers。
          {usersErr && <span className="ml-2 text-rose-600">({usersErr})</span>}
        </p>
        {form.callableBy.length === 0 ? (
          <button
            type="button"
            onClick={() => setCollabOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-3 text-[12.5px] text-foreground/55 hover:border-foreground/40 hover:text-foreground/75"
          >
            <Plus className="size-3.5" /> 添加可调度人员
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-card p-3 ring-1 ring-border">
            {form.callableBy.map((uid) => {
              const u = users.find((x) => x.id === uid);
              const label = u?.name || uid;
              const sub = u?.email || u?.role || "";
              return (
                <span
                  key={uid}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[12px] ring-1 ring-border"
                >
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold">
                    {label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium">{label}</span>
                  {sub && <span className="text-[10.5px] text-foreground/45">· {sub}</span>}
                  <button
                    type="button"
                    onClick={() => set("callableBy", form.callableBy.filter((x) => x !== uid))}
                    className="text-foreground/45 hover:text-rose-600"
                    aria-label={`移除 ${label}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setCollabOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-[12px] text-foreground/65 hover:bg-foreground/10"
            >
              <Plus className="size-3" /> 添加
            </button>
          </div>
        )}
      </section>

      {/* 6c — 入口绑定(R66-C: 弹窗选入口,已占标注) */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <Radio className="size-3.5 text-rose-600 dark:text-rose-400" />
          入口绑定 · 弹窗选取 · 已占用入口会标注占用人
        </h3>
        <div className="mb-3 flex items-start gap-1.5 rounded-xl bg-rose-500/10 p-3 text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            一个员工可以同时绑定多个入口(例:同一销售助手同时挂飞书 + 企微)。
            绑定后,员工在任一入口被人调用都进入同一个工作目录 →
            <b>员工在飞书和微信里是同一个人,记忆一致</b>。
            入口<b>一对一</b>绑定,已被其他员工占用的入口不可选。
          </span>
        </div>
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
            还没有配置入口。可以去 /channels/endpoints 创建。
          </div>
        ) : form.channelIds.length === 0 ? (
          <button
            type="button"
            onClick={() => setEntryOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-3 text-[12.5px] text-foreground/55 hover:border-foreground/40 hover:text-foreground/75"
          >
            <Plus className="size-3.5" /> 选取入口
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 rounded-2xl bg-card p-3 ring-1 ring-border">
            {form.channelIds.map((bid) => {
              const bot = channels.find((b) => b.agentId === bid);
              const name = bot?.displayName || bot?.name || bid;
              return (
                <span
                  key={bid}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[12px] ring-1 ring-rose-500/30"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />
                  <span className="font-medium">{name}</span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-foreground/45">{bot?.platform}</span>
                  <button
                    type="button"
                    onClick={() => toggleChannel(bid)}
                    className="text-foreground/45 hover:text-rose-600"
                    aria-label={`移除 ${name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setEntryOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-[12px] text-foreground/65 hover:bg-foreground/10"
            >
              <Plus className="size-3" /> 添加入口
            </button>
          </div>
        )}
        <p className="mt-2 font-mono text-[11px] text-foreground/45">
          已绑 {form.channelIds.length} 个入口 · 空闲 {channels.length - occupiedByMap.size} 个
        </p>
      </section>

      {/* 6d — 工作目录 · R66-C 拼音首字母 + 随机码,锁定 */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-tight text-foreground/65">
          <FolderCog className="size-3.5" /> 工作目录 · 系统生成 · 锁定不可改
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={form.name ? workingDirPreview : ""}
            readOnly
            placeholder="填了员工名后,系统自动生成"
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
            员工名(<code className="font-mono">{form.name || "未填"}</code>)
            → 拼音首字母 <code className="font-mono">{toPinyinInitials(form.name || "")}</code>
            → 加 6 位随机码 → 多入口共享此目录,跨入口体验一致。
            <b>禁止中文 / 全角 / 空格 / 特殊字符</b>作为目录名,Claude Code 解析会报错。
          </span>
        </div>
      </section>

      {/* ════════ 弹窗:选择可调度人员 ════════ */}
      {collabOpen && (
        <CollabPickerDialog
          users={users}
          selected={form.callableBy}
          onClose={() => setCollabOpen(false)}
          onConfirm={(ids) => { set("callableBy", ids); setCollabOpen(false); }}
        />
      )}

      {/* ════════ 弹窗:选择入口 ════════ */}
      {entryOpen && (
        <EntryPickerDialog
          channels={channels}
          occupiedByMap={occupiedByMap}
          selected={form.channelIds}
          onClose={() => setEntryOpen(false)}
          onConfirm={(ids) => { set("channelIds", ids); setEntryOpen(false); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 弹窗:选择可调度人员
// ────────────────────────────────────────────────────────────
function CollabPickerDialog({
  users, selected, onClose, onConfirm,
}: {
  users: UserOption[];
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = React.useState<string[]>(selected);
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const filtered = users.filter((u) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (u.name || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s);
  });
  const toggle = (id: string) =>
    setDraft((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="step6-collab-dialog"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
              <Users className="size-4 text-foreground/65" />
              选择可调度人员
            </h3>
            <p className="text-[11.5px] text-foreground/55">
              多选 · 已选 {draft.length} 人 · 来自工作区用户列表
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-foreground/45 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 ring-1 ring-border focus-within:ring-foreground/40">
            <Search className="size-3.5 text-foreground/45" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名 / 邮箱"
              className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {users.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-foreground/55">
              暂无用户。需要 admin / operator 创建用户。
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-foreground/55">
              没有匹配 "{search}" 的用户
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((u) => {
                const on = draft.includes(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors " +
                        (on ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-foreground/[0.03]")
                      }
                    >
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold">
                        {(u.name || u.id).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{u.name || u.id}</span>
                        <span className="block truncate text-[11px] text-foreground/55">
                          {u.email || ""}{u.role ? ` · ${u.role}` : ""}
                        </span>
                      </span>
                      <span className={
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full " +
                        (on ? "bg-foreground text-background" : "ring-1 ring-border")
                      }>
                        {on && <Check className="size-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3">
          <span className="text-[11.5px] text-foreground/55">
            {draft.length > 0 ? `已选 ${draft.length} 人` : "未选"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-background px-3.5 py-2 text-[12.5px] font-medium text-foreground ring-1 ring-border hover:ring-foreground/40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(draft)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-[12.5px] font-medium text-background hover:opacity-90"
            >
              <Check className="size-3.5" />
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 弹窗:选择入口(空闲 vs 已占)
// ────────────────────────────────────────────────────────────
function EntryPickerDialog({
  channels, occupiedByMap, selected, onClose, onConfirm,
}: {
  channels: ChannelBotInfo[];
  occupiedByMap: Map<string, { agentId: string; agentName: string }>;
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = React.useState<string[]>(selected);
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const filtered = channels.filter((b) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (b.displayName || b.name || "").toLowerCase().includes(s) ||
      (b.platform || "").toLowerCase().includes(s);
  });
  const toggle = (bid: string) => {
    const occupied = occupiedByMap.get(bid);
    // 已占用的入口,允许"取消"(如果它就是已选的),但不允许新选
    if (occupied && !draft.includes(bid)) return;
    setDraft((p) => p.includes(bid) ? p.filter((x) => x !== bid) : [...p, bid]);
  };
  const freeCount = channels.filter((b) => !occupiedByMap.has(b.agentId)).length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="step6-entry-dialog"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
              <Radio className="size-4 text-rose-600 dark:text-rose-400" />
              选择入口
            </h3>
            <p className="text-[11.5px] text-foreground/55">
              多选 · 空闲 <b className="text-emerald-600">{freeCount}</b> · 已占 <b className="text-foreground/55">{channels.length - freeCount}</b> · 已选 <b>{draft.length}</b>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-foreground/45 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 ring-1 ring-border focus-within:ring-foreground/40">
            <Search className="size-3.5 text-foreground/45" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索入口名 / 平台"
              className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto px-2 py-2">
          {channels.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-foreground/55">
              还没有配置入口。可以去 /channels/endpoints 创建。
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-foreground/55">
              没有匹配 "{search}" 的入口
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((b) => {
                const on = draft.includes(b.agentId);
                const occupied = occupiedByMap.get(b.agentId);
                const isLocked = !!occupied && !on;
                return (
                  <li key={b.agentId}>
                    <button
                      type="button"
                      onClick={() => toggle(b.agentId)}
                      disabled={isLocked}
                      className={
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors " +
                        (isLocked
                          ? "cursor-not-allowed bg-foreground/[0.02] opacity-50"
                          : on
                            ? "bg-rose-500/5 ring-1 ring-rose-500/30"
                            : "hover:bg-foreground/[0.03]")
                      }
                      title={isLocked ? `已被 ${occupied?.agentName} 占用` : undefined}
                    >
                      <span className={
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full " +
                        (on ? "bg-rose-500 text-white" : "ring-1 ring-border")
                      }>
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium">
                            {b.displayName || b.name}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">
                            {b.platform}
                          </span>
                        </span>
                        {b.remark && (
                          <span className="block truncate text-[11px] text-foreground/55">
                            {b.remark}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0">
                        {occupied ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10.5px] text-foreground/65">
                            <Lock className="size-2.5" />
                            已占:{occupied.agentName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-700 dark:text-emerald-300">
                            空闲
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3">
          <span className="text-[11.5px] text-foreground/55">
            已选 {draft.length} 个入口
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-background px-3.5 py-2 text-[12.5px] font-medium text-foreground ring-1 ring-border hover:ring-foreground/40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(draft)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-[12.5px] font-medium text-background hover:opacity-90"
            >
              <Check className="size-3.5" />
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}