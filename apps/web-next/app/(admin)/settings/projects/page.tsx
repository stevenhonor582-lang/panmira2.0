"use client";

import Link from "next/link";
import { ArrowLeft, FolderOpen, FileText, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ProjectsSettingsPage() {
  return (
    <div className="space-y-5">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" />
        返回设置
      </Link>

      <header className="flex items-center gap-2">
        <FolderOpen className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className="text-sm text-muted-foreground">项目根目录 + 文件浏览</p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            占位说明
          </CardTitle>
          <CardDescription>文件浏览 + 编辑功能需要后端 /api/projects/* 端点 + 文件系统访问</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>原 ProjectsSection 实现的功能:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>浏览项目根目录(<code className="font-mono text-xs">/api/projects/roots</code>)</li>
            <li>递归目录浏览(<code className="font-mono text-xs">/api/projects/list?dir=...</code>)</li>
            <li>面包屑导航 + 文件预览(<code className="font-mono text-xs">/api/projects/file?path=...</code>)</li>
            <li>项目元信息(modified / size / type icon)</li>
          </ul>
          <p className="pt-2">这些端点目前 <Badge variant="secondary" className="text-[10px] mx-1">未在 admin scope</Badge>,仅 chat 会话使用。</p>
          <p>完整功能在 <Badge variant="outline" className="text-[10px]">聊天工作台</Badge>(web bot 内部集成)。</p>
        </CardContent>
      </Card>

      {/* mock UI 占位 */}
      <Card className="opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">文件浏览器(占位预览)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 font-mono text-xs">
            {["📁 workspace/", "📁 workspace/panmira/", "📁 workspace/nommira/", "📄 README.md", "📄 package.json"].map((p) => (
              <div key={p} className="px-2 py-1 hover:bg-muted/30 rounded">
                {p}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
