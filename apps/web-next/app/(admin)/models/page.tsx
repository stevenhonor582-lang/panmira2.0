"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Cpu, Star, Image as ImageIcon, Volume2, Video, Mic2, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { ModelDialog } from "./_components/model-dialog";
import { ModelDetailDrawer } from "./_components/model-detail-drawer";
import { ModelDeleteDialog } from "./_components/model-delete-dialog";
import { ModelTestDialog } from "./_components/model-test-dialog";
import { MODEL_TYPE_META, type Model, type ModelInput, type ModelType } from "./_components/types";

const TYPE_ICON: Record<ModelType, typeof Cpu> = {
  llm: Cpu,
  embedding: AudioLines,
  image: ImageIcon,
  audio: Volume2,
  video: Video,
  tts: Mic2,
  stt: AudioLines,
};

const TYPE_TONE: Record<ModelType, string> = {
  llm: "bg-blue-500/10 text-blue-500",
  embedding: "bg-slate-500/10 text-slate-500",
  image: "bg-pink-500/10 text-pink-500",
  audio: "bg-amber-500/10 text-amber-500",
  video: "bg-violet-500/10 text-violet-500",
  tts: "bg-emerald-500/10 text-emerald-500",
  stt: "bg-orange-500/10 text-orange-500",
};

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ModelType | "all">("all");

  // Dialog state
  const [editing, setEditing] = useState<Model | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailModel, setDetailModel] = useState<Model | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<Model | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testModelName, setTestModelName] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ models: Model[] }>("/api/v2/admin/models");
      setModels(data.models ?? []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let arr = models;
    if (typeFilter !== "all") arr = arr.filter((m) => m.type === typeFilter);
    const q = search.toLowerCase().trim();
    if (q) {
      arr = arr.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.baseUrl.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [models, search, typeFilter]);

  const counts = useMemo(() => {
    const out: Record<ModelType | "all", number> = {
      all: models.length, llm: 0, embedding: 0, image: 0, audio: 0, video: 0, tts: 0, stt: 0,
    };
    for (const m of models) out[m.type]++;
    return out;
  }, [models]);

  const handleCreate = async (data: ModelInput) => {
    await api("/api/v2/admin/models", { method: "POST", body: data });
    await load();
  };

  const handleEdit = async (data: ModelInput) => {
    if (!editing) return;
    await api(`/api/v2/admin/models/${editing.id}`, { method: "PATCH", body: data });
    await load();
  };

  const handleDelete = async (model: Model) => {
    await api(`/api/v2/admin/models/${model.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailModel(null);
    await load();
  };

  const handleToggleDefault = async (model: Model) => {
    await api(`/api/v2/admin/models/${model.id}`, {
      method: "PATCH",
      body: { ...model, isDefault: !model.isDefault },
    });
    await load();
  };

  const handleToggleStatus = async (model: Model) => {
    if (model.type === "llm") return;
    await api(`/api/v2/admin/models/${model.id}`, {
      method: "PATCH",
      body: { ...model, status: model.status === "active" ? "disabled" : "active" },
    });
    await load();
  };

  const handleTest = async (model: Model): Promise<{ ok: boolean; message: string; latencyMs?: number }> => {
    setTestModelName(model.name);
    setTestOpen(true);
    const start = Date.now();
    try {
      const res = await api<{ ok: boolean; message?: string; result?: unknown }>(
        `/api/v2/admin/models/${model.id}/test`,
        { method: "POST" },
      );
      return {
        ok: res.ok ?? true,
        message: res.message ?? (typeof res.result === "string" ? res.result : JSON.stringify(res.result ?? {})),
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "调用失败",
        latencyMs: Date.now() - start,
      };
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">模型池</h2>
          <p className="text-sm text-muted-foreground">
            LLM / Embedding / Image / Audio / Video / TTS / STT · 共 {models.length} 个
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="size-4" />
          新建模型
        </Button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索名称 / 模型 / 端点..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as ModelType | "all")}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all" className="gap-1.5">全部 <Badge variant="secondary" className="text-[10px] ml-1">{counts.all}</Badge></TabsTrigger>
          {(Object.keys(MODEL_TYPE_META) as ModelType[]).map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <TabsTrigger key={t} value={t} className="gap-1.5">
                <Icon className="size-3.5" />{MODEL_TYPE_META[t].label}
                <Badge variant="secondary" className="text-[10px] ml-1">{counts[t]}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={typeFilter} className="mt-3">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  {search ? "没有匹配的模型" : "该类型还没有模型 — 点右上角创建第一个"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>模型 ID</TableHead>
                      <TableHead>端点</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>路由</TableHead>
                      <TableHead className="text-right">默认</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((m) => {
                      const Icon = TYPE_ICON[m.type];
                      return (
                        <TableRow
                          key={m.id}
                          className="cursor-pointer"
                          onClick={() => { setDetailModel(m); setDetailOpen(true); }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={`size-6 rounded ${TYPE_TONE[m.type]} grid place-items-center`}>
                                <Icon className="size-3.5" />
                              </span>
                              <span className="font-medium">{m.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={MODEL_TYPE_META[m.type].tone}>
                              {MODEL_TYPE_META[m.type].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{m.model}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                            {m.baseUrl}
                          </TableCell>
                          <TableCell>
                            <Badge variant={m.status === "active" ? "default" : "secondary"}>
                              {m.status === "active" ? "启用" : "停用"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.routingStrategy ? (
                              <Badge variant="outline" className="text-[10px]">{m.routingStrategy}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {m.isDefault && (
                              <Star className="size-3.5 fill-amber-400 text-amber-400 inline" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ModelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={editing ? handleEdit : handleCreate}
      />
      <ModelDetailDrawer
        model={detailModel}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(m) => { setDetailOpen(false); setEditing(m); setDialogOpen(true); }}
        onDelete={(m) => { setDeleting(m); setDeleteOpen(true); }}
        onTest={(m) => handleTest(m)}
        onToggleDefault={handleToggleDefault}
        onToggleStatus={handleToggleStatus}
      />
      <ModelDeleteDialog
        model={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
      <ModelTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        modelName={testModelName}
        onRun={async () => {
          if (!detailModel) return { ok: false, message: "未选择模型" };
          return handleTest(detailModel);
        }}
      />
    </div>
  );
}
