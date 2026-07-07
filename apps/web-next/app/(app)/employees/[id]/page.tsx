import { AgentHeader } from "./_components/agent-header";
import { EmployeeTabs } from "./_components/tab-tabs";
import { TabBasics } from "./_components/tab-basics";
import { TabPersona } from "./_components/tab-persona";
import { TabSkills } from "./_components/tab-skills";
import { TabMemory } from "./_components/tab-memory";
import { TabCollab } from "./_components/tab-collab";
import { TabTasks } from "./_components/tab-tasks";
import { TabLogs } from "./_components/tab-logs";
import type { EmployeeTabValue } from "./_components/tab-tabs";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const initial = (tab ?? "basics") as EmployeeTabValue;

  return (
    <div className="space-y-7">
      <AgentHeader id={id} />
      <EmployeeTabs defaultValue={initial}>
        {(active) => {
          switch (active) {
            case "basics":
              return <TabBasics id={id} />;
            case "persona":
              return <TabPersona id={id} />;
            case "skills":
              return <TabSkills id={id} />;
            case "memory":
              return <TabMemory id={id} />;
            case "collab":
              return <TabCollab id={id} />;
            case "tasks":
              return <TabTasks id={id} />;
            case "logs":
              return <TabLogs id={id} />;
            default:
              return null;
          }
        }}
      </EmployeeTabs>
    </div>
  );
}
