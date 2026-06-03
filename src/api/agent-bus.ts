/**
 * Agent Bus — in-process bot-to-bot communication.
 * Uses BotRegistry to look up any bot's bridge and call executeApiTask() directly.
 */
import type { BotRegistry } from './bot-registry.js';
import type { ApiTaskOptions, ApiTaskResult } from '../bridge/message-bridge.js';
import type { OutputFile } from '../bridge/outputs-manager.js';
import type { Logger } from '../utils/logger.js';

export interface SendToBotOptions {
  targetBot: string;
  prompt: string;
  chatId: string;
  sendCards?: boolean;
  maxTurns?: number;
  model?: string;
  groupMembers?: string[];
  groupId?: string;
  chatType?: string;
  onUpdate?: (state: any, messageId: string, final: boolean) => void;
  skipOutputFiles?: boolean;
  onOutputFiles?: (files: OutputFile[]) => void;
}

export class AgentBus {
  constructor(
    private registry: BotRegistry,
    private logger: Logger,
  ) {}

  /** Send a message to a single bot and get its response. */
  async sendToBot(options: SendToBotOptions): Promise<ApiTaskResult> {
    const bot = this.registry.get(options.targetBot);
    if (!bot) {
      return { success: false, responseText: '', error: `Bot "${options.targetBot}" not found` };
    }

    this.logger.info({ targetBot: options.targetBot, chatId: options.chatId }, 'AgentBus: sending task');

    try {
      const result = await bot.bridge.executeApiTask({
        prompt: options.prompt,
        chatId: options.chatId,
        sendCards: options.sendCards ?? false,
        maxTurns: options.maxTurns,
        model: options.model,
        chatType: options.chatType,
        groupMembers: options.groupMembers,
        groupId: options.groupId,
        onUpdate: options.onUpdate,
        skipOutputFiles: options.skipOutputFiles,
        onOutputFiles: options.onOutputFiles,
      });
      return result;
    } catch (err: any) {
      this.logger.error({ err, targetBot: options.targetBot }, 'AgentBus: task failed');
      return { success: false, responseText: '', error: err.message || String(err) };
    }
  }

  /** Send a message to multiple specialists in parallel. Reports progress via onUpdate. */
  async sendToSpecialists(
    specialists: string[],
    message: string,
    groupChatId: string,
    groupId: string,
    options?: {
      groupMembers?: string[];
      sendCards?: boolean;
      skipOutputFiles?: boolean;
      onSpecialistUpdate?: (botName: string, state: any, messageId: string, final: boolean) => void;
      onSpecialistFiles?: (botName: string, files: OutputFile[]) => void;
    },
  ): Promise<Map<string, ApiTaskResult>> {
    const results = new Map<string, ApiTaskResult>();

    const tasks = specialists.map(async (name) => {
      const result = await this.sendToBot({
        targetBot: name,
        prompt: message,
        chatId: groupChatId,
        sendCards: options?.sendCards ?? false,
        maxTurns: 3,
        groupMembers: options?.groupMembers ?? specialists,
        groupId,
        onUpdate: options?.onSpecialistUpdate
          ? (state, msgId, final) => options.onSpecialistUpdate!(name, state, msgId, final)
          : undefined,
        skipOutputFiles: options?.skipOutputFiles,
        onOutputFiles: options?.onSpecialistFiles ? (files) => options.onSpecialistFiles!(name, files) : undefined,
      });
      results.set(name, result);
    });

    await Promise.allSettled(tasks);
    return results;
  }
}
