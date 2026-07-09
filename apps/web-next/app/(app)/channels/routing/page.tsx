import { redirect } from "next/navigation";

/**
 * /channels/routing — 已内置到大模型页(R29-B)
 *
 * 模型路由(LLM 优先级 + fallback 链) 现在在 /channels/llm 的「模型路由」面板配置。
 * pipeline 路由(按 bot/intent 分流)已下线,保留 URL 仅做向后兼容重定向。
 */
export default function RoutingPage() {
  redirect("/channels/llm");
}
