import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新建任务</h1>
        <p className="text-sm text-muted-foreground mt-1">
          用 DAG 画布编排节点、连接、数据流。tldraw v5 已预装。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>DAG 编辑器 · 占位</CardTitle>
          <CardDescription>
            tldraw 包已安装,后续任务接入。当前页面保留卡片布局便于替换。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="mb-3">下一步:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>动态导入 <code className="font-mono text-xs">tldraw</code> + 自定义 node / edge schema</li>
            <li>绑定后端 <code className="font-mono text-xs">/api/v2/admin/pipelines</code></li>
            <li>支持保存草稿 / 发布 / 模板复用</li>
          </ul>
        </CardContent>
      </Card>
      <PagePlaceholder
        title="任务配置表单"
        description="编辑器右侧抽屉 · 节点参数 · 触发器 · 调度"
        module="任务协作 (Tasks)"
        route="/tasks/new"
      />
    </div>
  );
}
