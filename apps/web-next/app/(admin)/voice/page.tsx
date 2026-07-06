"use client";

import { Mic, AudioLines, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VoicePage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Mic className="size-5 text-muted-foreground" />
          Voice 会话
        </h2>
        <p className="text-sm text-muted-foreground">
          STT + Agent + TTS 实时音视频(spec § 11)
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <AudioLines className="size-4 text-rose-500" />
              <p className="text-xs text-muted-foreground">STT</p>
            </div>
            <p className="text-sm font-medium">火山 / OpenAI Whisper</p>
          </CardContent>
        </Card>
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-blue-500" />
              <p className="text-xs text-muted-foreground">Agent</p>
            </div>
            <p className="text-sm font-medium">Claude / GLM / DeepSeek</p>
          </CardContent>
        </Card>
        <Card className="py-3.5">
          <CardContent className="px-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Mic className="size-4 text-emerald-500" />
              <p className="text-xs text-muted-foreground">TTS</p>
            </div>
            <p className="text-sm font-medium">豆包 / OpenAI / ElevenLabs</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">端点</CardTitle>
          <CardDescription>流式 RPC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Badge variant="outline" className="text-[10px] font-mono">POST /api/voice</Badge>
            <span className="ml-2 text-muted-foreground text-xs">
              STT + Agent + 可选 TTS 一站式流式会话
            </span>
          </div>
          <div>
            <Badge variant="outline" className="text-[10px] font-mono">POST /api/tts</Badge>
            <span className="ml-2 text-muted-foreground text-xs">
              纯文字转语音(不走 Agent)
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            Voice 是 <strong>stream RPC</strong> 接口(POST + 流式返回),
            完整功能需要 <Badge variant="outline" className="text-[10px] mx-1">@volcengine/rtc</Badge> SDK。
          </p>
          <p>
            Admin 后台仅展示配置/状态;实际会话走 mobile / web SDK 客户端。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
