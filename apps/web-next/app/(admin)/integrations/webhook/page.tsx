"use client";

import { useState } from "react";
import {
  Webhook,
  ArrowRight,
  Send,
  Loader2,
  Copy,
  Check,
  Code,
  AlertCircle,
  ArrowLeft,
  Server,
  Terminal,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function WebhookIntegrationPage() {
  const [webhookUrl, setWebhookUrl] = useState("https://api.example.com/hooks/wh_abc123demo456");
  const [secret, setSecret] = useState("whsec_a8f3b2c1d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890");
  const [testPayload, setTestPayload] = useState(
    JSON.stringify(
      {
        event: "test.ping",
        message: "hello from CLI",
        bot: "demo-bot",
        input: "你好",
      },
      null,
      2,
    ),
  );
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; body: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  function copy(text: string, kind: "url" | "secret") {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": secret,
        },
        body: testPayload,
      }).catch((e) => ({
        ok: false,
        status: 0,
        body: `CORS / Network 错误(预期,生产环境从服务端调用): ${e instanceof Error ? e.message : String(e)}`,
      }));
      const body = await (res as Response).text().catch(() => "(no body)");
      setTestResult({ ok: (res as { ok: boolean }).ok, status: (res as { status: number }).status, body });
    } catch (e) {
      setTestResult({ ok: false, status: 0, body: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/channels" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        回到 Channel 接入
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Webhook className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Webhook 接入</h1>
          <Badge variant="outline" className="ml-2">Phase 3</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          让外部系统(服务器 / CLI / 自动化脚本)通过 HTTP POST 调用 Agent。
          创建一个 webhook Channel → 拿到 URL + Secret → 在外部系统配置 → 发送即可触发 Agent。
        </p>
      </header>

      {/* 流程图 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">5 步接入流程</CardTitle>
          <CardDescription>从创建到收到 Agent 回复</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <FlowStep
              n={1}
              icon={<Webhook className="size-4 text-primary" />}
              title="创建 Webhook Channel"
              desc='在「Channel 接入」点「🪝 Webhook」快捷按钮,选 webhook 类型,绑定到一个或多个 targetBots(Agent 名称)'
              cta="去创建"
              href="/channels"
            />
            <FlowStep
              n={2}
              icon={<Code className="size-4 text-primary" />}
              title="拿到 URL + Secret"
              desc="系统生成一个唯一的 webhook URL 和 secret token(下面这个页面可以查看 / 测试)"
              cta="看 URL"
              href="#url"
            />
            <FlowStep
              n={3}
              icon={<Server className="size-4 text-primary" />}
              title="在外部系统配置"
              desc="把 URL + Secret 写进你的服务器代码 / 自动化脚本 / n8n / Zapier / GitHub Actions 等"
              cta="看示例"
              href="#examples"
            />
            <FlowStep
              n={4}
              icon={<Send className="size-4 text-primary" />}
              title="外部系统 POST 到 URL"
              desc="HTTP POST 请求: body = JSON {input, bot, event},header 带 X-Webhook-Secret"
              cta="看 payload"
              href="#payload"
            />
            <FlowStep
              n={5}
              icon={<Activity className="size-4 text-primary" />}
              title="触发 Agent → 返回结果"
              desc="后端路由到 targetBot 对应的 Agent,同步或异步执行,把结果以 JSON 返给调用方"
              cta="测试"
              href="#test"
            />
          </ol>
        </CardContent>
      </Card>

      {/* URL + Secret 配置 */}
      <Card id="url">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="size-4 text-primary" />
            当前 webhook 凭证
          </CardTitle>
          <CardDescription>
            这两个值在 Channel 创建时由系统生成 · 用本页测试工具调试
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">回调地址</Label>
            <div className="flex gap-2">
              <Input
                id="wh-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, "url")} title="复制">
                {copied === "url" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-secret">安全令牌</Label>
            <div className="flex gap-2">
              <Input
                id="wh-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={() => copy(secret, "secret")} title="复制">
                {copied === "secret" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              外部请求必须在 header <code className="font-mono">X-Webhook-Secret</code> 带这个值,否则会被拒
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 测试工具 */}
      <Card id="test">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="size-4 text-primary" />
            测试工具
          </CardTitle>
          <CardDescription>
            用这个工具发一个测试请求,看 webhook 是否工作
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="payload">请求 Body (JSON)</Label>
            <textarea
              id="payload"
              rows={8}
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={sendTest} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              发送测试请求
            </Button>
            <p className="text-[11px] text-muted-foreground">
              浏览器调用可能 CORS 失败,生产场景从服务端调用
            </p>
          </div>
          {testResult && (
            <div
              className={`rounded-md border px-3 py-2 text-xs font-mono whitespace-pre-wrap ${
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {testResult.ok ? "✅ 成功" : <><AlertCircle className="size-3" /> 失败</>}
                <span>status: {testResult.status}</span>
              </div>
              {testResult.body}
            </div>
          )}
        </CardContent>
      </Card>

      {/* payload 格式 */}
      <Card id="payload">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">请求 Payload 格式</CardTitle>
          <CardDescription>外部系统 POST 到 webhook URL 的 body 格式</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs font-mono whitespace-pre">
{`{
  "bot": "demo-bot",          // 必填 · targetBots 中存在的 Agent 名称
  "input": "你好, 帮我看看...", // 必填 · 传给 Agent 的初始输入
  "event": "external.trigger", // 可选 · 事件名(用于审计)
  "metadata": {                // 可选 · 自定义透传字段
    "source": "github-actions",
    "run_id": "abc123"
  }
}`}
          </pre>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p><strong className="text-foreground">响应:</strong> 同步模式下返回 Agent 输出的 JSON;异步模式返回 202 + run_id</p>
            <p><strong className="text-foreground">限流:</strong> 默认每 URL 60 次/分钟,超额返回 429</p>
            <p><strong className="text-foreground">安全:</strong> 必须带 <code className="font-mono">X-Webhook-Secret</code> header</p>
          </div>
        </CardContent>
      </Card>

      {/* 代码示例 */}
      <Card id="examples">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">外部系统集成示例</CardTitle>
          <CardDescription>5 种常见调用方式 · 直接复制用</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeExample
            title="curl (CLI)"
            icon={<Terminal className="size-3.5" />}
            code={`curl -X POST "$WEBHOOK_URL" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \\
  -d '{
    "bot": "sales-bot",
    "input": "客户: ABC 公司, 询价 100 件"
  }'`}
          />
          <CodeExample
            title="Node.js (fetch)"
            icon={<Code className="size-3.5" />}
            code={`await fetch(process.env.WEBHOOK_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Webhook-Secret": process.env.WEBHOOK_SECRET,
  },
  body: JSON.stringify({
    bot: "sales-bot",
    input: \`客户: \${customer.name}, 询价 \${qty} 件\`,
    event: "order.created",
  }),
});`}
          />
          <CodeExample
            title="Python (requests)"
            icon={<Code className="size-3.5" />}
            code={`import requests, os
requests.post(
    os.environ["WEBHOOK_URL"],
    headers={"X-Webhook-Secret": os.environ["WEBHOOK_SECRET"]},
    json={
        "bot": "sales-bot",
        "input": f"客户: {customer['name']}, 询价 {qty} 件",
        "event": "order.created",
    },
)`}
          />
          <CodeExample
            title="GitHub Actions"
            icon={<Terminal className="size-3.5" />}
            code={[
              "- name: Notify Agent",
              "  run: |",
              "    curl -X POST \"${{ secrets.PANMIRA_WEBHOOK_URL }}\" \\\\",
              "      -H \"Content-Type: application/json\" \\\\",
              "      -H \"X-Webhook-Secret: ${{ secrets.PANMIRA_WEBHOOK_SECRET }}\" \\\\",
              "      -d '{\"bot\":\"ci-bot\",\"input\":\"构建 #${{ github.run_number }} 成功\"}'",
            ].join("\n")}
          />
          <CodeExample
            title="n8n / Zapier"
            icon={<Terminal className="size-3.5" />}
            code={[
              "# 在 n8n / Zapier 中用 \"HTTP Request\" 节点:",
              "# - Method: POST",
              "# - URL: <你的 webhook URL>",
              "# - Headers: { \"X-Webhook-Secret\": \"<你的 secret>\" }",
              "# - Body (JSON): { \"bot\": \"...\", \"input\": \"...\" }",
            ].join("\n")}
          />
        </CardContent>
      </Card>

      {/* 排错 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">常见错误</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-xs">
            <li>
              <strong className="text-rose-600">401 Unauthorized</strong> · 检查 <code className="font-mono">X-Webhook-Secret</code> header
            </li>
            <li>
              <strong className="text-rose-600">404 Not Found</strong> · webhook URL 拼错,或 Channel 已被删除
            </li>
            <li>
              <strong className="text-rose-600">400 Bad Request</strong> · bot 不在 targetBots 中,或 input 字段缺失
            </li>
            <li>
              <strong className="text-rose-600">429 Too Many Requests</strong> · 超过限流,稍后重试
            </li>
            <li>
              <strong className="text-rose-600">CORS 错误</strong> · 浏览器直调会被 CORS 拦截,要从服务端调
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Link href="/channels">
          <Button variant="outline" className="gap-1.5">
            <ArrowLeft className="size-3.5" />
            回到 Channel 接入
          </Button>
        </Link>
        <Link href="/agents">
          <Button className="gap-1.5">
            先去创建 Agent
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function FlowStep({
  n, icon, title, desc, cta, href,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  href: string;
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
      <Link href={href} className="shrink-0">
        <Button variant="outline" size="sm" className="gap-1">
          {cta}
          <ArrowRight className="size-3" />
        </Button>
      </Link>
    </li>
  );
}

function CodeExample({
  title, icon, code,
}: { title: string; icon: React.ReactNode; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium">{title}</span>
        </div>
        <button
          onClick={() => { void navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="px-3 py-2 text-xs font-mono whitespace-pre overflow-x-auto">{code}</pre>
    </div>
  );
}
