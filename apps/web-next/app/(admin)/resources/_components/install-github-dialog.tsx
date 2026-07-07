"use client";

import { useState, type FormEvent } from "react";
import { GitBranch, Loader2, CheckCircle2, XCircle, Package } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** skill | mcp | auto(根据 URL 推测) */
  kind: "skill" | "mcp" | "auto";
  onInstalled?: () => void;
}

interface InstallResp {
  installed?: boolean;
  alreadyInstalled?: boolean;
  name?: string;
  path?: string;
  error?: string;
}

function guessKind(url: string): "skill" | "mcp" {
  const u = url.toLowerCase();
  if (/(^|[^a-z])(mcp|server)([^a-z]|$)/.test(u)) return "mcp";
  return "skill";
}

export function InstallGitBranchDialog({ open, onOpenChange, kind, onInstalled }: Props) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InstallResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inferred = kind === "auto" ? guessKind(url) : kind;

  const valid = (() => {
    if (!url.trim()) return false;
    return /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url.trim());
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<InstallResp>("/api/skills/install-from-github", {
        method: "POST",
        body: { githubUrl: url.trim(), skillName: name.trim() || undefined },
      });
      setResult(r);
      if (r.installed && !r.error) {
        setTimeout(() => {
          onInstalled?.();
          onOpenChange(false);
          setUrl(""); setName(""); setResult(null);
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "安装失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-4" />
            从 GitHub 安装 {kind === "auto" ? "Skill / MCP" : kind.toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            粘贴 GitHub 仓库 URL,系统自动识别类型 + 安装到本地 · 例如 https://github.com/user/my-skill
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="ghUrl">GitHub URL</Label>
            <div className="relative">
              <GitBranch className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ghUrl"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/your-org/your-skill"
                className="pl-8 font-mono text-xs"
                autoFocus
                required
              />
            </div>
            {url && valid && (
              <p className="text-[10px] text-muted-foreground">
                自动识别类型 ·{" "}
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Package className="size-2.5" />{inferred === "mcp" ? "MCP Server" : "Skill"}
                </Badge>
              </p>
            )}
            {url && !valid && (
              <p className="text-[10px] text-destructive">URL 格式不正确 · 应为 github.com/owner/repo</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ghName">自定义名称(可选)</Label>
            <Input
              id="ghName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="留空使用仓库默认名"
              className="font-mono text-xs"
            />
          </div>

          {loading && (
            <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              正在从 GitHub 拉取并安装 · 请稍候...
            </div>
          )}

          {result && !loading && (
            <div className={`rounded-md border p-3 space-y-1 ${result.installed ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
              <div className="flex items-center gap-2 text-sm">
                {result.installed ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-amber-600" />
                )}
                <span>
                  {result.installed
                    ? result.alreadyInstalled
                      ? "已存在同名包,跳过安装"
                      : `安装成功 · ${result.name}`
                    : "未完成安装"}
                </span>
              </div>
              {result.path && (
                <p className="text-[10px] font-mono text-muted-foreground">{result.path}</p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
              <XCircle className="size-4" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading || !valid} className="gap-1.5">
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              安装
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
