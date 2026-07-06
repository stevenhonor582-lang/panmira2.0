"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string | null;
  onRun: () => Promise<{ ok: boolean; message: string; latencyMs?: number }>;
}

export function ModelTestDialog({ open, onOpenChange, modelName, onRun }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(
    null,
  );

  const handleRun = async () => {
    setRunning(true);
    try {
      const r = await onRun();
      setResult(r);
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "测试失败" });
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>测试模型调用</DialogTitle>
          <DialogDescription>
            {modelName && (
              <>
                发送一个真实的 ping 请求到 <strong>{modelName}</strong>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">
          {running ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在调用...
            </div>
          ) : result ? (
            <div
              className={`rounded-md border p-3 space-y-2 ${
                result.ok
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    调用成功
                  </>
                ) : (
                  <>
                    <XCircle className="size-4 text-destructive" />
                    调用失败
                  </>
                )}
                {result.latencyMs !== undefined && (
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                    {result.latencyMs} ms
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {result.message}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">点击下方"开始测试"发送请求</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            关闭
          </Button>
          <Button onClick={handleRun} disabled={running}>
            {running && <Loader2 className="size-3.5 animate-spin" />}
            {result ? "重新测试" : "开始测试"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
