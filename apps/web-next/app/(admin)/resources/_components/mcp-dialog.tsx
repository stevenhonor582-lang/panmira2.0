"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { McpCreate } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: McpCreate) => Promise<void>;
}

export function McpDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState("http");
  const [authType, setAuthType] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(""); setUrl(""); setTransport("http");
    setAuthType("none"); setApiKey(""); setError(null);
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: McpCreate = { name, url, transport, authType };
      if (apiKey) payload.apiKey = apiKey;
      await onSubmit(payload);
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>新建 MCP Server</DialogTitle>
          <DialogDescription>
            注册一个 MCP server 端点,Agent 可以调用其 tool
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">名称</Label>
            <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="如:github-mcp" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">服务地址</Label>
            <Input id="mcp-url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-transport">传输协议</Label>
              <select id="mcp-transport" value={transport}
                onChange={(e) => setTransport(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-auth">认证方式</Label>
              <select id="mcp-auth" value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="none">无</option>
                <option value="api_key">API Key</option>
                <option value="oauth">OAuth</option>
              </select>
            </div>
          </div>
          {authType === "api_key" && (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-key">API 密钥</Label>
              <Input id="mcp-key" type="text" value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..." />
            </div>
          )}
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
