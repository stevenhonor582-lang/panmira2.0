// /overview/diagnosis - 系统诊断 (骨架)
import { Stethoscope } from "lucide-react";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function DiagnosisPage() {
  return (
    <PagePlaceholder
      title="系统诊断"
      description="任务失败根因分析 · 链路追踪 · 异常模式识别"
      module="公司综阅 (Overview)"
      route="/overview/diagnosis"
      actions={
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Stethoscope className="size-3" />
          P3.2 接入
        </span>
      }
    />
  );
}
