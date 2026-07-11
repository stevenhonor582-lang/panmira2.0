import Link from "next/link";
import { GitBranch, ArrowRight, Beaker, ShieldCheck, ShieldOff } from "lucide-react";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { RoutingBindingsPanel } from "@/components/channels/routing-bindings-panel";

/**
 * /channels/routing — R51-A 帮助文档:路由策略 + Fallback 关系。
 *
 * 模型路由的实操面板已经从这里(R29-B)合并到 /channels/llm 的「模型路由」面板,
 * 这里保留为术语解释 + 决策表的展示页,避免新用户混淆路由策略 vs Fallback 行为。
 */

export const metadata = {
  title: "路由策略 · Fallback 关系 · Channels",
};

export default function RoutingHelpPage() {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "section", value: "routing-help" },
            { label: "doc-rev", value: "R51-A" },
            { label: "config-panel", value: "/channels/llm" },
          ]}
          footnote={
            <>
              路由配置已内置到{" "}
              <Link href="/channels/llm" className="font-mono underline">
                /channels/llm
              </Link>{" "}
              顶部的「模型路由」面板;本页仅作术语解释与决策参考。
            </>
          }
        />
      }
      toolbar={
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">
            路由策略 · Fallback 关系
          </h2>
          <span className="text-[11px] text-muted-foreground font-mono">
            R51-A · 帮助文档
          </span>
          <Link
            href="/channels/llm"
            className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-primary hover:underline"
          >
            前往配置面板
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      }
    >
      {/* R68-1 · 块 6: 路由规则列表 + 暂停/恢复 (不删,只 disable) */}
      <div className="mb-4">
        <RoutingBindingsPanel />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* 术语解释 */}
        <div className="ring-1 ring-border rounded-sm bg-card/40">
          <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
            <Beaker className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              terms · 术语
            </span>
          </div>
          <div className="p-3 space-y-2 text-[11.5px]">
            <Term
              code="路由策略(启用)"
              body="开启后所有模型进入候选池;每次请求按优先级链顺序尝试首个可用的模型。"
            />
            <Term
              code="不启用路由"
              body="直接使用每个 agent 自己指定的模型;失败不会自动切到备用模型。"
            />
            <Term
              code="Fallback"
              body="主模型调用失败时(超时 / 限流 / 5xx),按优先级链自动尝试下一个模型,直到成功或全部失败。"
            />
            <Term
              code="默认模型(主)"
              body="isDefault = true 的 provider 是主入口,优先级链第 1 位建议放默认模型。"
            />
            <Term
              code="类别(category)"
              body="R51-A 新增字段: llm / embedding / video / audio / rerank / other。路由策略只对同类别生效。"
            />
          </div>
        </div>

        {/* 决策表 */}
        <div className="ring-1 ring-border rounded-sm bg-card/40">
          <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              decision-table · 行为决策表
            </span>
          </div>
          <div className="p-3 space-y-2">
            <table className="w-full text-[11px] ring-1 ring-border rounded-sm overflow-hidden">
              <thead className="bg-muted/40 text-muted-foreground font-mono">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">路由策略</th>
                  <th className="text-left px-2 py-1.5 font-medium">Fallback</th>
                  <th className="text-left px-2 py-1.5 font-medium">实际行为</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <Row
                  routing="on"
                  routingLabel="启用"
                  fallback="on"
                  fallbackLabel="启用"
                  behavior="失败时按优先级链顺序自动切备用"
                  tone="ok"
                />
                <Row
                  routing="on"
                  routingLabel="启用"
                  fallback="off"
                  fallbackLabel="关闭"
                  behavior="失败直接报错,不切备用"
                  tone="warn"
                />
                <Row
                  routing="off"
                  routingLabel="关闭"
                  fallback="on"
                  fallbackLabel="启用"
                  behavior="用 agent 自定模型(Fallback 不生效)"
                  tone="neutral"
                />
                <Row
                  routing="off"
                  routingLabel="关闭"
                  fallback="off"
                  fallbackLabel="关闭"
                  behavior="用 agent 自定模型,失败直接报错"
                  tone="bad"
                />
              </tbody>
            </table>
            <p className="text-[10.5px] text-muted-foreground font-mono flex items-start gap-1.5">
              <ShieldOff className="size-3 mt-0.5 shrink-0" />
              <span>
                注意:路由关闭时 Fallback 开关仅展示,不会改变实际调用路径;只有同时启用两者,失败才会自动切换备用模型。
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 ring-1 ring-border rounded-sm bg-card/40">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
            example · 典型组合
          </span>
        </div>
        <div className="p-3 text-[11.5px] space-y-1.5 text-muted-foreground">
          <p>
            <span className="font-mono text-foreground/85">生产推荐</span>
            : 路由启用 + Fallback 启用。优先级链建议放 2-3 个同类别(category=llm)模型,
            默认模型在前,备用在后。
          </p>
          <p>
            <span className="font-mono text-foreground/85">调试期</span>
            : 路由关闭 + Fallback 关闭。每个 agent 显式指定一个固定模型,失败立刻暴露,便于定位。
          </p>
          <p>
            <span className="font-mono text-foreground/85">混用类别</span>
            : Embedding 类请求走 /api/embeddings 端点,不参与 LLM 路由链;R51-A 的 category 字段决定端点匹配。
          </p>
        </div>
      </div>
    </ChannelsPageShell>
  );
}

function Term({ code, body }: { code: string; body: string }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-foreground/85 text-[12px]">{code}</div>
      <div className="text-muted-foreground leading-relaxed">{body}</div>
    </div>
  );
}

function Row({
  routing,
  routingLabel,
  fallback,
  fallbackLabel,
  behavior,
  tone,
}: {
  routing: "on" | "off";
  routingLabel: string;
  fallback: "on" | "off";
  fallbackLabel: string;
  behavior: string;
  tone: "ok" | "warn" | "neutral" | "bad";
}) {
  const toneCls: Record<typeof tone, string> = {
    ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    neutral: "bg-muted/40 text-muted-foreground",
    bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1.5">
        <span
          className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${
            routing === "on"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {routingLabel}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${
            fallback === "on"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
          }`}
        >
          {fallbackLabel}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10.5px] font-mono ${toneCls[tone]}`}>
          {behavior}
        </span>
      </td>
    </tr>
  );
}