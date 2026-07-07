// /overview/optimization - 优化建议 (骨架)
import { Sparkles } from "lucide-react";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function OptimizationPage() {
  return (
    <PagePlaceholder
      title="优化建议"
      description="基于使用模式的建议 · prompt / 路由 / 模型选择"
      module="公司综阅 (Overview)"
      route="/overview/optimization"
      actions={
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          P3.3 接入
        </span>
      }
    />
  );
}
