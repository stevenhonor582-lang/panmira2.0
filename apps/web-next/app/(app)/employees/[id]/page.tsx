"use client";

/**
 * /employees/[id] — agent detail page (P7-B2).
 */

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";

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
import { useAgent } from "../_lib/data";

export default function Page() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id ?? "";
  const tab = searchParams?.get("tab") ?? undefined;
  const initial = (tab ?? "basics") as EmployeeTabValue;

  // R51-B1: 模板隐藏记忆 / 日志 / 任务 tab(模板只是"配方",没有运行实例)
  const { agent } = useAgent(id);
  const isTemplate = Boolean(agent?.isTemplate);

  return (
    <div className="space-y-7">
      <AgentHeader id={id} />
      <EmployeeTabs defaultValue={initial} isTemplate={isTemplate}>
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
