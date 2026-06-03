import type * as lark from '@larksuiteoapi/node-sdk';
import type { BotConfigBase } from '../config.js';
import { resolveEngineName, type EngineName } from '../engines/index.js';
import type { MessageBridge } from '../bridge/message-bridge.js';
import type { IMessageSender } from '../bridge/message-sender.interface.js';

export interface RegisteredBot {
  name: string;
  platform: 'feishu' | 'telegram' | 'web' | 'wechat';
  config: BotConfigBase;
  bridge: MessageBridge;
  sender: IMessageSender;
  feishuClient?: lark.Client;
  feishuWsClient?: any;
}

/** Public DTO returned by list() — no secrets or internal refs. */
export interface BotInfo {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  platform: string;
  engine: EngineName;
  model?: string;
  workingDirectory: string;
  ttsVoice?: string;
  systemPrompt?: string;
  agentId?: string;
  maxConcurrentTasks?: number;
  budgetLimitDaily?: number;
  peerUrl?: string;
  peerName?: string;

  // Edit form — masked/non-sensitive credential fields
  maxTurns?: number;
  feishuAppIdMasked?: string;
  hasFeishuSecret?: boolean;
  openaiCompatBaseUrl?: string;
  hasOpenaiCompatApiKey?: boolean;
  apiKeyMasked?: string;
}

export class BotRegistry {
  private bots = new Map<string, RegisteredBot>();

  register(bot: RegisteredBot): void {
    this.bots.set(`${bot.platform}:${bot.name}`, bot);
  }

  get(name: string): RegisteredBot | undefined {
    for (const prefix of ['feishu', 'telegram', 'web', 'wechat']) {
      const bot = this.bots.get(`${prefix}:${name}`);
      if (bot) return bot;
    }
    return undefined;
  }

  getByPlatform(name: string, platform: string): RegisteredBot | undefined {
    return this.bots.get(`${platform}:${name}`);
  }

  listByPlatform(platform: string): RegisteredBot[] {
    return Array.from(this.bots.values()).filter((b) => b.platform === platform);
  }

  deregister(name: string): boolean {
    for (const prefix of ['feishu', 'telegram', 'web', 'wechat']) {
      const key = `${prefix}:${name}`;
      const bot = this.bots.get(key);
      if (bot) {
        this.bots.delete(key);
        bot.bridge.destroy();
        if (bot.feishuWsClient && typeof bot.feishuWsClient.close === 'function') {
          try {
            bot.feishuWsClient.close();
          } catch {
            /* ignore */
          }
        }
        return true;
      }
    }
    return false;
  }

  listRegistered(): RegisteredBot[] {
    return Array.from(this.bots.values());
  }

  list(): BotInfo[] {
    return Array.from(this.bots.values()).map((b) => {
      const feishuConfig = (b.config as any).feishu as { appId: string; appSecret: string } | undefined;
      return {
        name: b.name,
        ...(b.config.description ? { description: b.config.description } : {}),
        ...(b.config.specialties?.length ? { specialties: b.config.specialties } : {}),
        ...(b.config.icon ? { icon: b.config.icon } : {}),
        platform: b.platform,
        engine: resolveEngineName(b.config),
        ...(defaultModelForEngine(b.config) ? { model: defaultModelForEngine(b.config) } : {}),
        workingDirectory: b.config.claude.defaultWorkingDirectory,
        ...(b.config.systemPrompt ? { systemPrompt: b.config.systemPrompt } : {}),
        ...(b.config.agentId ? { agentId: b.config.agentId } : {}),
        ...(b.config.ttsVoice ? { ttsVoice: b.config.ttsVoice } : {}),
        ...(b.config.maxConcurrentTasks != null ? { maxConcurrentTasks: b.config.maxConcurrentTasks } : {}),
        ...(b.config.budgetLimitDaily != null ? { budgetLimitDaily: b.config.budgetLimitDaily } : {}),
        // Credential masking for edit form
        ...(b.config.claude.maxTurns != null ? { maxTurns: b.config.claude.maxTurns } : {}),
        ...(feishuConfig?.appId ? { feishuAppIdMasked: maskString(feishuConfig.appId) } : {}),
        ...(feishuConfig?.appSecret ? { hasFeishuSecret: true } : {}),
        ...(b.config.openaiCompat?.baseUrl ? { openaiCompatBaseUrl: b.config.openaiCompat.baseUrl } : {}),
        ...(b.config.openaiCompat?.apiKey ? { hasOpenaiCompatApiKey: true } : {}),
        ...(b.config.claude.apiKey ? { apiKeyMasked: maskString(b.config.claude.apiKey) } : {}),
        ...(b.config.claude.baseUrl ? { claudeBaseUrl: b.config.claude.baseUrl } : {}),
      };
    });
  }

  updateConfig(name: string, newConfig: BotConfigBase): boolean {
    for (const prefix of ['feishu', 'telegram', 'web', 'wechat']) {
      const bot = this.bots.get(`${prefix}:${name}`);
      if (bot) {
        bot.config = newConfig;
        bot.bridge.updateConfig(newConfig);
        return true;
      }
    }
    return false;
  }
}

function defaultModelForEngine(config: BotConfigBase): string | undefined {
  switch (resolveEngineName(config)) {
    case 'claude':
      return config.claude.model;
    case 'kimi':
      return config.kimi?.model;
    case 'codex':
      return config.codex?.model || config.codex?.displayModel;
    case 'openai-compat':
      return config.openaiCompat?.model;
  }
}

function maskString(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}
