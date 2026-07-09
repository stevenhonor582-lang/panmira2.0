"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/channels/status-pill";
import {
  SettingsPageShell,
  SettingsMeta,
} from "@/components/settings/settings-shell";
import {
  Mic,
  Volume2,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Save,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";

/**
 * /settings/voice — TTS voice configuration for the current tenant.
 *
 * Two configuration surfaces (one per persona):
 *  - 真人 (human)  — voice_id for outbound human-voice messages
 *  - 数字员工      — voice_id for digital-employee voice replies
 *
 * Each surface lets the admin set:
 *  - voice_provider (local / openai / elevenlabs / edge)
 *  - voice_id       (string id)
 *  - sample_rate    (16000 / 22050 / 24000 / 44100)
 *
 * Test button calls `POST /api/tts` with the current config + a fixed
 * sample phrase, returns success/failure pill. Voice config itself is
 * stored in localStorage (this is per-browser admin preference; backend
 * does not yet have a voice_settings table — flagged in handoff §遗留).
 */

type Persona = "human" | "digital";
type Provider = "local" | "openai" | "elevenlabs" | "edge";

interface VoiceConfig {
  provider: Provider;
  voiceId: string;
  sampleRate: 16000 | 22050 | 24000 | 44100;
  language: "zh-CN" | "en-US" | "ja-JP";
}

const DEFAULT_CONFIG: Record<Persona, VoiceConfig> = {
  human: { provider: "edge", voiceId: "zh-CN-XiaoxiaoNeural", sampleRate: 24000, language: "zh-CN" },
  digital: { provider: "local", voiceId: "de-dora-v2", sampleRate: 22050, language: "zh-CN" },
};

const STORAGE_KEY = "panmira.voice.config.v1";

const PROVIDER_OPTIONS: { value: Provider; label: string; hint: string }[] = [
  { value: "local", label: "Local", hint: "内置 · panmira-tts v2" },
  { value: "openai", label: "OpenAI", hint: "tts-1 · alloy/echo/..." },
  { value: "elevenlabs", label: "ElevenLabs", hint: "voices API" },
  { value: "edge", label: "Edge", hint: "Microsoft Edge TTS · Neural" },
];

interface TestResult {
  ok: boolean;
  message: string;
  at: string;
}

interface PersonaState {
  config: VoiceConfig;
  saved: boolean;
  testing: boolean;
  lastResult: TestResult | null;
}

export default function VoicePage() {
  const [persona, setPersona] = React.useState<Persona>("human");
  const [human, setHuman] = React.useState<PersonaState>(() => ({
    config: DEFAULT_CONFIG.human,
    saved: false,
    testing: false,
    lastResult: null,
  }));
  const [digital, setDigital] = React.useState<PersonaState>(() => ({
    config: DEFAULT_CONFIG.digital,
    saved: false,
    testing: false,
    lastResult: null,
  }));

  // Load saved config from localStorage on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        human?: VoiceConfig;
        digital?: VoiceConfig;
      };
      if (parsed.human) setHuman((s) => ({ ...s, config: parsed.human!, saved: true }));
      if (parsed.digital) setDigital((s) => ({ ...s, config: parsed.digital!, saved: true }));
    } catch {
      /* ignore */
    }
  }, []);

  const current = persona === "human" ? human : digital;
  const setCurrent = persona === "human" ? setHuman : setDigital;

  function update<K extends keyof VoiceConfig>(
    key: K,
    value: VoiceConfig[K],
  ) {
    setCurrent((s) => ({
      ...s,
      config: { ...s.config, [key]: value },
      saved: false,
    }));
  }

  function save() {
    const next = {
      human: human.config,
      digital: digital.config,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    setHuman((s) => ({ ...s, saved: true }));
    setDigital((s) => ({ ...s, saved: true }));
  }

  function reset() {
    setCurrent({
      config: DEFAULT_CONFIG[persona],
      saved: false,
      testing: false,
      lastResult: null,
    });
  }

  async function runTest() {
    setCurrent((s) => ({ ...s, testing: true }));
    const phrase =
      persona === "human"
        ? "您好,我是史德飞,本次电话来自 Panmira 数字员工平台。"
        : "任务已完成,共处理 17 条记录,失败 0 条。";
    try {
      await api("/api/tts", {
        method: "POST",
        body: {
          text: phrase,
          provider: current.config.provider,
          voice_id: current.config.voiceId,
          sample_rate: current.config.sampleRate,
          language: current.config.language,
        },
      });
      setCurrent((s) => ({
        ...s,
        testing: false,
        lastResult: {
          ok: true,
          message: `TTS OK · ${current.config.provider} · ${current.config.voiceId}`,
          at: new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      setCurrent((s) => ({
        ...s,
        testing: false,
        lastResult: {
          ok: false,
          message: e?.message ?? "TTS 失败",
          at: new Date().toISOString(),
        },
      }));
    }
  }

  return (
    <SettingsPageShell
      meta={
        <SettingsMeta
          items={[
            { label: "persona", value: persona === "human" ? "真人" : "数字员工" },
            { label: "provider", value: current.config.provider },
            { label: "voice_id", value: <span className="font-mono">{current.config.voiceId}</span> },
            { label: "rate", value: `${current.config.sampleRate / 1000}k` },
            { label: "lang", value: current.config.language },
            { label: "saved", value: current.saved ? "yes" : "draft" },
          ]}
          footnote={
            <>
              语音配置存于 <code className="font-mono">localStorage</code>,
              key 为 <code className="font-mono">{STORAGE_KEY}</code>。
              后端 voice_settings 表尚未建(详见 handoff)。
              测试调用 <code className="font-mono">POST /api/tts</code>。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              语音 / TTS
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              tts · {persona}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={persona}
              onValueChange={(v) => setPersona(v as Persona)}
            >
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human">真人 · outbound</SelectItem>
                <SelectItem value="digital">数字员工 · reply</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={reset}
            >
              <RotateCcw className="size-3.5" />
              重置
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={save}
              disabled={human.saved && digital.saved}
            >
              <Save className="size-3.5" />
              保存
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Config form */}
        <div className="ring-1 ring-border rounded-sm bg-card/40">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              配置 · {persona}
            </div>
          </div>
          <div className="p-3 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="v-prov" className="text-xs">
                Voice provider
              </Label>
              <Select
                value={current.config.provider}
                onValueChange={(v) => update("provider", v as Provider)}
              >
                <SelectTrigger id="v-prov">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-baseline gap-2">
                        <span>{p.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {p.hint}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="v-id" className="text-xs">
                Voice id
              </Label>
              <Input
                id="v-id"
                value={current.config.voiceId}
                onChange={(e) => update("voiceId", e.target.value)}
                placeholder="例:zh-CN-XiaoxiaoNeural"
                className="font-mono"
              />
              <p className="text-[10.5px] text-muted-foreground leading-snug">
                {persona === "human"
                  ? "Edge: zh-CN-XiaoxiaoNeural · OpenAI: alloy/echo/..."
                  : "Local: de-dora-v2 / de-li-v1"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="v-rate" className="text-xs">
                  Sample rate
                </Label>
                <Select
                  value={String(current.config.sampleRate)}
                  onValueChange={(v) =>
                    update(
                      "sampleRate",
                      Number(v) as VoiceConfig["sampleRate"],
                    )
                  }
                >
                  <SelectTrigger id="v-rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16000">16 kHz · 窄带</SelectItem>
                    <SelectItem value="22050">22.05 kHz · 通用</SelectItem>
                    <SelectItem value="24000">24 kHz · 推荐</SelectItem>
                    <SelectItem value="44100">44.1 kHz · 高保真</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-lang" className="text-xs">
                  Language
                </Label>
                <Select
                  value={current.config.language}
                  onValueChange={(v) =>
                    update("language", v as VoiceConfig["language"])
                  }
                >
                  <SelectTrigger id="v-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">中文(简体)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="ja-JP">日本語</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Test panel */}
        <div className="ring-1 ring-border rounded-sm bg-card/40">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              试听
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              POST /api/tts
            </span>
          </div>
          <div className="p-3 grid gap-3">
            <div className="rounded-sm ring-1 ring-border bg-muted/30 px-3 py-2 text-[12px] leading-snug">
              <div className="flex items-center gap-1.5 mb-1">
                <Volume2 className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  sample phrase
                </span>
              </div>
              <div className="font-mono text-[11.5px]">
                {persona === "human"
                  ? "「您好,我是史德飞,本次电话来自 Panmira 数字员工平台。」"
                  : "「任务已完成,共处理 17 条记录,失败 0 条。」"}
              </div>
            </div>

            <Button
              variant="outline"
              className="gap-1.5"
              onClick={runTest}
              disabled={current.testing || !current.config.voiceId}
            >
              <PlayCircle
                className={
                  current.testing
                    ? "size-3.5 animate-spin"
                    : "size-3.5"
                }
              />
              {current.testing ? "合成中..." : "测试"}
            </Button>

            {current.lastResult && (
              <div
                className={`ring-1 rounded-sm px-3 py-2 text-[11.5px] flex items-start gap-2 ${
                  current.lastResult.ok
                    ? "bg-emerald-500/[0.06] ring-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/[0.06] ring-rose-500/30 text-rose-700 dark:text-rose-300"
                }`}
              >
                {current.lastResult.ok ? (
                  <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{current.lastResult.message}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {new Date(current.lastResult.at).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-1 grid grid-cols-3 gap-2 text-[10.5px] font-mono">
              <div className="rounded-sm ring-1 ring-border bg-card/60 px-2 py-1.5">
                <div className="text-muted-foreground uppercase tracking-wide">
                  状态
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {current.lastResult?.ok ? (
                    <StatusPill tone="ok" label="正常" />
                  ) : current.lastResult && !current.lastResult.ok ? (
                    <StatusPill tone="err" label="失败" />
                  ) : (
                    <StatusPill tone="muted" label="空闲" />
                  )}
                </div>
              </div>
              <div className="rounded-sm ring-1 ring-border bg-card/60 px-2 py-1.5">
                <div className="text-muted-foreground uppercase tracking-wide">
                  保存
                </div>
                <div className="mt-0.5">
                  {current.saved ? (
                    <StatusPill tone="ok" label="是" />
                  ) : (
                    <StatusPill tone="warn" label="草稿" />
                  )}
                </div>
              </div>
              <div className="rounded-sm ring-1 ring-border bg-card/60 px-2 py-1.5">
                <div className="text-muted-foreground uppercase tracking-wide">
                  人格
                </div>
                <div className="mt-0.5 font-mono">{persona}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 ring-1 ring-border rounded-sm bg-card/40">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            双面 · 快照
          </div>
        </div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
          {(["human", "digital"] as const).map((p) => {
            const s = p === "human" ? human : digital;
            const label = p === "human" ? "真人 outbound" : "数字员工 reply";
            return (
              <div
                key={p}
                className="rounded-sm ring-1 ring-border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium">{label}</span>
                  {s.saved ? (
                    <StatusPill tone="ok" label="已保存" />
                  ) : (
                    <StatusPill tone="warn" label="草稿" />
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-muted-foreground font-mono uppercase tracking-wide">
                    服务商
                  </dt>
                  <dd className="font-mono">{s.config.provider}</dd>
                  <dt className="text-muted-foreground font-mono uppercase tracking-wide">
                    音色 ID
                  </dt>
                  <dd className="font-mono truncate">{s.config.voiceId}</dd>
                  <dt className="text-muted-foreground font-mono uppercase tracking-wide">
                    采样率
                  </dt>
                  <dd className="font-mono">{s.config.sampleRate / 1000} kHz</dd>
                  <dt className="text-muted-foreground font-mono uppercase tracking-wide">
                    语言
                  </dt>
                  <dd className="font-mono">{s.config.language}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </SettingsPageShell>
  );
}