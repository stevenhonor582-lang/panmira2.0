"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { KBCreate, KBType, KBVisibility } from "./types";

const KB_TYPES: { value: KBType; label: string; desc: string }[] = [
  { value: "industry", label: "行业", desc: "制造业/医疗/教育等专有知识" },
  { value: "product", label: "产品", desc: "公司自家产品手册/SKU" },
  { value: "competitor", label: "竞品", desc: "竞品对比/价格/优劣" },
  { value: "solution", label: "方案", desc: "售前方案/实施案例" },
  { value: "pricing", label: "报价", desc: "标准报价/折扣规则" },
  { value: "company", label: "公司", desc: "公司内部流程/制度/模板" },
  { value: "department", label: "部门", desc: "销售话术/技术 FAQ" },
  { value: "personal", label: "个人", desc: "员工私有笔记" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: KBCreate) => Promise<void>;
}

export function KbDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<KBType>("product");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<KBVisibility>("team");
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(64);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(""); setType("product"); setDescription("");
    setVisibility("team"); setChunkSize(512); setChunkOverlap(64);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name, type, description,
        visibility, chunkSize, chunkOverlap,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新建知识库</DialogTitle>
          <DialogDescription>
            选择 KB 类型 + 可见性 + 分块参数
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如:产品手册 KB"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visibility">可见性</Label>
              <select
                id="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as KBVisibility)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="private">private</option>
                <option value="team">team</option>
                <option value="company">company</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">类型</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as KBType)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {KB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明 KB 用途"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chunkSize">Chunk Size</Label>
              <Input
                id="chunkSize"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                min={64}
                max={2048}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chunkOverlap">Chunk Overlap</Label>
              <Input
                id="chunkOverlap"
                type="number"
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
                min={0}
                max={512}
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
