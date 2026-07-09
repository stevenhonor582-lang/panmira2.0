"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bot, BrainCircuit, Wrench, Brain, Network, ListChecks, ScrollText } from "lucide-react";

export const EMPLOYEE_TABS = [
  { value: "basics",   label: "基础信息",  icon: Bot },
  { value: "persona",  label: "人格",      icon: BrainCircuit },
  { value: "skills",   label: "技能",      icon: Wrench },
  { value: "memory",   label: "记忆",      icon: Brain },
  { value: "collab",   label: "协作",      icon: Network },
  { value: "tasks",    label: "任务",      icon: ListChecks },
  { value: "logs",     label: "日志",      icon: ScrollText },
] as const;

export type EmployeeTabValue = (typeof EMPLOYEE_TABS)[number]["value"];

export function EmployeeTabs({
  defaultValue = "basics",
  children,
}: {
  defaultValue?: EmployeeTabValue;
  children: (tab: EmployeeTabValue) => React.ReactNode;
}) {
  const [tab, setTab] = React.useState<EmployeeTabValue>(defaultValue);
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as EmployeeTabValue)}
      className="flex flex-col gap-6"
    >
      <div className="-mx-2 overflow-x-auto px-2">
        <TabsList variant="line" className="w-fit min-w-full justify-start">
          {EMPLOYEE_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-1.5">
              <t.icon className="size-3.5" />
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {EMPLOYEE_TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="outline-none">
          {children(t.value)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
