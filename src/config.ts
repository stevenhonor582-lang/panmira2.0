import 'dotenv/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Agent engine backing a bot. */
export type EngineName = 'claude' | 'kimi' | 'codex' | 'openai-compat';

/** User permission role. */
export type UserRole = "viewer" | "operator" | "editor" | "admin";

/** A user entry in the bot access allowlist. */
export interface AllowedUser {
  userId: string;
  name?: string;
  role: UserRole;
}

/** Bot permission configuration — stored in bot_configs.config_json.permissions. */
export interface PermissionConfig {
  accessControl?: {
    mode?: "all" | "allowlist";
    allowedUsers?: AllowedUser[];
  };
  defaultRole?: UserRole;
  bashSafety?: {
    blockGitPush?: boolean;
    blockPackageInstall?: boolean;
    blockNetworkOps?: boolean;
    /** Commands that bypass ALWAYS_BLOCKED_PATTERNS (e.g. ["sudo"]). Only grant to trusted bots. */
    permittedCommands?: string[];
  };
  fileSystem?: {
    protectSkills?: boolean;
    protectConfig?: boolean;
  };
}


/** Shared config fields used by MessageBridge and Executors (platform-agnostic). */
export interface BotConfigBase {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  maxConcurrentTasks?: number;
  budgetLimitDaily?: number;
  ttsVoice?: string;
  /** Agent engine. Defaults to 'claude' for backward compatibility. */
  engine?: EngineName;
  claude: {
    defaultWorkingDirectory: string;
    maxTurns: number | undefined;
    maxBudgetUsd: number | undefined;
    model: string | undefined;
    /** Explicit Anthropic API key. When set, child Claude Code processes use this
     *  key instead of ~/.claude/.credentials.json. Supports cc-switch compatibility:
     *  leave unset to let Claude Code resolve auth dynamically. */
    apiKey: string | undefined;
    /** Explicit Anthropic-compatible base URL. When set, overrides ANTHROPIC_BASE_URL for this bot's Claude Code process. */
    baseUrl: string | undefined;
    outputsBaseDir: string;
    downloadsDir: string;
  };
  /** Kimi-specific overrides. Populated only when engine === 'kimi'. Phase 2. */
  kimi?: {
    executable?: string;
    model?: string;
    thinking?: boolean;
    apiKey?: string;
    /** Context window size in tokens (defaults to 262144 — Kimi for Coding default). */
    contextWindow?: number;
  };
  /** Codex-specific overrides. Populated only when engine === 'codex'. */
  codex?: CodexBotConfig;
  /** OpenAI-compatible provider config. Populated only when engine === 'openai-compat'. */
  openaiCompat?: OpenAICompatConfig;
  /** Clarification engine: ask structured questions before executing skills. */
  clarification?: {
    enabled?: boolean;
    maxQuestionsPerRound?: number;
    sessionTtlHours?: number;
    applicableSkills?: string[];
    fallbackToLLM?: boolean;
  };
  /** Skill schemas for clarification engine. Keyed by skill name. */
  skills?: Record<string, Array<{
    name: string;
    type: 'string' | 'number' | 'enum' | 'boolean';
    question: string;
    options?: string[];
    required: boolean;
  }>>;
  /** When true, skip platform WS connection — bot only receives messages via proxy_message. */
  proxyOnly?: boolean;
  /** Override context window size for display (e.g. 1000000 for 1M). */
  contextWindow?: number;
  /** System prompt from Agent template. */
  systemPrompt?: string;
  /** Agent template ID for reference mode (resolved at execution time). */
  agentId?: string;
  /** Knowledge base folder IDs bound to this bot for automatic context injection. */
  knowledgeFolders?: string[];
  /** Bot permission configuration (user access, tool restrictions, file protection). */
  permissions?: PermissionConfig;
}

/** Codex-specific overrides. Populated only when engine === 'codex'. */
export interface CodexBotConfig {
  executable?: string;
  model?: string;
  displayModel?: string;
  profile?: string;
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  /** Context window size in tokens for display only. */
  contextWindow?: number;
  extraArgs?: string[];
  env?: Record<string, string>;
}

/** OpenAI-compatible provider config (Zhipu, MiniMax, DeepSeek, etc.). */
export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindow?: number;
}

/** Feishu bot config (extends base with Feishu credentials). */
export interface BotConfig extends BotConfigBase {
  feishu: {
    appId: string;
    appSecret: string;
  };
  /** When true, respond to all messages in group chats without requiring @mention. */
  groupNoMention?: boolean;
}

/** Telegram bot config (extends base with Telegram credentials). */
export interface TelegramBotConfig extends BotConfigBase {
  telegram: {
    botToken: string;
  };
}

/** WeChat bot config (extends base with iLink credentials). */
export interface WechatBotConfig extends BotConfigBase {
  wechat: {
    ilinkBaseUrl?: string;
    botToken?: string;
  };
}

export interface PeerConfig {
  name: string;
  url: string;
  secret?: string;
}

export interface AppConfig {
  feishuBots: BotConfig[];
  telegramBots: TelegramBotConfig[];
  webBots: BotConfigBase[];
  wechatBots: WechatBotConfig[];
  /** Dedicated Feishu service app for wiki sync & doc reader (independent of chat bots). */
  feishuService?: {
    appId: string;
    appSecret: string;
  };
  log: {
    level: string;
  };
  memoryServerUrl: string;
  api: {
    port: number;
    secret?: string;
  };
  memory: {
    enabled: boolean;
    port: number;
    databaseDir: string;
    secret: string;
    adminToken?: string;
    readerToken?: string;
  };
  /** Peer Panmira instances for cross-instance bot discovery and task delegation. */
  peers: PeerConfig[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function expandUserPath(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

// --- Feishu bot configuration types ---

/** Kimi-specific configuration overrides. */
export interface KimiJsonConfig {
  executable?: string;
  model?: string;
  thinking?: boolean;
  apiKey?: string;
  /** Context window size in tokens (defaults to 262144 — Kimi for Coding default). */
  contextWindow?: number;
}

/** Codex-specific configuration overrides. */
export interface CodexJsonConfig {
  executable?: string;
  model?: string;
  displayModel?: string;
  profile?: string;
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  /** Context window size in tokens for display only. */
  contextWindow?: number;
  extraArgs?: string[];
  env?: Record<string, string>;
}

/** Fields shared across all bot JSON entries (engine selection and engine overrides). */
interface EngineJsonFields {
  engine?: EngineName;
  kimi?: KimiJsonConfig;
  codex?: CodexJsonConfig;
  /** System prompt from Agent template. */
  systemPrompt?: string;
  /** Agent template ID — resolved to systemPrompt at execution time. */
  agentId?: string;
  openaiCompat?: OpenAICompatConfig;
  /** Knowledge base folder IDs for automatic context injection. */
  knowledgeFolders?: string[];
  /** Phase 2: reference to provider_configs row. Canonical source for
   *  model/apiKey/baseUrl. When present, entry.model/baseUrl are ignored. */
  providerId?: string;
}

export interface FeishuBotJsonEntry extends EngineJsonFields {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  maxConcurrentTasks?: number;
  budgetLimitDaily?: number;
  ttsVoice?: string;
  feishuAppId: string;
  feishuAppSecret: string;
  defaultWorkingDirectory: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  outputsBaseDir?: string;
  downloadsDir?: string;
  /** When true, respond to all messages in group chats without requiring @mention. */
  groupNoMention?: boolean;
  /** When true, skip Feishu WS connection — bot only receives messages via proxy_message through WS. */
  proxyOnly?: boolean;
  /** Bot permission configuration (user access, tool restrictions, file protection). */
  permissions?: PermissionConfig;
}

/**
 * Ensure each bot has its own isolated workspace directory.
 * Prevents accidental sharing when configs are copied between bots.
 *
 * Canonical layout (since 2026-06-18): each bot gets its own subdirectory
 * under a single shared `~/workspace/` root.
 *   bot "海联测试" -> ~/workspace/海联测试/
 *   bot "sales-1"  -> ~/workspace/sales-1/
 *   bot "守静"     -> ~/workspace/守静/
 *
 * Rules:
 * 1. If configured dir matches ~/workspace/{botName}, keep it (canonical).
 * 2. If configured dir is the generic ~/workspace (shared by many bots),
 *    redirect to own subdirectory ~/workspace/{botName}.
 * 3. If configured dir is a subdirectory of ~/workspace/ (but not the
 *    canonical one), keep it - bots may legitimately live in deeper paths.
 * 4. If configured dir is the legacy form ~/workspace-{botName} (v1.0.0
 *    and earlier generated this automatically), redirect to the canonical
 *    ~/workspace/{botName}.
 * 5. Otherwise (custom path, env-specific), keep the configured value.
 */

// panmira 2.0: English slug map for cwd isolation
const BOT_SLUG_MAP: Readonly<Record<string, string>> = Object.freeze({
  '得一': 'deyi',
  '玄鉴': 'xuanjian',
  '不盈': 'buying',
  '守静': 'shoujing',
  '信言': 'xinyan',
});


function ensureIsolatedWorkspace(botName: string, configuredDir: string): string {
  const expanded = expandUserPath(configuredDir);
  const workspaceRoot = path.join(os.homedir(), 'workspace');
  const slug = BOT_SLUG_MAP[botName] || botName;
  const expectedDir = path.join(workspaceRoot, slug);
  // Legacy form: ~/workspace-{botName} (v1.0.0 and earlier default)
  const legacyPattern = new RegExp(`^${escapeRegex(path.join(os.homedir(), 'workspace-'))}([^/]+)$`);

  // Canonical: already ~/workspace/{botName} - keep
  if (expanded === expectedDir) return expanded;

  // Generic shared workspace root - must redirect to isolated subdirectory
  if (expanded === workspaceRoot) {
    try { fs.mkdirSync(expectedDir, { recursive: true }); } catch {}
    return expectedDir;
  }

  // Legacy form ~/workspace-{botName} - redirect to canonical
  const legacyMatch = expanded.match(legacyPattern);
  if (legacyMatch) {
    try { fs.mkdirSync(expectedDir, { recursive: true }); } catch {}
    return expectedDir;
  }

  // Subdirectory of ~/workspace/ (e.g. ~/workspace/foo/bar/) - keep as-is.
  if (expanded.startsWith(workspaceRoot + path.sep)) {
    return expanded;
  }

  // Custom path - keep as-is
  return expanded;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

/** Phase 2: resolve a provider by id and decrypt its apiKey.
 *  Returns null when no providerId, or provider missing — callers should
 *  fall back to entry fields / env vars in that case. */
async function resolveProvider(
  providerId: string | undefined,
  providerConfigStore?: ProviderLookup | null,
): Promise<{ model: string; baseUrl: string; apiKey: string | null } | null> {
  if (!providerId || !providerConfigStore) return null;
  const p = await providerConfigStore.findById(providerId);
  if (!p) return null;
  const apiKey = await providerConfigStore.getDecryptedApiKey(providerId);
  return { model: p.model, baseUrl: p.baseUrl, apiKey };
}

type ProviderLookup = { findById: (id: string) => Promise<{ model: string; baseUrl: string; apiKeyEncrypted?: string | null } | null>; getDecryptedApiKey: (id: string) => Promise<string | null> } | null;

export async function feishuBotFromJson(
  entry: FeishuBotJsonEntry,
  providerConfigStore?: ProviderLookup | null,
): Promise<BotConfig> {
  // Auto-correct working directory: each bot must have its own isolated directory
  entry = { ...entry, defaultWorkingDirectory: ensureIsolatedWorkspace(entry.name, entry.defaultWorkingDirectory) };
  const codex = buildCodexConfig(entry.codex);
  // Phase 2: resolve provider (canonical source) when providerId is present.
  const provider = await resolveProvider(entry.providerId, providerConfigStore);
  return {
    name: entry.name,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.specialties?.length ? { specialties: entry.specialties } : {}),
    ...(entry.icon ? { icon: entry.icon } : {}),
    ...(entry.maxConcurrentTasks != null ? { maxConcurrentTasks: entry.maxConcurrentTasks } : {}),
    ...(entry.budgetLimitDaily != null ? { budgetLimitDaily: entry.budgetLimitDaily } : {}),
    ...(entry.ttsVoice ? { ttsVoice: entry.ttsVoice } : {}),
    ...(entry.groupNoMention ? { groupNoMention: true } : {}),
    ...(entry.proxyOnly ? { proxyOnly: true } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
    ...(entry.kimi ? { kimi: entry.kimi } : {}),
    ...(codex ? { codex } : {}),
    ...(() => {
      const o = buildOpenaiCompatConfig(entry, provider);
      return o ? { openaiCompat: o } : {};
    })(),
    feishu: {
      appId: entry.feishuAppId,
      appSecret: entry.feishuAppSecret,
    },
    ...(entry.systemPrompt ? { systemPrompt: entry.systemPrompt } : {}),
    ...(entry.agentId ? { agentId: entry.agentId } : {}),
    ...(entry.knowledgeFolders?.length ? { knowledgeFolders: entry.knowledgeFolders } : {}),
    ...(entry.permissions ? { permissions: entry.permissions } : {}),
    claude: buildClaudeConfig(entry, provider, entry.name),
  };
}

// --- Telegram bot configuration types ---

export interface TelegramBotJsonEntry extends EngineJsonFields {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  maxConcurrentTasks?: number;
  budgetLimitDaily?: number;
  ttsVoice?: string;
  telegramBotToken: string;
  defaultWorkingDirectory: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  apiKey?: string;
  outputsBaseDir?: string;
  downloadsDir?: string;
  permissions?: PermissionConfig;
}

export async function telegramBotFromJson(
  entry: TelegramBotJsonEntry,
  providerConfigStore?: ProviderLookup | null,
): Promise<TelegramBotConfig> {
  const codex = buildCodexConfig(entry.codex);
  const provider = await resolveProvider(entry.providerId, providerConfigStore);
  return {
    name: entry.name,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.specialties?.length ? { specialties: entry.specialties } : {}),
    ...(entry.icon ? { icon: entry.icon } : {}),
    ...(entry.maxConcurrentTasks != null ? { maxConcurrentTasks: entry.maxConcurrentTasks } : {}),
    ...(entry.budgetLimitDaily != null ? { budgetLimitDaily: entry.budgetLimitDaily } : {}),
    ...(entry.ttsVoice ? { ttsVoice: entry.ttsVoice } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
    ...(entry.kimi ? { kimi: entry.kimi } : {}),
    ...(codex ? { codex } : {}),
    ...(() => {
      const o = buildOpenaiCompatConfig(entry, provider);
      return o ? { openaiCompat: o } : {};
    })(),
    telegram: {
      botToken: entry.telegramBotToken,
    },
    ...(entry.systemPrompt ? { systemPrompt: entry.systemPrompt } : {}),
    ...(entry.agentId ? { agentId: entry.agentId } : {}),
    ...(entry.permissions ? { permissions: entry.permissions } : {}),
    claude: buildClaudeConfig(entry, provider, entry.name),
  };
}

// --- Web bot configuration types ---

export interface WebBotJsonEntry extends EngineJsonFields {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  maxConcurrentTasks?: number;
  budgetLimitDaily?: number;
  ttsVoice?: string;
  defaultWorkingDirectory: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  outputsBaseDir?: string;
  downloadsDir?: string;
  permissions?: PermissionConfig;
}

export async function webBotFromJson(
  entry: WebBotJsonEntry,
  providerConfigStore?: ProviderLookup | null,
): Promise<BotConfigBase> {
  const codex = buildCodexConfig(entry.codex);
  const provider = await resolveProvider(entry.providerId, providerConfigStore);
  return {
    name: entry.name,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.specialties?.length ? { specialties: entry.specialties } : {}),
    ...(entry.icon ? { icon: entry.icon } : {}),
    ...(entry.maxConcurrentTasks != null ? { maxConcurrentTasks: entry.maxConcurrentTasks } : {}),
    ...(entry.budgetLimitDaily != null ? { budgetLimitDaily: entry.budgetLimitDaily } : {}),
    ...(entry.ttsVoice ? { ttsVoice: entry.ttsVoice } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
    ...(entry.kimi ? { kimi: entry.kimi } : {}),
    ...(codex ? { codex } : {}),
    ...(() => {
      const o = buildOpenaiCompatConfig(entry, provider);
      return o ? { openaiCompat: o } : {};
    })(),
    ...(entry.systemPrompt ? { systemPrompt: entry.systemPrompt } : {}),
    ...(entry.agentId ? { agentId: entry.agentId } : {}),
    ...(entry.knowledgeFolders?.length ? { knowledgeFolders: entry.knowledgeFolders } : {}),
    ...(entry.permissions ? { permissions: entry.permissions } : {}),
    claude: buildClaudeConfig(entry, provider, entry.name),
  };
}

// --- WeChat bot configuration types ---

export interface WechatBotJsonEntry extends EngineJsonFields {
  name: string;
  description?: string;
  ilinkBaseUrl?: string;
  wechatBotToken?: string;
  defaultWorkingDirectory: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  apiKey?: string;
  outputsBaseDir?: string;
  downloadsDir?: string;
  permissions?: PermissionConfig;
}

export async function wechatBotFromJson(
  entry: WechatBotJsonEntry,
  providerConfigStore?: ProviderLookup | null,
): Promise<WechatBotConfig> {
  const codex = buildCodexConfig(entry.codex);
  const provider = await resolveProvider(entry.providerId, providerConfigStore);
  return {
    name: entry.name,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.engine ? { engine: entry.engine } : {}),
    ...(entry.kimi ? { kimi: entry.kimi } : {}),
    ...(codex ? { codex } : {}),
    ...(() => {
      const o = buildOpenaiCompatConfig(entry, provider);
      return o ? { openaiCompat: o } : {};
    })(),
    wechat: {
      ilinkBaseUrl: entry.ilinkBaseUrl,
      botToken: entry.wechatBotToken,
    },
    ...(entry.systemPrompt ? { systemPrompt: entry.systemPrompt } : {}),
    ...(entry.agentId ? { agentId: entry.agentId } : {}),
    ...(entry.permissions ? { permissions: entry.permissions } : {}),
    claude: buildClaudeConfig(entry, provider, entry.name),
  };
}

// --- Shared Claude config builder ---

function buildClaudeConfig(entry: {
  defaultWorkingDirectory: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  outputsBaseDir?: string;
  downloadsDir?: string;
}, provider?: { model: string; baseUrl: string; apiKey: string | null } | null, botName?: string): BotConfigBase['claude'] {
  // Fail-fast (2026-06-22): never silently fall through to SDK default model.
  // Previously missing model/baseUrl/apiKey → 'claude-opus-4-7' + env.ANTHROPIC_BASE_URL,
  // which on ruoshui pointed to open.bigmodel.cn and produced silent 529/1305
  // floods (智谱 GLM-5.2 was the actual is_default LLM provider). Every bot
  // must now declare its providerId OR explicit (model, baseUrl, apiKey).
  const model = (provider?.model || entry.model || '').trim();
  const baseUrl = (provider?.baseUrl || entry.baseUrl || '').trim();
  const apiKey = (provider?.apiKey || entry.apiKey || '').trim();
  const missing: string[] = [];
  if (!model) missing.push('model');
  if (!baseUrl) missing.push('baseUrl');
  if (!apiKey) missing.push('apiKey');
  if (missing.length > 0) {
    throw new Error(
      `Bot "${botName || 'unknown'}" is missing required claude config: ${missing.join(', ')}. ` +
      `Set providerId (pointing to provider_configs) or explicit (model, baseUrl, apiKey) on the bot entry. ` +
      `Falling back silently was removed because it caused 529/1305 floods on ruoshui (智谱 GLM-5.2 was the default).`,
    );
  }
  return {
    defaultWorkingDirectory: expandUserPath(entry.defaultWorkingDirectory),
    maxTurns: entry.maxTurns ?? (process.env.CLAUDE_MAX_TURNS ? parseInt(process.env.CLAUDE_MAX_TURNS, 10) : undefined),
    maxBudgetUsd:
      entry.maxBudgetUsd ??
      (process.env.CLAUDE_MAX_BUDGET_USD ? parseFloat(process.env.CLAUDE_MAX_BUDGET_USD) : undefined),
    model,
    apiKey,
    baseUrl,
    outputsBaseDir:
      entry.outputsBaseDir ||
      process.env.OUTPUTS_BASE_DIR ||
      path.join(os.tmpdir(), `panmira-outputs-${os.userInfo().username}`),
    downloadsDir:
      entry.downloadsDir ||
      process.env.DOWNLOADS_DIR ||
      path.join(os.tmpdir(), `panmira-downloads-${os.userInfo().username}`),
  };
}

function buildOpenaiCompatConfig(entry: {
  openaiCompat?: OpenAICompatConfig;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}, provider?: { model: string; baseUrl: string; apiKey: string | null } | null): OpenAICompatConfig | undefined {
  if (entry.openaiCompat) return entry.openaiCompat;
  // Phase 2: provider takes precedence
  if (provider) {
    return { baseUrl: provider.baseUrl, apiKey: provider.apiKey || '', model: provider.model };
  }
  if (!entry.baseUrl || !entry.model) return undefined;
  return {
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey || '',
    model: entry.model,
  };
}

function buildCodexConfig(entry?: CodexJsonConfig): BotConfigBase['codex'] | undefined {
  const cfg: BotConfigBase['codex'] = {
    ...(process.env.CODEX_EXECUTABLE_PATH ? { executable: process.env.CODEX_EXECUTABLE_PATH } : {}),
    ...(process.env.CODEX_MODEL ? { model: process.env.CODEX_MODEL } : {}),
    ...(process.env.CODEX_DISPLAY_MODEL ? { displayModel: process.env.CODEX_DISPLAY_MODEL } : {}),
    ...(process.env.CODEX_PROFILE ? { profile: process.env.CODEX_PROFILE } : {}),
    ...(process.env.CODEX_APPROVAL_POLICY
      ? { approvalPolicy: process.env.CODEX_APPROVAL_POLICY as CodexJsonConfig['approvalPolicy'] }
      : {}),
    ...(process.env.CODEX_SANDBOX ? { sandbox: process.env.CODEX_SANDBOX as CodexJsonConfig['sandbox'] } : {}),
    ...(process.env.CODEX_BYPASS_APPROVALS_AND_SANDBOX === 'true'
      ? { dangerouslyBypassApprovalsAndSandbox: true }
      : {}),
    ...(process.env.CODEX_CONTEXT_WINDOW ? { contextWindow: parseInt(process.env.CODEX_CONTEXT_WINDOW, 10) } : {}),
    ...(entry ?? {}),
  };
  return Object.keys(cfg).length > 0 ? cfg : undefined;
}

// --- Single-bot env var mode ---

function feishuBotFromEnv(): BotConfig {
  const codex = buildCodexConfig();
  return {
    name: 'default',
    ...((process.env.PANMIRA_ENGINE) ? { engine: process.env.PANMIRA_ENGINE as EngineName } : {}),
    ...(codex ? { codex } : {}),
    feishu: {
      appId: required('FEISHU_APP_ID'),
      appSecret: required('FEISHU_APP_SECRET'),
    },
    claude: {
      defaultWorkingDirectory: expandUserPath(required('CLAUDE_DEFAULT_WORKING_DIRECTORY')),
      maxTurns: process.env.CLAUDE_MAX_TURNS ? parseInt(process.env.CLAUDE_MAX_TURNS, 10) : undefined,
      maxBudgetUsd: process.env.CLAUDE_MAX_BUDGET_USD ? parseFloat(process.env.CLAUDE_MAX_BUDGET_USD) : undefined,
      model: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
      apiKey: undefined,
      baseUrl: undefined,
      outputsBaseDir:
        process.env.OUTPUTS_BASE_DIR || path.join(os.tmpdir(), `panmira-outputs-${os.userInfo().username}`),
      downloadsDir: process.env.DOWNLOADS_DIR || path.join(os.tmpdir(), `panmira-downloads-${os.userInfo().username}`),
    },
  };
}

function telegramBotFromEnv(): TelegramBotConfig {
  const codex = buildCodexConfig();
  return {
    name: 'telegram-default',
    ...((process.env.PANMIRA_ENGINE) ? { engine: process.env.PANMIRA_ENGINE as EngineName } : {}),
    ...(codex ? { codex } : {}),
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
    },
    claude: {
      defaultWorkingDirectory: expandUserPath(required('CLAUDE_DEFAULT_WORKING_DIRECTORY')),
      maxTurns: process.env.CLAUDE_MAX_TURNS ? parseInt(process.env.CLAUDE_MAX_TURNS, 10) : undefined,
      maxBudgetUsd: process.env.CLAUDE_MAX_BUDGET_USD ? parseFloat(process.env.CLAUDE_MAX_BUDGET_USD) : undefined,
      model: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
      apiKey: undefined,
      baseUrl: undefined,
      outputsBaseDir:
        process.env.OUTPUTS_BASE_DIR || path.join(os.tmpdir(), `panmira-outputs-${os.userInfo().username}`),
      downloadsDir: process.env.DOWNLOADS_DIR || path.join(os.tmpdir(), `panmira-downloads-${os.userInfo().username}`),
    },
  };
}

function wechatBotFromEnv(): WechatBotConfig {
  const codex = buildCodexConfig();
  return {
    name: 'wechat-default',
    ...((process.env.PANMIRA_ENGINE) ? { engine: process.env.PANMIRA_ENGINE as EngineName } : {}),
    ...(codex ? { codex } : {}),
    wechat: {
      botToken: process.env.WECHAT_BOT_TOKEN || undefined,
    },
    claude: {
      defaultWorkingDirectory: expandUserPath(required('CLAUDE_DEFAULT_WORKING_DIRECTORY')),
      maxTurns: process.env.CLAUDE_MAX_TURNS ? parseInt(process.env.CLAUDE_MAX_TURNS, 10) : undefined,
      maxBudgetUsd: process.env.CLAUDE_MAX_BUDGET_USD ? parseFloat(process.env.CLAUDE_MAX_BUDGET_USD) : undefined,
      model: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
      apiKey: undefined,
      baseUrl: undefined,
      outputsBaseDir: expandUserPath(
        process.env.OUTPUTS_BASE_DIR || path.join(os.tmpdir(), `panmira-outputs-${os.userInfo().username}`),
      ),
      downloadsDir: expandUserPath(
        process.env.DOWNLOADS_DIR || path.join(os.tmpdir(), `panmira-downloads-${os.userInfo().username}`),
      ),
    },
  };
}

// --- Legacy bots.json format (seed only, deprecated) ---

export interface PeerJsonEntry {
  name: string;
  url: string;
  secret?: string;
}

// All configuration is in PostgreSQL. Use loadAppConfigFromDB().
export async function loadAppConfigFromDB(providerConfigStore?: import('./db/provider-config-store.js').ProviderConfigStore | null): Promise<{
  config: AppConfig;
  botConfigStore: import('./db/bot-config-store.js').BotConfigStore;
}> {
  const { BotConfigStore } = await import('./db/bot-config-store.js');
  const store = new BotConfigStore();
  // Phase 2: if caller didn't pass a providerConfigStore, try to load one
  if (!providerConfigStore) {
    try {
      const { ProviderConfigStore } = await import('./db/provider-config-store.js');
      providerConfigStore = new ProviderConfigStore();
      await providerConfigStore.init();
    } catch (err) {
      // Best-effort: legacy path (env-var fallback) still works
      console.warn('[config] could not init ProviderConfigStore:', (err as Error).message);
    }
  }

  const rows = await store.list();
  if (rows.length === 0) {
    // DB empty — one-time seed from legacy bots.json if available
    const legacyPath = process.env.BOTS_CONFIG;
    if (legacyPath) {
      const seeded = await store.seedFromJson(legacyPath);
      process.stdout.write(`[config] Seeded ${seeded.seeded} bots from JSON, skipped ${seeded.skipped}\n`);
    }
  }

  // Re-read from DB
  const allRows = await store.list();
  if (allRows.length === 0) {
    // No bots configured yet — return empty config.
    // Use Web UI at /web/settings to add bots.
    return {
      config: {
        feishuBots: [],
        telegramBots: [],
        wechatBots: [],
        webBots: [],
        peers: [],
        log: { level: process.env.LOG_LEVEL || 'info' },
        api: {
          port: parseInt(process.env.API_PORT || '9100', 10),
          secret: process.env.API_SECRET || '',
        },
        memoryServerUrl: process.env.META_MEMORY_URL || process.env.MEMORY_SERVER_URL || 'http://localhost:8100',
        memory: {
          enabled: true,
          port: 8100,
          databaseDir: './data',
          secret: process.env.MEMORY_SECRET || process.env.API_SECRET || '',
          adminToken: process.env.MEMORY_ADMIN_TOKEN,
        },
      },
      botConfigStore: store,
    };
  }

  // Convert DB rows into config format, injecting secrets
  const feishuBots: BotConfig[] = [];
  const telegramBots: TelegramBotConfig[] = [];
  const webBots: BotConfigBase[] = [];
  const wechatBots: WechatBotConfig[] = [];

  for (const row of allRows) {
    const secrets = await store.getAllSecrets(row.name);
    const entry = { ...row.configJson };

    // Inject platform secrets back into config (api_key removed in Phase 2 — now lives in provider_configs)
    if (secrets.feishu_app_secret) (entry as any).feishuAppSecret = secrets.feishu_app_secret;
    if (secrets.openai_api_key) (entry as any).openaiApiKey = secrets.openai_api_key;
    if (secrets.telegram_bot_token) (entry as any).telegramBotToken = secrets.telegram_bot_token;
    if (secrets.wechat_bot_token) (entry as any).wechatBotToken = secrets.wechat_bot_token;

    // 2026-06-22: fail-fast config validation (C-fix for 529/1305 floods) is
    // intentionally strict per-bot, but a single bad config must NOT take down
    // the whole gateway. Catch here, log loudly with bot name + reason, skip.
    try {
      if (row.platform === 'feishu') {
        feishuBots.push(await feishuBotFromJson(entry as unknown as FeishuBotJsonEntry, providerConfigStore));
      } else if (row.platform === 'telegram') {
        telegramBots.push(await telegramBotFromJson(entry as unknown as TelegramBotJsonEntry, providerConfigStore));
      } else if (row.platform === 'web') {
        webBots.push(await webBotFromJson(entry as unknown as WebBotJsonEntry, providerConfigStore));
      } else if (row.platform === 'wechat') {
        wechatBots.push(await wechatBotFromJson(entry as unknown as WechatBotJsonEntry, providerConfigStore));
      }
    } catch (botErr: any) {
      console.error(
        `[config] SKIPPING bot "${row.name}" (platform=${row.platform}): ${botErr?.message || botErr}`,
        '\n  Fix: set providerId (pointing to provider_configs) or explicit (model, baseUrl, apiKey) in bot_configs.config_json.',
        '\n  See: fail-fast-claude-config-2026-06-22',
      );
    }
  }

  // Build the rest of AppConfig from env vars (same as loadAppConfig)
  const memoryServerUrl = process.env.MEMORY_SERVER_URL || 'http://localhost:8100';
  const apiPortRaw = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 9100;
  const apiPort = Number.isNaN(apiPortRaw) ? 9100 : apiPortRaw;
  const apiSecret = process.env.API_SECRET || undefined;
  process.env.PANMIRA_API_PORT = String(apiPort);
  if (apiSecret) process.env.PANMIRA_API_SECRET = apiSecret;

  let feishuService: AppConfig['feishuService'];
  if (process.env.FEISHU_SERVICE_APP_ID && process.env.FEISHU_SERVICE_APP_SECRET) {
    feishuService = { appId: process.env.FEISHU_SERVICE_APP_ID, appSecret: process.env.FEISHU_SERVICE_APP_SECRET };
  } else if (feishuBots.length > 0) {
    feishuService = { appId: feishuBots[0].feishu.appId, appSecret: feishuBots[0].feishu.appSecret };
  }

  const memoryEnabled = process.env.MEMORY_ENABLED !== 'false';
  const memoryPortRaw = process.env.MEMORY_PORT ? parseInt(process.env.MEMORY_PORT, 10) : 8100;
  const memoryPort = Number.isNaN(memoryPortRaw) ? 8100 : memoryPortRaw;
  const memoryDatabaseDir = process.env.MEMORY_DATABASE_DIR || './data';
  const memorySecret = process.env.MEMORY_SECRET || process.env.API_SECRET || '';
  const memoryAdminToken = process.env.MEMORY_ADMIN_TOKEN || undefined;
  const memoryReaderToken = process.env.MEMORY_TOKEN || undefined;

  const peers: PeerConfig[] = [];
  if (process.env.PANMIRA_PEERS) {
    const urls = process.env.PANMIRA_PEERS.split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const secrets = (process.env.PANMIRA_PEER_SECRETS || '').split(',').map((s) => s.trim());
    const names = (process.env.PANMIRA_PEER_NAMES || '').split(',').map((s) => s.trim());
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].replace(/\/+$/, '');
      if (!peers.some((p) => p.url === url)) {
        peers.push({
          name: names[i] || url.replace(/^https?:\/\//, '').replace(/[:.]/g, '-'),
          url,
          secret: secrets[i] || undefined,
        });
      }
    }
  }

  return {
    config: {
      feishuBots,
      telegramBots,
      webBots,
      wechatBots,
      feishuService,
      log: { level: process.env.LOG_LEVEL || 'info' },
      memoryServerUrl,
      api: { port: apiPort, secret: apiSecret },
      memory: {
        enabled: memoryEnabled,
        port: memoryPort,
        databaseDir: memoryDatabaseDir,
        secret: memorySecret,
        adminToken: memoryAdminToken,
        readerToken: memoryReaderToken,
      },
      peers,
    },
    botConfigStore: store,
  };
}
