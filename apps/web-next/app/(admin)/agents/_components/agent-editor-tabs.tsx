"use client";

import { useEffect, useState } from "react";
import {
  Database,
  Wrench,
  Plus,
  Trash2,
  Search,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

// ============ Types ============

interface KnowledgeBase {
  id: string;
  name: string;
  type: string;
  description: string;
  documentCount: number;
  indexStatus: string;
}

interface SkillResource {
  id: string;
  name: string;
  kind: "skill" | "mcp";
  description: string;
  enabled: boolean;
}

interface Agent {
  id: string;
  orchestration?: { kbRefs?: string[]; skillRefs?: string[]; mcpRefs?: string[] };
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

// ============ RAG 库 Tab ============

interface RagTabProps {
  agent: Agent;
  onChange: (next: Agent) => void;
}

export function AgentRagTab({ agent, onChange }: RagTabProps) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const boundIds = new Set(agent.orchestration?.kbRefs ?? []);

  useEffect(() => {
    setLoading(true);
    api<ApiEnvelope<KnowledgeBase[]>>("/api/v2/admin/knowledge-bases")
      .then((r) => setKbs(r.data ?? []))
      .catch(() => setKbs([]))
      .finally(() => setLoading(false));
  }, []);

  const bound = kbs.filter((k) => boundIds.has(k.id));
  const available = kbs.filter((k) => !boundIds.has(k.id));

  function bind(id: string) {
    const refs = new Set(agent.orchestration?.kbRefs ?? []);
    refs.add(id);
    onChange({
      ...agent,
      orchestration: { ...(agent.orchestration ?? {}), kbRefs: [...refs] },
    });
  }

  function unbind(id: string) {
    const refs = (agent.orchestration?.kbRefs ?? []).filter((x) => x !== id);
    onChange({
      ...agent,
      orchestration: { ...(agent.orchestration ?? {}), kbRefs: refs },
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Database className="size-3.5 text-primary" />
                RAG 知识库绑定
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                让 Agent 检索这些知识库的内容来回答问题。检索时会按绑定顺序查询,首个命中即用。
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              添加 KB
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : bound.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
              还没绑定任何 KB · 点右上角"添加 KB"选择知识库
            </div>
          ) : (
            <div className="space-y-2">
              {bound.map((k, idx) => (
                <div
                  key={k.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="size-7 grid place-items-center rounded bg-primary/10 text-primary text-[11px] font-mono">
                    #{idx + 1}
                  </span>
                  <Database className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      <Badge variant="outline" className="text-[10px] mr-1">{k.type}</Badge>
                      {k.documentCount} 文档 · {k.indexStatus}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => unbind(k.id)}
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RagPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kbs={available}
        onPick={bind}
      />
    </div>
  );
}

function RagPickerDialog({
  open,
  onOpenChange,
  kbs,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kbs: KnowledgeBase[];
  onPick: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = kbs.filter(
    (k) =>
      !search.trim() ||
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      k.type.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加知识库</DialogTitle>
          <DialogDescription>
            选择要绑定到这个 Agent 的 RAG 知识库。可一次添加多个。
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 KB 名称 / 类型..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            暂无可绑定的 KB · 先去
            <a href="/knowledge" className="ml-1 text-primary hover:underline">
              知识库管理
            </a>
            创建
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((k) => (
              <button
                key={k.id}
                onClick={() => onPick(k.id)}
                className="w-full text-left flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Database className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{k.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {k.description || "—"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{k.type}</Badge>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {k.documentCount}
                </Badge>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Skill 地图 Tab ============

interface SkillTabProps {
  agent: Agent;
  onChange: (next: Agent) => void;
}

export function AgentSkillTab({ agent, onChange }: SkillTabProps) {
  const [skills, setSkills] = useState<SkillResource[]>([]);
  const [mcps, setMcps] = useState<SkillResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<"skill" | "mcp">("skill");

  const boundSkillIds = new Set(agent.orchestration?.skillRefs ?? []);
  const boundMcpIds = new Set(agent.orchestration?.mcpRefs ?? []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<ApiEnvelope<SkillResource[]>>("/api/v2/admin/skills").catch(() => ({ data: [] })),
      api<ApiEnvelope<SkillResource[]>>("/api/v2/admin/mcps").catch(() => ({ data: [] })),
    ])
      .then(([s, m]) => {
        setSkills(s.data ?? []);
        setMcps(m.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  function bind(kind: "skill" | "mcp", id: string) {
    const key = kind === "skill" ? "skillRefs" : "mcpRefs";
    const refs = new Set((agent.orchestration?.[key] as string[] | undefined) ?? []);
    refs.add(id);
    onChange({
      ...agent,
      orchestration: { ...(agent.orchestration ?? {}), [key]: [...refs] },
    });
  }

  function unbind(kind: "skill" | "mcp", id: string) {
    const key = kind === "skill" ? "skillRefs" : "mcpRefs";
    const refs = ((agent.orchestration?.[key] as string[] | undefined) ?? []).filter(
      (x) => x !== id,
    );
    onChange({
      ...agent,
      orchestration: { ...(agent.orchestration ?? {}), [key]: refs },
    });
  }

  const boundSkills = skills.filter((s) => boundSkillIds.has(s.id));
  const boundMcps = mcps.filter((s) => boundMcpIds.has(s.id));
  const availableSkills = skills.filter((s) => !boundSkillIds.has(s.id));
  const availableMcps = mcps.filter((s) => !boundMcpIds.has(s.id));

  return (
    <div className="space-y-4">
      <SkillGroup
        title="Skill"
        description="内嵌技能 (代码可调用的原子能力, 如 search_web, send_email)"
        bound={boundSkills}
        onAdd={() => { setPickerKind("skill"); setPickerOpen(true); }}
        onRemove={(id) => unbind("skill", id)}
        loading={loading}
        icon={<Wrench className="size-3.5 text-primary" />}
      />

      <SkillGroup
        title="MCP"
        description="Model Context Protocol 服务 (外部工具协议, 如 GitHub MCP, DB MCP)"
        bound={boundMcps}
        onAdd={() => { setPickerKind("mcp"); setPickerOpen(true); }}
        onRemove={(id) => unbind("mcp", id)}
        loading={loading}
        icon={<LinkIcon className="size-3.5 text-primary" />}
      />

      <SkillPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={pickerKind}
        items={pickerKind === "skill" ? availableSkills : availableMcps}
        onPick={(id) => bind(pickerKind, id)}
      />
    </div>
  );
}

function SkillGroup({
  title,
  description,
  bound,
  onAdd,
  onRemove,
  loading,
  icon,
}: {
  title: string;
  description: string;
  bound: SkillResource[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-1.5">
              {icon}
              {title}
            </CardTitle>
            <CardDescription className="text-xs mt-1">{description}</CardDescription>
          </div>
          <Button size="sm" onClick={onAdd} className="gap-1.5">
            <Plus className="size-3.5" />
            添加
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : bound.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            未绑定任何 {title}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {bound.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <Wrench className="size-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{s.description}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRemove(s.id)}
                  className="size-6 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillPickerDialog({
  open,
  onOpenChange,
  kind,
  items,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "skill" | "mcp";
  items: SkillResource[];
  onPick: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter(
    (s) =>
      !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加 {kind === "skill" ? "Skill" : "MCP"}</DialogTitle>
          <DialogDescription>
            选择可被 Agent 调用的 {kind === "skill" ? "Skill 技能" : "MCP 服务"}。
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`搜索 ${kind}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            暂无可添加的 {kind} · 先去
            <a href="/resources" className="ml-1 text-primary hover:underline">
              资源池
            </a>
            注册
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className="w-full text-left flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Wrench className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{s.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
