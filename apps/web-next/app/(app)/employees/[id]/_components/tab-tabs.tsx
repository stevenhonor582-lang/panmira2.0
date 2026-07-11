"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bot, BrainCircuit, Wrench, Brain, Network, ListChecks, ScrollText } from "lucide-react";

// R51-B1: HR 岗位只是"配方",没有运行实例,不应该有记忆 / 日志 / 任务 tab
export const ALL_EMPLOYEE_TABS = [
  { value: "basics",   label: "基础信息",  icon: Bot,         forInstance: true,  forTemplate: true  },
  { value: "persona",  label: "人格",      icon: BrainCircuit,forInstance: true,  forTemplate: true  },
  { value: "skills",   label: "技能",      icon: Wrench,      forInstance: true,  forTemplate: true  },
  { value: "memory",   label: "记忆",      icon: Brain,       forInstance: true,  forTemplate: false },
  { value: "collab",   label: "协作",      icon: Network,     forInstance: true,  forTemplate: true  },
  { value: "tasks",    label: "任务",      icon: ListChecks,  forInstance: true,  forTemplate: false },
  { value: "logs",     label: "日志",      icon: ScrollText,  forInstance: true,  forTemplate: false },
] as const;

export type EmployeeTabValue = (typeof ALL_EMPLOYEE_TABS)[number]["value"];

function pickTabs(isTemplate: boolean) {
  return ALL_EMPLOYEE_TABS.filter((t) => (isTemplate ? t.forTemplate : t.forInstance));
}

export function EmployeeTabs({
  defaultValue = "basics",
  isTemplate = false,
  children,
}: {
  defaultValue?: EmployeeTabValue;
  isTemplate?: boolean;
  children: (tab: EmployeeTabValue) => React.ReactNode;
}) {
  const visibleTabs = React.useMemo(() => pickTabs(isTemplate), [isTemplate]);
  const safeDefault: EmployeeTabValue = visibleTabs.some((t) => t.value === defaultValue)
    ? defaultValue
    : "basics";
  const [tab, setTab] = React.useState<EmployeeTabValue>(safeDefault);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as EmployeeTabValue)}
      className="flex flex-col gap-6"
    >
      <div className="-mx-2 overflow-x-auto px-2">
        <TabsList variant="line" className="w-fit min-w-full justify-start">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-1.5">
              <t.icon className="size-3.5" />
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {visibleTabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="outline-none">
          {children(t.value)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
