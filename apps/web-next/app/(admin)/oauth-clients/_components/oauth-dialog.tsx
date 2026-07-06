"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { SCOPE_OPTIONS, TYPE_OPTIONS, type OAuthClientCreate, type ClientType } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: OAuthClientCreate) => Promise<{ clientSecret?: string }>;
}

export function OAuthDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ClientType>("web");
  const [redirectText, setRedirectText] = useState("");
  const [scopes, setScopes] = useState<string[]>(["knowledge:read"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [newClientId, setNewClientId] = useState<string | null>(null);

  const reset = () => {
    setName(""); setType("web"); setRedirectText("");
    setScopes(["knowledge:read"]); setError(null);
    setNewSecret(null); setNewClientId(null);
  };

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const redirectUris = redirectText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await onSubmit({ name, type, redirectUris, scopes });
      if (result.clientSecret) {
        setNewSecret(result.clientSecret);
        setNewClientId("已生成");
      }
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  if (newSecret) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="size-4" />
              保存 client_secret — 只显示一次
            </DialogTitle>
            <DialogDescription>
              请立即复制并妥善保存。关闭此弹窗后无法再次查看。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Client ID</Label>
              <Input value={newClientId ?? "—"} readOnly className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client Secret</Label>
              <Input value={newSecret} readOnly className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建 OAuth Client</DialogTitle>
          <DialogDescription>
            选择类型 + redirect URIs + scopes
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="如:prod-web-client" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">类型</Label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value as ClientType)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="redirect">Redirect URIs <span className="text-muted-foreground">(逗号或换行分隔)</span></Label>
            <textarea id="redirect" value={redirectText} onChange={(e) => setRedirectText(e.target.value)}
              placeholder="https://app.example.com/oauth/callback"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <Label>Scopes <span className="text-muted-foreground">(多选)</span></Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-md border border-border bg-muted/20">
              {SCOPE_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)} className="size-3" />
                  {s}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
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
