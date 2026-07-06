"use client";

import Link from "next/link";
import { ArrowLeft, Activity, AlertCircle, GitBranch, Layers, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ChainEditorSettingsPage() {
  return (
    <div className="space-y-5">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" />
        返回设置
      </Link>

      <header className="flex items-center gap-2">
        <Activity className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Chain Editor</h2>
          <p className="text-sm text-muted-foreground">链式编辑器(Agent pipeline 编排)</p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            占位说明
          </CardTitle>
          <CardDescription>复杂内部状态编辑器,需要画布 + drag-and-drop 库</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>原 ChainEditor 实现的功能(spec § 14.5 agent 编排器画布):</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>OrchestrationStep(gate / step / intent 节点)</li>
            <li>GateRule(条件路由 + AND/OR/NOT 组合)</li>
            <li>IntentDefinition(意图分类 + 触发词)</li>
            <li>OrchConfig(YAML / JSON 编辑 + 校验)</li>
          </ul>
          <p className="pt-2">
            需要专门的 <Badge variant="outline" className="text-[10px] mx-1">画布 + DnD</Badge> 库(如 react-flow),
            Admin 后台仅展示配置 + 状态。
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="opacity-60">
          <CardContent className="p-4">
            <GitBranch className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Gate</p>
            <p className="text-xs text-muted-foreground mt-1">条件路由节点</p>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="p-4">
            <Layers className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Step</p>
            <p className="text-xs text-muted-foreground mt-1">执行步骤</p>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="p-4">
            <Activity className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Intent</p>
            <p className="text-xs text-muted-foreground mt-1">意图分类</p>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="p-4">
            <ShieldCheck className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Guard</p>
            <p className="text-xs text-muted-foreground mt-1">铁律/守卫</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
