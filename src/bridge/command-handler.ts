import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import type { IncomingMessage } from '../types.js';
import type { IMessageSender } from './message-sender.interface.js';
import { resolveEngineName, SessionManager } from '../engines/index.js';
import type { EngineName } from '../engines/index.js';
import { MemoryClient } from '../memory/memory-client.js';
import { AuditLogger } from '../utils/audit-logger.js';
import { pool } from '../db/index.js';
import { isAdminBot } from '../api/skills-installer.js';
import type { DocSync } from '../sync/doc-sync.js';

export class CommandHandler {
  private docSync: DocSync | null = null;

  constructor(
    private config: BotConfigBase,
    private logger: Logger,
    private sender: IMessageSender,
    private sessionManager: SessionManager,
    private memoryClient: MemoryClient,
    private audit: AuditLogger,
    private getRunningTask: (chatId: string) => { startTime: number } | undefined,
    private stopTask: (chatId: string) => void,
  ) {}

  /** Set the doc sync service (optional, only available for Feishu bots). */
  setDocSync(docSync: DocSync): void {
    this.docSync = docSync;
  }

  /** Returns true if the message was handled as a command, false otherwise. */
  async handle(msg: IncomingMessage): Promise<boolean> {
    const { text } = msg;
    if (!text.startsWith('/')) return false;

    const { userId, chatId } = msg;
    const [cmd] = text.split(/\s+/);

    this.audit.log({ event: 'command', botName: this.config.name, chatId, userId, prompt: cmd });

    switch (cmd.toLowerCase()) {
      case '/help':
        await this.sender.sendTextNotice(
          chatId,
          '📖 Help',
          [
            '**Available Commands:**',
            '`/reset` - Clear session, start fresh',
            '`/stop` - Abort current running task',
            '`/status` - Show current session info',
            '`/model` - Show current engine/model; `/model list` - Available options',
            '`/model claude`, `/model kimi`, or `/model codex` - Switch engine (resets session)',
            '`/model <name>` - Set model for current engine',
            '`/memory` - Memory document commands',
            '`/skill` - Manage skills (list/enable/disable/create)',
            '`/help` - Show this help message',
            '',
            '**Usage:**',
            'Send any text message to start a conversation with the configured agent engine.',
            'Each chat has an independent session with a fixed working directory.',
            '',
            '**Memory Commands:**',
            '`/memory list` - Show folder tree',
            '`/memory search <query>` - Search documents',
            '`/memory status` - Server health check',
            '',
            '**Sync Commands:**',
            '`/sync` - Sync MetaMemory to Feishu Wiki',
            '`/sync status` - Show sync status',
          ].join('\n'),
        );
        return true;

      case '/reset':
        this.sessionManager.resetSession(chatId);
        await this.sender.sendTextNotice(
          chatId,
          '✅ Session Reset',
          'Conversation cleared. Working directory preserved.',
          'green',
        );
        return true;

      case '/stop': {
        const task = this.getRunningTask(chatId);
        if (task) {
          this.audit.log({
            event: 'task_stopped',
            botName: this.config.name,
            chatId,
            userId,
            durationMs: Date.now() - task.startTime,
          });
          this.stopTask(chatId);
          await this.sender.sendTextNotice(chatId, '🛑 Stopped', 'Current task has been aborted.', 'orange');
        } else {
          await this.sender.sendTextNotice(chatId, 'ℹ️ No Running Task', 'There is no task to stop.', 'blue');
        }
        return true;
      }

      case '/status': {
        const session = this.sessionManager.getSession(chatId);
        const isRunning = !!this.getRunningTask(chatId);
        const botEngine = resolveEngineName(this.config);
        const activeEngine = session.engine ?? botEngine;
        const defaultModel = this.defaultModelForEngine(activeEngine) || '_default_';
        const activeModel = session.model || defaultModel;
        await this.sender.sendTextNotice(
          chatId,
          '📊 Status',
          [
            `**User:** \`${userId}\``,
            `**Engine:** \`${activeEngine}\`${session.engine ? ' (session override)' : ''}`,
            `**Working Directory:** \`${session.workingDirectory}\``,
            `**Session:** ${session.sessionId ? `\`${session.sessionId.slice(0, 8)}...\`` : '_None_'}`,
            `**Model:** \`${activeModel}\`${session.model ? ' (session override)' : ''}`,
            `**Running:** ${isRunning ? 'Yes ⏳' : 'No'}`,
          ].join('\n'),
        );
        return true;
      }

      case '/skill': {
        await this.handleSkillCommand(chatId, text, this.config.name);
        return true;
      }

      case '/memory': {
        const args = text.slice('/memory'.length).trim();
        await this.handleMemoryCommand(chatId, args);
        return true;
      }

      case '/sync': {
        const args = text.slice('/sync'.length).trim();
        await this.handleSyncCommand(chatId, args);
        return true;
      }

      case '/model': {
        const args = text.slice('/model'.length).trim();
        await this.handleModelCommand(chatId, args);
        return true;
      }

      default:
        // Unrecognized /xxx commands — not handled here, pass through to Claude
        return false;
    }
  }

  private async handleMemoryCommand(chatId: string, args: string): Promise<void> {
    const [subCmd, ...rest] = args.split(/\s+/);

    if (!subCmd) {
      await this.sender.sendTextNotice(
        chatId,
        '📝 Memory',
        'Usage:\n- `/memory list` — Show folder tree\n- `/memory search <query>` — Search documents\n- `/memory status` — Health check',
      );
      return;
    }

    try {
      switch (subCmd.toLowerCase()) {
        case 'list': {
          const tree = await this.memoryClient.listFolderTree();
          const formatted = this.memoryClient.formatFolderTree(tree);
          await this.sender.sendTextNotice(chatId, '📂 Memory Folders', formatted);
          break;
        }
        case 'search': {
          const query = rest.join(' ').trim();
          if (!query) {
            await this.sender.sendTextNotice(chatId, '📝 Memory', 'Usage: `/memory search <query>`');
            return;
          }
          const results = await this.memoryClient.search(query);
          const formatted = this.memoryClient.formatSearchResults(results);
          await this.sender.sendTextNotice(chatId, `🔍 Search: ${query}`, formatted);
          break;
        }
        case 'status': {
          const health = await this.memoryClient.health();
          await this.sender.sendTextNotice(
            chatId,
            '📝 Memory Status',
            `Status: ${health.status}\nDocuments: ${health.document_count}\nFolders: ${health.folder_count}`,
            'green',
          );
          break;
        }
        default:
          await this.sender.sendTextNotice(
            chatId,
            '📝 Memory',
            `Unknown sub-command: \`${subCmd}\`\nUse \`/memory\` for help.`,
            'orange',
          );
      }
    } catch (err: any) {
      this.logger.error({ err, chatId }, 'Memory command error');
      await this.sender.sendTextNotice(
        chatId,
        '❌ Memory Error',
        `Failed to connect to memory server: ${err.message}`,
        'red',
      );
    }
  }

  private async handleSkillCommand(chatId: string, text: string, botName: string): Promise<void> {
    const args = text.slice('/skill'.length).trim();
    const [subCmd, ...rest] = args.split(/\s+/);
    const skillName = rest.join(' ');

    switch (subCmd) {
      case 'list':
      case '': {
        try {
          const { rows } = await pool.query(
            `SELECT skill_name, enabled FROM bot_skill_bindings WHERE bot_name = $1 ORDER BY skill_name`,
            [botName],
          );
          if (rows.length === 0) {
            await this.sender.sendTextNotice(chatId, '🛠️ Skills', '没有已绑定的 skill。\n全局 skill 默认可用。\n使用 `/skill create <名称>` 创建私有 skill。');
            return;
          }
          const lines = rows.map((r: any) => `${r.enabled ? '✅' : '⛔'} ${r.skill_name}`);
          await this.sender.sendTextNotice(chatId, '🛠️ Skills', lines.join('\n'));
        } catch (err: any) {
          await this.sender.sendTextNotice(chatId, '❌ Skill Error', err.message, 'red');
        }
        break;
      }
      case 'enable':
      case 'disable': {
        if (!skillName) {
          await this.sender.sendTextNotice(chatId, '📝 Skill', 'Usage: `/skill enable <名称>` or `/skill disable <名称>`');
          return;
        }
        const enabled = subCmd === 'enable';
        try {
          await pool.query(
            `INSERT INTO bot_skill_bindings (bot_name, skill_name, enabled) VALUES ($1, $2, $3)
             ON CONFLICT (bot_name, skill_name) DO UPDATE SET enabled = $3`,
            [botName, skillName, enabled],
          );
          await this.sender.sendTextNotice(chatId, '🛠️ Skill', `${enabled ? '✅ 已启用' : '⛔ 已禁用'}: ${skillName}`);
        } catch (err: any) {
          await this.sender.sendTextNotice(chatId, '❌ Skill Error', err.message, 'red');
        }
        break;
      }
      case 'create': {
        if (!skillName) {
          await this.sender.sendTextNotice(chatId, '📝 Skill', 'Usage: `/skill create <名称>` — 在当前 workspace 创建私有 skill');
          return;
        }
        await this.sender.sendTextNotice(
          chatId,
          '🛠️ Skill',
          `要创建私有 skill **${skillName}**，请用自然语言描述这个 skill 的功能，我会帮你生成 SKILL.md。\n\n例如：\n"帮我创建一个 ${skillName} 的 skill，用于..."`,
        );
        break;
      }
      case 'global': {
        // Admin-only: create a global skill
        if (!skillName) {
          await this.sender.sendTextNotice(chatId, '📝 Global Skill', 'Usage: `/skill global <名称>` — 创建全局 skill（仅管理员）');
          return;
        }
        const isAdmin = await isAdminBot(botName);
        if (!isAdmin) {
          await this.sender.sendTextNotice(chatId, '⛔ 权限不足', '只有管理员 bot 才能创建全局 skill。\n使用 `/skill create <名称>` 创建私有 skill。', 'red');
          return;
        }
        await this.sender.sendTextNotice(
          chatId,
          '🛠️ Global Skill',
          `要创建全局 skill **${skillName}**，请描述功能，我会生成 SKILL.md 并安装到所有 bot。`,
        );
        break;
      }
      default:
        await this.sender.sendTextNotice(
          chatId,
          '📝 Skill',
          [
            '**Skill 命令:**',
            '`/skill list` — 查看已绑定的 skill',
            '`/skill enable <名称>` — 启用 skill',
            '`/skill disable <名称>` — 禁用 skill',
            '`/skill create <名称>` — 创建私有 skill',
            '`/skill global <名称>` — 创建全局 skill（管理员）',
          ].join('\n'),
        );
    }
  }

  private async handleSyncCommand(chatId: string, args: string): Promise<void> {
    if (!this.docSync) {
      await this.sender.sendTextNotice(
        chatId,
        '❌ Sync Unavailable',
        'Wiki sync is not configured for this bot.',
        'red',
      );
      return;
    }

    const [subCmd] = args.split(/\s+/);

    if (!subCmd) {
      // Default: trigger full sync
      if (this.docSync.isSyncing()) {
        await this.sender.sendTextNotice(
          chatId,
          '⏳ Sync In Progress',
          'A sync is already running. Please wait.',
          'orange',
        );
        return;
      }

      await this.sender.sendTextNotice(
        chatId,
        '🔄 Sync Started',
        'Syncing MetaMemory documents to Feishu Wiki...',
        'blue',
      );

      try {
        const result = await this.docSync.syncAll();
        const lines = [
          `**Created:** ${result.created}`,
          `**Updated:** ${result.updated}`,
          `**Skipped:** ${result.skipped} (unchanged)`,
          `**Deleted:** ${result.deleted}`,
          `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
        ];
        if (result.errors.length > 0) {
          lines.push('', `**Errors (${result.errors.length}):**`);
          for (const err of result.errors.slice(0, 5)) {
            lines.push(`- ${err}`);
          }
          if (result.errors.length > 5) {
            lines.push(`- ... and ${result.errors.length - 5} more`);
          }
        }
        const color = result.errors.length > 0 ? 'orange' : 'green';
        await this.sender.sendTextNotice(chatId, '✅ Sync Complete', lines.join('\n'), color);
      } catch (err: any) {
        this.logger.error({ err, chatId }, 'Sync command error');
        await this.sender.sendTextNotice(chatId, '❌ Sync Failed', err.message, 'red');
      }
      return;
    }

    switch (subCmd.toLowerCase()) {
      case 'status': {
        const stats = await this.docSync.getStats();
        const spaceId = stats.wikiSpaceId || 'Not configured';
        await this.sender.sendTextNotice(
          chatId,
          '📊 Sync Status',
          [
            `**Wiki Space:** \`${spaceId}\``,
            `**Synced Documents:** ${stats.documentCount}`,
            `**Synced Folders:** ${stats.folderCount}`,
            `**Currently Syncing:** ${this.docSync.isSyncing() ? 'Yes' : 'No'}`,
          ].join('\n'),
        );
        break;
      }
      default:
        await this.sender.sendTextNotice(
          chatId,
          '📝 Sync',
          'Usage:\n- `/sync` — Sync all documents to Feishu Wiki\n- `/sync status` — Show sync status',
          'blue',
        );
    }
  }

  private async handleModelCommand(chatId: string, args: string): Promise<void> {
    const session = this.sessionManager.getSession(chatId);
    const botEngine = resolveEngineName(this.config);
    const activeEngine = session.engine ?? botEngine;
    const botDefault = this.defaultModelForEngine(activeEngine);

    // No args — show current model
    if (!args) {
      const active = session.model || botDefault || '_default_';
      const exampleModels = this.exampleModelsForEngine(activeEngine);
      const lines = [
        `**Engine:** \`${activeEngine}\`${session.engine ? ' (session override)' : ''}`,
        `**Active:** \`${active}\`${session.model ? ' (session override)' : ''}`,
        `**Bot default:** \`${botDefault || '_unset_'}\``,
        '',
        'Usage:',
        '- `/model list` — Show available engines + models',
        '- `/model claude`, `/model kimi`, or `/model codex` — Switch engine (resets session)',
        `- \`/model <name>\` — Set session model (e.g. ${exampleModels})`,
        '- `/model reset` — Clear overrides, use bot defaults',
      ];
      await this.sender.sendTextNotice(chatId, '🤖 Model', lines.join('\n'));
      return;
    }

    const normalized = args.toLowerCase();

    // Engine switch — /model claude, /model kimi, or /model codex
    if (isEngineName(normalized)) {
      if (activeEngine === normalized) {
        await this.sender.sendTextNotice(
          chatId,
          'ℹ️ Already using ' + normalized,
          `This chat is already on the \`${normalized}\` engine.`,
          'blue',
        );
        return;
      }
      this.sessionManager.setSessionEngine(chatId, normalized);
      await this.sender.sendTextNotice(
        chatId,
        `✅ Engine switched to ${normalized}`,
        [
          `Next message will run on the **${normalized}** engine.`,
          '',
          '_Session ID and model override cleared — a fresh conversation starts on the next turn._',
          this.authTipForEngine(normalized),
        ].join('\n'),
        'green',
      );
      return;
    }

    // List available models
    if (normalized === 'list' || normalized === 'ls') {
      const active = session.model || botDefault;
      const claudeModels = [
        { id: 'claude-opus-4-7', label: 'Opus 4.7', note: 'Most capable · 200k context' },
        { id: 'claude-opus-4-7[1m]', label: 'Opus 4.7 (1M)', note: '1M context window' },
        { id: 'claude-opus-4-6', label: 'Opus 4.6', note: '200k context' },
        { id: 'claude-opus-4-6[1m]', label: 'Opus 4.6 (1M)', note: '1M context window' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', note: 'Balanced · 200k context' },
        { id: 'claude-sonnet-4-6[1m]', label: 'Sonnet 4.6 (1M)', note: '1M context window' },
        { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Fastest · 200k context' },
      ];
      const kimiModels = [
        { id: 'kimi-for-coding', label: 'Kimi for Coding', note: 'Subscription default · 256k context · thinking' },
        { id: 'kimi-k2', label: 'Kimi K2', note: 'Legacy coding model' },
      ];
      const codexModels = [
        { id: 'gpt-5.4-codex', label: 'GPT-5.4 Codex', note: 'Recommended Codex coding model' },
        { id: 'gpt-5.4', label: 'GPT-5.4', note: 'General flagship model' },
        { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', note: 'Legacy Codex coding model' },
      ];
      const models = activeEngine === 'kimi' ? kimiModels : activeEngine === 'codex' ? codexModels : claudeModels;
      const header =
        activeEngine === 'kimi'
          ? '**Available Kimi models:**'
          : activeEngine === 'codex'
            ? '**Common Codex models:**'
            : '**Available Claude models:**';
      const lines = [
        `**Current engine:** \`${activeEngine}\`${session.engine ? ' (session override)' : ''}`,
        '',
        '**Engines:** `/model claude`, `/model kimi`, or `/model codex` to switch.',
        '',
        header,
        '',
      ];
      for (const m of models) {
        const marker = m.id === active ? ' ✅' : '';
        lines.push(`- \`${m.id}\` — ${m.label} · ${m.note}${marker}`);
      }
      lines.push('');
      if (activeEngine === 'claude') {
        lines.push(
          '_Tip: append `[1m]` to a model name to enable the 1M context window. Only Opus 4.7/4.6 and Sonnet 4.6 support it._',
        );
      } else if (activeEngine === 'codex') {
        lines.push('_Tip: leave unset to use the Codex CLI default from `~/.codex/config.toml`._');
      } else {
        lines.push(
          '_Tip: leave unset to use the kimi-cli default (recommended for subscription users — the server picks the best available)._',
        );
      }
      lines.push('Use `/model <name>` to set the model for the current engine.');
      await this.sender.sendTextNotice(chatId, '🤖 Available Models', lines.join('\n'));
      return;
    }

    // Reset — clear overrides (both engine AND model)
    if (normalized === 'reset' || normalized === 'clear' || normalized === 'default') {
      this.sessionManager.setSessionModel(chatId, undefined);
      this.sessionManager.setSessionEngine(chatId, undefined);
      const fallback = botDefault || '_default_';
      await this.sender.sendTextNotice(
        chatId,
        '✅ Overrides Cleared',
        `Session engine and model overrides cleared. Using bot defaults: engine \`${botEngine}\`, model \`${fallback}\`.`,
        'green',
      );
      return;
    }

    // Set the model (use only the first token, ignore trailing junk)
    const newModel = args.split(/\s+/)[0];
    this.sessionManager.setSessionModel(chatId, newModel, activeEngine);
    await this.sender.sendTextNotice(
      chatId,
      '✅ Model Set',
      `Session model set to \`${newModel}\` on engine \`${activeEngine}\`. It will take effect on the next message.`,
      'green',
    );
  }

  private defaultModelForEngine(engine: EngineName): string | undefined {
    switch (engine) {
      case 'claude':
        return this.config.claude.model;
      case 'kimi':
        return this.config.kimi?.model;
      case 'codex':
        return this.config.codex?.model || this.config.codex?.displayModel;
      case 'openai-compat':
        return this.config.openaiCompat?.model;
    }
  }

  private exampleModelsForEngine(engine: EngineName): string {
    switch (engine) {
      case 'claude':
        return '`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`';
      case 'kimi':
        return '`kimi-for-coding`, `kimi-k2`';
      case 'codex':
        return '`gpt-5.4-codex`, `gpt-5.4`, `gpt-5.2-codex`';
      case 'openai-compat':
        return '`glm-4-flash`, `deepseek-chat`, `abab-6.5s-chat`';
    }
  }

  private authTipForEngine(engine: EngineName): string {
    switch (engine) {
      case 'claude':
        return '_Make sure Claude Code is authenticated (`claude login`)._';
      case 'kimi':
        return '_Make sure `kimi login` has been completed on this host._';
      case 'codex':
        return '_Make sure Codex CLI is authenticated (`codex login`) or configured with an API key._';
      case 'openai-compat':
        return "_API Key is configured in the bot's openaiCompat settings._";
    }
  }
}

function isEngineName(value: string): value is EngineName {
  return value === 'claude' || value === 'kimi' || value === 'codex' || value === 'openai-compat';
}
