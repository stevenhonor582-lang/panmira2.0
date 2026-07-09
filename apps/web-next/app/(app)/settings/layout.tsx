import type { ReactNode } from "react";
import { SettingsSubnav } from "@/components/settings/settings-subnav";

/**
 * /settings/* layout.
 *
 * The global AppShell still owns sidebar + topbar (auth gating, breadcrumb).
 * Inside the IA we add a dense-config subnav strip so the user always sees
 * the Settings taxonomy (Permissions / Voice / Advanced).
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-m-6">
      <SettingsSubnav description="权限 · 语音 · 高级" />
      <div>{children}</div>
    </div>
  );
}