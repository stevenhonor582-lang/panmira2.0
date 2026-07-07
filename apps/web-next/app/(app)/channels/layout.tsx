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
      <ChannelsSubnav description="provider · sandbox · mcp · endpoints · oauth · routing" />
      <div>{children}</div>
    </div>
  );
}