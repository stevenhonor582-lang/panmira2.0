"use client";

import Link from "next/link";
import {
  Bot,
  Workflow,
  Activity,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Database,
  Wrench,
  MessageSquare,
  Cog,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlowNav } from "../_components/flow-nav";

const STEPS = [
  { label: "1. 模板", href: "/agents" },
  { label: "2. 编排", href: "/agents/pipelines" },
  { label: "3. 蓝图", href: "/agents/templates" },
];

export default function AgentOnboardingPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <FlowNav steps={STEPS} current="/agents/onboarding" />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">三步搭建一个可执行的 Agent 流程</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Panmira 把"做一个 Agent"拆成三个层次。每一层只关心一件事,组合起来就是一个完整的执行单元。
        </p>
      </header>

      {/* 三层关系图 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">三层关系 (从抽象到具体)</CardTitle>
          <CardDescription>模板 → 编排 → 蓝图。先定义能做什么,再决定怎么串起来,最后落到执行配置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LayerCard
              icon={<Bot className="size-5 text-primary" />}
              title="模板 (Template)"
              subtitle="Agent 定义"
              href="/agents"
              points={[
                "身份 + 能力 + 铁律",
                "可独立被 Channel 路由触发",
                "可绑定 RAG 库 + Skill 地图",
              ]}
              example="得一·销售助手 · 西克·质检员"
            />
            <LayerCard
              icon={<Workflow className="size-5 text-primary" />}
              title="编排 (Pipeline)"
              subtitle="多模板组合"
              href="/agents/pipelines"
              points={[
                "把多个模板串成 DAG",
                "定义节点 + 数据流向",
                "处理订单 / 内容生产流水线",
              ]}
              example="选题 → 写作 → 审核 → 发布"
            />
            <LayerCard
              icon={<Activity className="size-5 text-primary" />}
              title="蓝图 (Blueprint)"
              subtitle="执行配置"
              href="/agents/templates"
              points={[
                "每个 Agent 的执行细节",
                "maxTurns / budget / 重试策略",
                "工具策略 + 边界铁律 JSON",
              ]}
              example="maxTurns:10 · budget:$1.5 · 重试3次"
            />
          </div>
        </CardContent>
      </Card>

      {/* 详细流程图 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">典型使用流程</CardTitle>
          <CardDescription>从零到运行 — 5 个步骤</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <Step
              n={1}
              icon={<Bot className="size-4 text-primary" />}
              title="先做模板"
              desc="为每个角色创建一个 Agent 模板,定义身份 / 系统提示词 / 工具白黑名单"
              href="/agents"
              cta="新建 Agent"
            />
            <Step
              n={2}
              icon={<Database className="size-4 text-primary" />}
              title="(可选) 绑定 RAG 知识库"
              desc='让 Agent 在回答时检索特定领域的知识库。先在「知识库管理」建 KB,再回到 Agent 编辑器绑定'
              href="/knowledge"
              cta="去知识库"
            />
            <Step
              n={3}
              icon={<Wrench className="size-4 text-primary" />}
              title="(可选) 绑定 Skill / MCP"
              desc='Agent 工具调用地图。在「资源池」注册 Skill / MCP,绑定后 Agent 即可调用'
              href="/resources"
              cta="去资源池"
            />
            <Step
              n={4}
              icon={<Workflow className="size-4 text-primary" />}
              title="需要多 Agent 协作?建编排"
              desc='如果业务只用一个 Agent 就能搞定,跳过此步。否则在「多 Agent 编排」拖拽连接多个模板'
              href="/agents/pipelines"
              cta="新建 Pipeline"
            />
            <Step
              n={5}
              icon={<Activity className="size-4 text-primary" />}
              title="调蓝图细节"
              desc='在「蓝图深度编辑器」调整每个 Agent 的执行参数 (maxTurns / budget / 重试) + 工具策略 + 铁律'
              href="/agents/templates"
              cta="调蓝图"
            />
          </ol>
        </CardContent>
      </Card>

      {/* 触发方式 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">完成后如何触发</CardTitle>
          <CardDescription>三种触发路径 — 根据业务场景选择</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TriggerCard
              icon={<MessageSquare className="size-4 text-blue-600" />}
              title="Channel 触发"
              desc="飞书 / 微信 / Telegram / Webhook 收到消息,路由到对应 Agent"
              href="/channels"
            />
            <TriggerCard
              icon={<Cog className="size-4 text-amber-600" />}
              title="定时 / 事件触发"
              desc="cron 定时跑业务,或订阅事件触发(订单创建 / 新客户等)"
              href="/agents/jobs"
            />
            <TriggerCard
              icon={<Rocket className="size-4 text-emerald-600" />}
              title="API / Pipeline 触发"
              desc="外部服务调用 webhook / API,或 Pipeline 内部节点接力"
              href="/integrations/webhook"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/20 p-4">
        <div className="text-sm">
          <p className="font-medium">下一步:从模板开始</p>
          <p className="text-xs text-muted-foreground">
            先定义一个 Agent,后面所有步骤才有起点
          </p>
        </div>
        <Link href="/agents">
          <Button className="gap-1.5">
            去新建 Agent
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="size-3.5" />
            回到 Agent 列表
          </Button>
        </Link>
        <Link href="/agents/pipelines">
          <Button variant="ghost" size="sm" className="gap-1">
            跳到编排
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function LayerCard({
  icon,
  title,
  subtitle,
  href,
  points,
  example,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  points: string[];
  example: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2">
        <span className="size-9 rounded-md bg-primary/10 grid place-items-center">{icon}</span>
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <CheckCircle2 className="size-3 text-emerald-600 shrink-0 mt-0.5" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] font-mono">
        {example}
      </div>
      <Link href={href}>
        <Button variant="outline" size="sm" className="w-full gap-1">
          进入
          <ArrowRight className="size-3" />
        </Button>
      </Link>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
  href,
  cta,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="size-7 grid place-items-center rounded-full bg-muted text-xs font-mono shrink-0">
        {n}
      </span>
      <span className="size-7 grid place-items-center rounded-md bg-muted shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Link href={href}>
        <Button variant="outline" size="sm" className="shrink-0 gap-1">
          {cta}
          <ArrowRight className="size-3" />
        </Button>
      </Link>
    </li>
  );
}

function TriggerCard({
  icon,
  title,
  desc,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-card p-3 space-y-1.5 hover:border-primary/40 transition-colors block"
    >
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-md bg-muted grid place-items-center">{icon}</span>
        <p className="font-medium text-sm">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </Link>
  );
}
