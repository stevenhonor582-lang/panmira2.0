"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Cpu, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Model, ModelInput } from "./_components/types";

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.baseUrl.toLowerCase().includes(q),
    );
  }, [models, search]);

  // Actions
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
            LLM + Embedding Provider · {models.length} 个
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="size-4" />
          新建模型
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索名称 / 模型 / 端点..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

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
              {search ? "没有匹配的模型" : "还没有模型 — 点右上角创建第一个"}
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
                  <TableHead className="text-right">默认</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => { setDetailModel(m); setDetailOpen(true); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="size-6 rounded bg-blue-500/10 text-blue-500 grid place-items-center">
                          <Cpu className="size-3.5" />
                        </span>
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.type === "llm" ? "default" : "secondary"}>
                        {m.type.toUpperCase()}
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
                    <TableCell className="text-right">
                      {m.isDefault && (
                        <Star className="size-3.5 fill-amber-400 text-amber-400 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
