import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";
import type { ReactNode } from "react";

interface PagePlaceholderProps {
  title: string;
  description: string;
  module: string;
  route: string;
  actions?: ReactNode;
}

/**
 * Standard placeholder for IA v6 routes that don't yet have a real implementation.
 * Keeps typography & spacing consistent across the skeleton.
 */
export function PagePlaceholder({ title, description, module, route, actions }: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {actions}
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Construction className="size-4" />
            <CardTitle className="text-base">骨架占位</CardTitle>
          </div>
          <CardDescription>
            此页面为 IA v6 骨架占位,后续由对应业务模块填充。路由已就绪,组件结构清晰。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid grid-cols-2 gap-3 max-w-md">
            <dt className="text-muted-foreground">路由</dt>
            <dd className="font-mono text-xs">{route}</dd>
            <dt className="text-muted-foreground">模块</dt>
            <dd>{module}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
