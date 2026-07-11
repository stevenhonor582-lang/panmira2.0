"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  Code,
  HardDrive,
  Package,
  Plus,
  Search,
  Wrench,
  GitBranch,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { Skill } from "@/lib/channels/types";
import { useFetch } from "@/lib/channels/use-fetch";
import { apiPost, apiDelete, mutate } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/toast-provider";

type SourceFilter = "all" | Skill["source"];

const SOURCE_TONE: Record<Skill["source"], string> = {
  "built-in": "ok",
  github: "info",
  local: "muted",
  custom: "warn",
};

const SOURCE_LABEL: Record<Skill["source"], string> = {
  "built-in": "内置",
  github: "GitHub",
  local: "本地",
  custom: "自定义",
};

const SOURCE_ICON: Record<Skill["source"], React.ComponentType<{ className?: string }>> = {
  "built-in": Package,
  github: Code,
  local: HardDrive,
  custom: Wrench,
};

const PAGE_SIZE = 50;

export default function SkillsPage() {
  const { data, loading, error, refresh } = useFetch<{ skills: Skill[] }>("/api/skills");
  const [q, setQ] = React.useState("");
  const [source, setSource] = React.useState<SourceFilter>("all");
  // R68-2 · 块 7: 三选 checkbox — SDK 主(默认开) + 自研 + 个人限定
  const [scope, setScope] = React.useState({
    sdk: true,    // SDK / built-in(主)
    selfDev: true,// 自研 / custom
    personal: true,// 个人限定(personal_user_id != null)
  });
  const [page, setPage] = React.useState(1);
  const [showInstall, setShowInstall] = React.useState(false);
  const [activeSkill, setActiveSkill] = React.useState<string | null>(null);

  const toast = useToast();
  const skills: Skill[] = data?.skills ?? [];
  const sources: SourceFilter[] = ["all", "built-in", "github", "local", "custom"];

  function flashToast(kind: "ok" | "err", msg: string) {
    if (kind === "ok") toast.success(msg);
    else toast.error(msg);
  }

  const filtered = React.useMemo(() => {
    return skills.filter((s) => {
      if (source !== "all" && s.source !== source) return false;
      // R68-2 · SDK 主、自分、个人限定 三选过滤
      const isSdk = s.source === "built-in" || s.source === "github" || (s as any).scope === "sdk";
      const isSelf = s.source === "custom" || s.source === "local";
      const isPersonal = !!(s as any).personalUserId;
      if (isSdk && !scope.sdk) return false;
      if (isSelf && !scope.selfDev) return false;
      if (isPersonal && !scope.personal) return false;
      if (!q.trim()) return true;
      const t = q.trim().toLowerCase();
      return (
        s.name.toLowerCase().includes(t) ||
        (s.description || "").toLowerCase().includes(t) ||
        (s.tags || []).some((tag) => tag.toLowerCase().includes(t))
      );
    });
  }, [skills, source, q]);

  // Reset page when filter changes
  React.useEffect(() => {
    setPage(1);
  }, [q, source, scope.sdk, scope.selfDev, scope.personal]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // R68-2 · 「SDK 主, 自研次」 — SDK/built-in 排在前
  const ordered = [...filtered].sort((a, b) => {
    const score = (s: Skill) => s.source === "built-in" ? 0 : s.source === "github" ? 1 : s.source === "local" ? 2 : 3;
    return score(a) - score(b);
  });
  const paged = ordered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载中", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }
  if (error?.code === "not_implemented") return <EmptyShell kind="技能" />;
  if (error) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "错误", value: error.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {error.message}
        </div>
      </ChannelsPageShell>
    );
  }

  const enabledCount = skills.filter((s) => s.enabled).length;
  const disabledCount = skills.length - enabledCount;

  function onInstalled(name: string) {
    setShowInstall(false);
    flashToast("ok", `已安装「${name}」`);
    refresh();
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "技能总数", value: skills.length },
            { label: "已启用", value: enabledCount },
            { label: "已禁用", value: disabledCount },
            {
              label: "标签",
              value: Array.from(new Set(skills.flatMap((s) => s.tags || []))).length,
            },
          ]}
          footnote={
            <>
              Skills 是 bot 可调用的最小能力单元。来源区分:内置 / GitHub 拉取 /
              本地 / 自定义。每行显示名称、说明、来源、绑定 bot 数。点击行打开详情抽屉,
              可查看完整说明、使用次数与绑定 bot。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">技能地图</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {filtered.length}/{skills.length}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索 名称 / 说明 / 标签…"
                className="h-8 pl-7 w-60 text-xs"
              />
            </div>
            <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="built-in">内置</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="local">本地</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
            {/* R68-2 · 三选 checkbox: SDK 主 · 自研 · 个人限定 */}
            <div className="flex items-center gap-2.5 text-[11.5px] ml-1">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={scope.sdk} onChange={(e) => setScope((p) => ({ ...p, sdk: e.target.checked }))} className="size-3.5" />
                <span className="font-mono">SDK 主</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={scope.selfDev} onChange={(e) => setScope((p) => ({ ...p, selfDev: e.target.checked }))} className="size-3.5" />
                <span className="font-mono">自研</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={scope.personal} onChange={(e) => setScope((p) => ({ ...p, personal: e.target.checked }))} className="size-3.5" />
                <span className="font-mono">个人限定</span>
              </label>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setShowInstall(true)}>
              <Plus className="size-3.5" />
              新增技能
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={["技能", "说明", "来源", "绑定 bot", "操作"]}
        rows={paged.map((s) => {
          const Icon = SOURCE_ICON[s.source] ?? Inbox;
          const botCount = extractBotCount(s);
          return {
            cells: [
              <button
                key="n"
                type="button"
                onClick={() => setActiveSkill(s.name)}
                className="flex items-center gap-2.5 text-left hover:bg-accent/40 -mx-1 px-1 py-0.5 rounded-sm transition-colors"
              >
                <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                  <Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium font-mono">{s.name}</div>
                  {s.tags && s.tags.length > 0 && (
                    <div className="text-[10px] text-muted-foreground/80 font-mono">
                      {s.tags.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              </button>,
              <div
                key="d"
                className="text-[11.5px] text-muted-foreground max-w-[28rem] truncate"
                title={s.description || ""}
              >
                {s.description || (
                  <span className="italic text-muted-foreground/60">暂无说明</span>
                )}
              </div>,
              <StatusPill
                key="src"
                tone={SOURCE_TONE[s.source] as any}
                label={SOURCE_LABEL[s.source]}
                dot={false}
                className="font-mono"
              />,
              <MonoCell key="bc" className="text-muted-foreground">
                {botCount}
              </MonoCell>,
              <div key="a" className="flex items-center justify-end gap-1">
                {s.enabled ? (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/40" />
                )}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="详情"
                  title="详情"
                  onClick={() => setActiveSkill(s.name)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </div>,
            ],
          };
        })}
        empty={
          q.trim() || source !== "all"
            ? "没有匹配的技能,清空筛选试试。"
            : skills.length === 0
              ? "后端未返回任何技能 · 请检查 skills 目录。"
              : "尚未安装任何技能 · 通过上方 GitHub 仓库或 URL 同步开始。"
        }
      />

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">
            第 {currentPage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="上一页"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="下一页"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>提示</KeyCell>
        <span>点击行或详情按钮打开抽屉 · 启用/禁用按 bot 维度管理</span>
      </div>

      {showInstall && (
        <InstallSkillDialog
          onClose={() => setShowInstall(false)}
          onInstalled={onInstalled}
        />
      )}

      {activeSkill && (
        <SkillDetailDrawer
          skillName={activeSkill}
          onClose={() => setActiveSkill(null)}
          onChanged={() => {
            refresh();
          }}
          onToast={flashToast}
        />
      )}
    </ChannelsPageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function extractBotCount(s: Skill): number {
  // Skill 响应里的 description 有 "Bound to N bot(s)" 格式;tags 里也可能有 bot_binding。
  const m = (s.description || "").match(/Bound to (\d+) bot/i);
  if (m) return Number(m[1]);
  const m2 = (s.description || "").match(/(\d+)\s*agent/i);
  if (m2) return Number(m2[1]);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Install dialog                                                      */
/* ------------------------------------------------------------------ */

type InstallSource = "github" | "url";

function InstallSkillDialog({
  onClose,
  onInstalled,
}: {
  onClose: () => void;
  onInstalled: (name: string) => void;
}) {
  const [src, setSrc] = React.useState<InstallSource>("github");
  const [githubUrl, setGithubUrl] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [skillName, setSkillName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const canInstall =
    src === "github"
      ? githubUrl.trim().length > 0 && /github\.com/i.test(githubUrl)
      : url.trim().startsWith("http");

  async function install() {
    setErr(null);
    if (!canInstall) {
      setErr(src === "github" ? "请填写有效的 GitHub URL" : "请填写有效的 URL");
      return;
    }
    setBusy(true);
    const finalUrl = src === "github" ? githubUrl.trim() : url.trim();
    const body: Record<string, any> = {
      source: src,
      url: finalUrl,
    };
    if (skillName.trim()) body.skillName = skillName.trim();

    const result = await apiPost<{ installed: boolean; name: string; error?: string }>(
      "/api/skills/install",
      body,
    );
    setBusy(false);
    if (!result.ok || !result.data?.installed) {
      setErr(result.error || result.data?.error || "安装失败");
      return;
    }
    onInstalled(result.data.name);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            新增技能
          </DialogTitle>
          <DialogDescription className="text-xs">
            从 GitHub 仓库或任意 URL 安装一个技能。安装后会同步到所有现有 bot 的暂存目录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <SourceTab active={src === "github"} onClick={() => setSrc("github")} icon={GitBranch} label="GitHub" />
            <SourceTab active={src === "url"} onClick={() => setSrc("url")} icon={ExternalLink} label="URL" />
          </div>

          {src === "github" && (
            <Field label="GitHub URL" htmlFor="inst-gh">
              <Input
                id="inst-gh"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/tree/main/skills/xxx"
              />
              <p className="text-[10.5px] text-muted-foreground font-mono">
                支持仓库根、子目录或单文件 URL · 后端会 git clone 或 curl 拉取
              </p>
            </Field>
          )}

          {src === "url" && (
            <Field label="技能文件 URL" htmlFor="inst-url">
              <Input
                id="inst-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/skill.md"
              />
              <p className="text-[10.5px] text-muted-foreground font-mono">
                URL 应直接返回 SKILL.md 文本内容
              </p>
            </Field>
          )}

          <Field label="技能名(可选)" htmlFor="inst-name">
            <Input
              id="inst-name"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              placeholder="留空则从 URL 自动推断"
            />
          </Field>

          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={install} disabled={!canInstall || busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            安装
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ring-1 ring-inset",
        active
          ? "bg-foreground text-background ring-foreground"
          : "bg-transparent text-muted-foreground ring-border hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skill detail drawer                                                 */
/* ------------------------------------------------------------------ */

interface SkillDetail {
  name: string;
  description?: string;
  summary?: string;
  source?: string;
  scope?: string;
  personalUserId?: string | null;
  category?: string;
  version?: string;
  tags?: string[];
  installedAt?: string;
  bots?: string[];
  usage?: {
    totalCalls: number;
    totalSuccess: number;
    avgLatencyMs: number;
    lastUsedAt: string | null;
  };
}

function SkillDetailDrawer({
  skillName,
  onClose,
  onChanged,
  onToast,
}: {
  skillName: string;
  onClose: () => void;
  onChanged: () => void;
  onToast: (kind: "ok" | "err", msg: string) => void;
}) {
  const { data, loading, error } = useFetch<{ name: string; description?: string; summary?: string; source?: string; scope?: string; category?: string; version?: string; tags?: string[]; installedAt?: string; bots?: string[]; usage?: any }>(
    `/api/skills/${encodeURIComponent(skillName)}`,
  );
  const [removing, setRemoving] = React.useState(false);

  const d: SkillDetail = (data as any) ?? { name: skillName };

  async function removeSkill() {
    if (!window.confirm(`确认卸载技能「${skillName}」?绑定此技能的 bot 将失去该能力。`)) return;
    setRemoving(true);
    // 删除需要 admin bot,我们尝试不带 botName 触发后端逻辑。
    const result = await mutate("DELETE", `/api/skills/${encodeURIComponent(skillName)}`, {
      body: {},
      refresh: onChanged,
    });
    setRemoving(false);
    if (result.ok) {
      onToast("ok", `已卸载「${skillName}」`);
      onClose();
    } else {
      onToast("err", result.error ?? "卸载失败(可能需要管理员 bot 身份)");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2 font-mono">
            <Wrench className="size-4 text-muted-foreground" />
            {skillName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            技能详情 · 绑定 bot 与使用情况
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="px-4 py-6">
            <div className="h-32 rounded-md bg-muted/30 animate-pulse" />
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-xs text-rose-600 dark:text-rose-400">
            加载详情失败 · {error.message}
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-4 text-xs">
            <DetailBlock label="说明">
              {d.summary || d.description || (
                <span className="italic text-muted-foreground/60">暂无说明</span>
              )}
            </DetailBlock>

            <div className="grid grid-cols-2 gap-3">
              <DetailKV label="来源" value={SOURCE_LABEL[(d.source as Skill["source"]) ?? "custom"] ?? d.source ?? "—"} />
              <DetailKV label="分类" value={d.category || "—"} />
              <DetailKV label="作用域" value={d.scope || "—"} />
              <DetailKV label="版本" value={d.version || "—"} />
            </div>

            {d.tags && d.tags.length > 0 && (
              <DetailBlock label="标签">
                <div className="flex flex-wrap gap-1">
                  {d.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </DetailBlock>
            )}

            <DetailBlock label="绑定 bot">
              {d.bots && d.bots.length > 0 ? (
                <div className="space-y-1">
                  {d.bots.map((b) => (
                    <div key={b} className="font-mono text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      {b}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="italic text-muted-foreground/60">尚未绑定到任何 bot</span>
              )}
            </DetailBlock>

            {d.usage && (
              <DetailBlock label="使用情况">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">总调用</div>
                    <div className="text-base">{d.usage.totalCalls ?? 0}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">成功</div>
                    <div className="text-base text-emerald-600 dark:text-emerald-400">
                      {d.usage.totalSuccess ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">平均延迟</div>
                    <div className="text-base">{d.usage.avgLatencyMs ?? 0} ms</div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">上次使用</div>
                    <div className="text-[11px]">
                      {d.usage.lastUsedAt ? new Date(d.usage.lastUsedAt).toLocaleString("zh-CN") : "—"}
                    </div>
                  </div>
                </div>
              </DetailBlock>
            )}

            <div className="pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 hover:text-rose-600 hover:border-rose-500/40"
                onClick={removeSkill}
                disabled={removing}
              >
                {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                卸载此技能
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground font-mono text-center">
                卸载需要管理员 bot 身份 · 否则后端会返回 403
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">
        {label}
      </div>
      <div className="text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

function DetailKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">
        {label}
      </div>
      <div className="text-[12px] font-mono">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */

function EmptyShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "后端", value: "未实装" }]}
          footnote={`后端未实装 ${kind} 端点。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Inbox className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          空状态
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。后端上线后刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}
