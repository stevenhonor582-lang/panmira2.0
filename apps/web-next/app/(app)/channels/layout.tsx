import type { ReactNode } from "react";
import { ChannelsSubnav } from "@/components/channels/channels-subnav";

/**
 * /channels/* layout.
 *
 * The global AppShell still owns sidebar + topbar (auth gating, breadcrumb).
 * Inside the IA we add a dense-config subnav strip so the user always sees
 * the inner taxonomy (LLM / Skills / MCP / Endpoints / OAuth / Routing).
 */
export default function ChannelsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-m-6">
      <ChannelsSubnav description="大模型 · 技能地图 · 外部互联 · 访问入口 · 互联授权" />
      <div>{children}</div>
    </div>
  );
}