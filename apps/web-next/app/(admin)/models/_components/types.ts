/**
 * 模型类型扩展 — LLM / Embedding / 图像 / 声音 / 视频 / TTS / STT
 * 智能路由字段:`routingStrategy` + `routingTags`,后端尚未消费,前端先预留
 */
export type ModelType = "llm" | "embedding" | "image" | "audio" | "video" | "tts" | "stt";

export const MODEL_TYPE_META: Record<
  ModelType,
  { label: string; desc: string; tone: "default" | "secondary" | "outline"; placeholderModel: string; placeholderUrl: string }
> = {
  llm:       { label: "LLM",        desc: "大语言模型",       tone: "default",   placeholderModel: "claude-opus-4-5",   placeholderUrl: "https://api.openai.com/v1" },
  embedding: { label: "Embedding",  desc: "向量模型",         tone: "secondary", placeholderModel: "text-embedding-3-large", placeholderUrl: "https://api.openai.com/v1" },
  image:     { label: "Image",      desc: "图像生成",         tone: "secondary", placeholderModel: "gpt-image-1",     placeholderUrl: "https://api.openai.com/v1" },
  audio:     { label: "Audio",      desc: "音频理解/生成",     tone: "secondary", placeholderModel: "whisper-1",      placeholderUrl: "https://api.openai.com/v1" },
  video:     { label: "Video",      desc: "视频生成",         tone: "secondary", placeholderModel: "sora-1.0",       placeholderUrl: "https://api.openai.com/v1" },
  tts:       { label: "TTS",        desc: "语音合成",         tone: "secondary", placeholderModel: "tts-1",          placeholderUrl: "https://api.openai.com/v1" },
  stt:       { label: "STT",        desc: "语音转写",         tone: "secondary", placeholderModel: "whisper-1",      placeholderUrl: "https://api.openai.com/v1" },
};

export const MODEL_TYPES: ModelType[] = ["llm", "embedding", "image", "audio", "video", "tts", "stt"];

export interface Model {
  id: string;
  type: ModelType;
  name: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
  /** 智能路由预留字段(后端尚未消费) */
  routingStrategy?: "fallback" | "fastest" | "cheapest" | "auto";
  routingTags?: string[];
}

export interface ModelInput {
  type: ModelType;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  isDefault?: boolean;
  routingStrategy?: Model["routingStrategy"];
  routingTags?: string[];
}

export interface ModelListResponse {
  models: Model[];
}

/** 知名模型大小写 / 别名归一化(纯前端展示) */
type NormalizeRule = { re: RegExp; map: (m: string) => string };
const KNOWN_NORMALIZE: NormalizeRule[] = [
  { re: /^claude[-_]?opus[-_]?4[-_]?5$/i, map: () => "claude-opus-4-5" },
  { re: /^claude[-_]?sonnet[-_]?4[-_]?6$/i, map: () => "claude-sonnet-4-6" },
  { re: /^claude[-_]?haiku[-_]?4[-_]?5$/i, map: () => "claude-haiku-4-5" },
  { re: /^gpt[-_]?4o$/i, map: () => "gpt-4o" },
  { re: /^gpt[-_]?4(?:\.|-|_)?turbo$/i, map: () => "gpt-4-turbo" },
  { re: /^gpt[-_]?4(?:\.|-|_)?1$/i, map: () => "gpt-4.1" },
  { re: /^deepseek[-_]?v?3(?:\.|-|_)1?$/i, map: () => "deepseek-v3.1" },
  { re: /^qwen[-_]?(?:3-)?max$/i, map: () => "qwen3-max" },
  { re: /^doubao[-_]?(?:1\.5|seed)/i, map: (m: string) => m.toLowerCase().replace(/_/g, "-") },
];

export function normalizeModelName(raw: string): { normalized: string; changed: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { normalized: trimmed, changed: false };
  for (const rule of KNOWN_NORMALIZE) {
    if (rule.re.test(trimmed)) {
      const out = rule.map(trimmed);
      return { normalized: out, changed: out !== trimmed };
    }
  }
  const generic = trimmed.toLowerCase().replace(/_/g, "-");
  return { normalized: generic, changed: generic !== trimmed };
}
