/**
 * Group Coordinator — receives @mention messages in Feishu groups,
 * routes to specialist bots, and each specialist speaks in the group
 * with its own Feishu identity (white-box collaboration).
 */
import type { BotRegistry } from './bot-registry.js';
import type { AgentBus } from './agent-bus.js';
import type { GroupSessionManager } from './group-session.js';
import type { IntentRouter } from './intent-router.js';
import type { Logger } from '../utils/logger.js';
import type { IncomingMessage } from '../types.js';
import type { BindingEngine } from './routing-bindings.js';
import type { CoordinatorConfigStore } from '../db/coordinator-config-store.js';
import { buildCard, buildFileManifestCard, buildConfirmationCard, type ConfirmationState, type FileManifestEntry } from '../feishu/card-builder.js';
import { loadOrchSession } from '../bridge/orchestrator/orch-session-store.js';
import type { CardState, ToolCall } from '../types.js';
import type { ApiTaskResult } from '../bridge/message-bridge.js';
import type { OutputFile } from '../bridge/outputs-manager.js';
import type { OutputArchiver } from '../bridge/output-archiver.js';

export interface CoordinatorConfig {
  /** Bot name that acts as the coordinator. */
  coordinatorBot: string;
  /** Group IDs this coordinator manages. If empty, manages all groups. */
  groupIds?: string[];
  /** Default specialists to call when no specific routing matches. */
  defaultSpecialists?: string[];
}

export class GroupCoordinator {
  private configs: CoordinatorConfig[] = [];
  /** Per-group team configs set via /team commands. */
  private teamConfigs = new Map<string, string[]>();
  /** Per-group coordinator set via /coordinator command. Overrides config-based coordinator. */
  private groupCoordinators = new Map<string, string>();
  private outputArchiver?: OutputArchiver;
  private workspaceManager?: import('../memory/workspace-manager.js').WorkspaceManager;
  /** confirmationId -> { resolve, timer, groupId, messageId, lastCard } */
  private pendingConfirmations = new Map<string, {
    resolve: (confirmed: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
    groupId: string;
    messageId?: string;
  }>();
  /** Default 60s — after which the task auto-confirms to avoid deadlocking the group. */
  private readonly confirmationTimeoutMs = 60_000;

  constructor(
    private registry: BotRegistry,
    private bus: AgentBus,
    private sessions: GroupSessionManager,
    private router: IntentRouter,
    private logger: Logger,
    private bindingEngine?: BindingEngine,
    private configStore?: CoordinatorConfigStore,
  ) {
    this.reloadFromDB();
  }

  setOutputArchiver(archiver: OutputArchiver): void {
    this.outputArchiver = archiver;
  }

  setWorkspaceManager(wm: import('../memory/workspace-manager.js').WorkspaceManager): void {
    this.workspaceManager = wm;
  }

  addConfig(config: CoordinatorConfig): void {
    this.configs.push(config);
    this.logger.info(
      { coordinatorBot: config.coordinatorBot, defaultSpecialists: config.defaultSpecialists },
      'GroupCoordinator: config registered',
    );
  }

  /** Whether this group has any coordinator configured (DB or code). */
  hasGroupCoordinator(groupId: string): boolean {
    return (
      !!this.groupCoordinators.get(groupId) ||
      this.configs.some((c) => !c.groupIds?.length || c.groupIds.includes(groupId))
    );
  }

  isCoordinator(botName: string, groupId?: string): boolean {
    // Check dynamic per-group coordinator first
    if (groupId) {
      const dynamicCoord = this.groupCoordinators.get(groupId);
      if (dynamicCoord) return dynamicCoord === botName;
    }
    return this.configs.some(
      (c) => c.coordinatorBot === botName && (!c.groupIds?.length || !groupId || c.groupIds.includes(groupId)),
    );
  }

  async handleGroupMessage(msg: IncomingMessage): Promise<void> {
    const groupId = msg.chatId;
    const userText = (msg.text || '').trim();
    const botName = this.findCoordinatorForGroup(groupId);
    if (!botName) return;

    this.logger.info({ groupId, botName, text: userText.slice(0, 100) }, 'GroupCoordinator: handling group message');
    this.sessions.addMessage(groupId, msg.userId, 'user', userText);

    // --- Command parsing ---
    if (/^\/coordinator\b/i.test(userText)) {
      await this.handleCoordinatorCommand(groupId, botName, userText);
      return;
    }
    if (/^\/team\b/i.test(userText)) {
      await this.handleTeamCommand(groupId, botName, userText);
      return;
    }
    if (/^\/ask\s/i.test(userText)) {
      await this.handleAskCommand(groupId, botName, msg.chatId, userText);
      return;
    }
    // --- End command parsing ---

    // Two-step routing: coordinator analyzes first, then code dispatches to selected specialists
    await this.twoStepRouting(groupId, botName, userText);
  }

  /** Step 1: ask coordinator to analyze & assign; Step 2: dispatch to selected specialists only. */
  private async twoStepRouting(groupId: string, coordinatorBot: string, userText: string): Promise<void> {
    const teamMembers = this.teamConfigs.get(groupId) ?? [];
    if (teamMembers.length === 0) {
      this.logger.warn({ groupId }, 'GroupCoordinator: no team configured, cannot route');
      await this.replyInGroup(groupId, coordinatorBot, '⚠️ 团队尚未设置。请先使用 /team 设置团队成员。');
      return;
    }

    // Send immediate thinking indicator
    const bot = this.registry.get(coordinatorBot);
    if (bot) {
      try {
        await bot.sender.sendCard(groupId, {
          status: 'thinking',
          userPrompt: userText,
          responseText: '',
          toolCalls: [],
        });
      } catch {
        /* non-critical */
      }
    }

    const routingPrompt = [
      `用户需求: "${userText}"`,
      ``,
      `可用团队成员: ${teamMembers.join(', ')}`,
      ``,
      `请分析这个需求，决定应该分配给哪些成员处理。`,
      `你必须只输出如下JSON格式，不要输出其他任何内容:`,
      `{"analysis":"简要分析","assignments":[{"bot":"Bot名称","task":"具体任务描述"}]}`,
    ].join('\n');

    this.logger.info({ groupId, coordinatorBot }, 'GroupCoordinator: Step 1 — asking coordinator for routing decision');

    const routingResult = await this.bus.sendToBot({
      targetBot: coordinatorBot,
      prompt: routingPrompt,
      chatId: groupId,
      sendCards: false,
      maxTurns: 1,
      groupId,
    });

    if (!routingResult.success || !routingResult.responseText) {
      this.logger.error({ groupId, error: routingResult.error }, 'GroupCoordinator: routing analysis failed');
      await this.dispatchToAll(groupId, coordinatorBot, userText, teamMembers);
      return;
    }

    this.logger.info(
      { groupId, response: routingResult.responseText.slice(0, 500) },
      'GroupCoordinator: routing decision received',
    );

    let assignments: Array<{ bot: string; task: string }> = [];
    try {
      const jsonMatch = routingResult.responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        assignments = parsed.assignments ?? [];
      }
    } catch (err: any) {
      this.logger.warn({ err, groupId }, 'GroupCoordinator: failed to parse routing JSON');
    }

    if (assignments.length === 0) {
      this.logger.warn({ groupId }, 'GroupCoordinator: no assignments parsed, falling back to broadcast');
      await this.dispatchToAll(groupId, coordinatorBot, userText, teamMembers);
      return;
    }

    const validAssignments = assignments.filter((a) => teamMembers.includes(a.bot));
    if (validAssignments.length === 0) {
      this.logger.warn({ groupId, assignments }, 'GroupCoordinator: no valid assignments, falling back to broadcast');
      await this.dispatchToAll(groupId, coordinatorBot, userText, teamMembers);
      return;
    }

    this.logger.info(
      { groupId, dispatchTo: validAssignments.map((a) => a.bot) },
      'GroupCoordinator: Step 2a — sending confirmation card before dispatch',
    );

    // Phase 2 (snuggly): wait for user to confirm/cancel before dispatching
    const confirmed = await this.waitForConfirmation(groupId, {
      userTask: userText,
      assignments: validAssignments,
    });
    if (!confirmed) {
      this.logger.info({ groupId }, 'GroupCoordinator: user cancelled the dispatch');
      await this.replyInGroup(groupId, coordinatorBot, '🚫 已取消本次任务分配。');
      return;
    }

    this.logger.info(
      { groupId, dispatchTo: validAssignments.map((a) => a.bot) },
      'GroupCoordinator: Step 2b — dispatching to selected specialists',
    );

    await this.dispatchWithStreamingCard(groupId, coordinatorBot, validAssignments, userText);
  }

  /** Fallback: broadcast to all team members. */
  private async dispatchToAll(
    groupId: string,
    coordinatorBot: string,
    userText: string,
    teamMembers: string[],
  ): Promise<void> {
    this.logger.info({ groupId, teamMembers }, 'GroupCoordinator: broadcasting to all team members');
    const assignments = teamMembers.map((m) => ({ bot: m, task: userText }));
    await this.dispatchWithStreamingCard(groupId, coordinatorBot, assignments, userText);
  }

  // ── /coordinator command ──────────────────────────────────────

  private async handleCoordinatorCommand(groupId: string, botName: string, text: string): Promise<void> {
    const parts = text.split(/\s+/).filter(Boolean);
    const sub = parts[1];

    if (!sub || sub.toLowerCase() === 'list' || sub.toLowerCase() === 'who') {
      const current = this.groupCoordinators.get(groupId);
      if (current) {
        await this.replyInGroup(groupId, botName, `📢 当前群的协调员是: ${current}`);
      } else {
        const configCoord = this.findConfigForGroup(groupId)?.coordinatorBot;
        if (configCoord) {
          await this.replyInGroup(groupId, botName, `📢 当前群的协调员是: ${configCoord} (配置文件指定)`);
        } else {
          await this.replyInGroup(
            groupId,
            botName,
            '📋 当前群没有设置协调员。\n用法: /coordinator Bot名\n例如: /coordinator shan-jian-forge',
          );
        }
      }
      return;
    }

    if (sub.toLowerCase() === 'clear') {
      this.groupCoordinators.delete(groupId);
      await this.persistGroup(groupId);
      await this.replyInGroup(groupId, botName, '🗑️ 协调员已清除。');
      return;
    }

    // Validate bot name
    const valid = this.validateBotNames([sub]);
    if (valid.length === 0) {
      await this.replyInGroup(groupId, botName, `❌ "${sub}" 不是已注册的Bot。可用的Bot:\n${this.listAvailableBots()}`);
      return;
    }

    this.groupCoordinators.set(groupId, valid[0]);
    await this.persistGroup(groupId);
    this.logger.info({ groupId, coordinator: valid[0] }, 'GroupCoordinator: coordinator set via /coordinator command');
    await this.replyInGroup(
      groupId,
      botName,
      `✅ 协调员已设为: ${valid[0]}\n现在可以 @${valid[0]} 发任务，或使用 /team 设置团队成员。`,
    );
  }

  /** Check if text is a /coordinator command — used by event-handler for pre-check. */
  isCoordinatorCommand(text: string): boolean {
    return /^\/coordinator\b/i.test((text || '').trim());
  }

  /** Handle /coordinator command from ANY bot (pre-check in event-handler). */

  /**
   * Phase 2 (snuggly): send a confirmation card and wait for the user
   * to click confirm/cancel (or auto-confirm on timeout). Returns
   * true if confirmed (or auto-confirmed), false if cancelled.
   */
  async waitForConfirmation(
    groupId: string,
    state: Omit<ConfirmationState, 'confirmationId' | 'timeoutSeconds'> & { confirmationId?: string; timeoutSeconds?: number },
  ): Promise<boolean> {
    const confirmationId = state.confirmationId ?? `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutSeconds = state.timeoutSeconds ?? 60;
    const cardState: ConfirmationState = { ...state, confirmationId, timeoutSeconds };
    const cardJson = buildConfirmationCard(cardState);

    const botName = this.findCoordinatorForGroup(groupId);
    const bot = botName ? this.registry.get(botName) : undefined;
    if (!bot) {
      this.logger.warn({ groupId }, 'GroupCoordinator: no coordinator bot, auto-confirming');
      return true;
    }

    try {
      // sendRawCard returns Promise<void>; we just want the call to succeed.
      await bot.sender.sendRawCard(groupId, cardJson);
    } catch (err: any) {
      this.logger.error({ err, groupId }, 'GroupCoordinator: failed to send confirmation card, auto-confirming');
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingConfirmations.has(confirmationId)) {
          this.pendingConfirmations.delete(confirmationId);
          this.logger.info({ confirmationId, groupId }, 'GroupCoordinator: confirmation timed out, auto-confirming');
          resolve(true);
        }
      }, timeoutSeconds * 1000);
      this.pendingConfirmations.set(confirmationId, { resolve, timer, groupId });
    });
  }

  /**
   * Phase 3: handle a "回到主线" click. Loads the orch-sessions
   * snapshot and delegates to the orchestrator's resumeById.
   * Replies in the chat with a status message (already-running
   * / not found / resumed).
   */
  async handleOrchResume(sessionId: string, chatId: string, userId: string): Promise<void> {
    const orch = (this as any).orchestrator;
    if (!orch || typeof orch.resumeById !== 'function') {
      this.logger.warn({ sessionId, chatId }, 'handleOrchResume: orchestrator not wired');
      await this.replyInGroup(chatId, this.findCoordinatorForGroup(chatId) ?? '', '⚠️ 协调器未连接，无法续跑。');
      return;
    }
    const saved = loadOrchSession(sessionId);
    if (!saved) {
      await this.replyInGroup(chatId, this.findCoordinatorForGroup(chatId) ?? '', '⚠️ 该任务已过期或不存在（7 天 TTL），无法续跑。');
      return;
    }
    await this.replyInGroup(chatId, this.findCoordinatorForGroup(chatId) ?? '', `🔙 正在回到主线任务：${saved.intentName}…`);
    // Best-effort resume; the orchestrator will update the same
    // sessionId's snapshot as the run progresses.
    try {
      const msg: any = { chatId, userId, text: saved.userMessage };
      const result = await orch.resumeById(sessionId, msg, {} as any, new AbortController(), (cid: string) => this.registry.get(this.findCoordinatorForGroup(cid) ?? '')?.sender);
      await this.replyInGroup(chatId, this.findCoordinatorForGroup(chatId) ?? '', result?.success ? '✅ 已续跑完成' : `⚠️ 续跑未成功：${result?.error ?? '未知'}`);
    } catch (err: any) {
      this.logger.error({ err, sessionId }, 'handleOrchResume: orchestrator threw');
      await this.replyInGroup(chatId, this.findCoordinatorForGroup(chatId) ?? '', `❌ 续跑失败：${err.message ?? err}`);
    }
  }

    /**
   * Called by the card-action dispatcher when the user clicks
   * confirm or cancel on a confirmation card. Resolves the
   * matching pending promise. Unknown ids are ignored.
   */
  async handleConfirmationAction(confirmationId: string, confirmed: boolean): Promise<void> {
    const entry = this.pendingConfirmations.get(confirmationId);
    if (!entry) {
      this.logger.warn({ confirmationId }, 'GroupCoordinator: confirmation action for unknown id (already resolved?)');
      return;
    }
    clearTimeout(entry.timer);
    this.pendingConfirmations.delete(confirmationId);
    this.logger.info({ confirmationId, groupId: entry.groupId, confirmed }, 'GroupCoordinator: user responded to confirmation card');
    entry.resolve(confirmed);
  }

    async handlePreCheckCoordinatorCommand(msg: IncomingMessage, currentBotName: string): Promise<boolean> {
    const text = (msg.text || '').trim();
    if (!this.isCoordinatorCommand(text)) return false;
    await this.handleCoordinatorCommand(msg.chatId, currentBotName, text);
    return true;
  }

  // ── /team command ────────────────────────────────────────────

  private async handleTeamCommand(groupId: string, botName: string, text: string): Promise<void> {
    const parts = text.split(/\s+/).filter(Boolean);
    const sub = parts[1]?.toLowerCase();

    if (!sub || sub === 'list') {
      const team = this.teamConfigs.get(groupId);
      const config = this.findConfigForGroup(groupId);
      const defaults = config?.defaultSpecialists ?? [];
      const active = team ?? defaults;
      const lines: string[] = [];

      if (active.length > 0) {
        lines.push('📋 当前团队成员:');
        active.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
      } else {
        lines.push('📋 当前没有设置团队，将使用智能路由。');
        lines.push('用法:');
        lines.push('  /team Bot名1 Bot名2 — 设置团队');
        lines.push('  /team clear — 清除团队');
        lines.push('  /ask Bot名1 Bot名2 任务描述 — 一次性指定');
      }
      await this.replyInGroup(groupId, botName, lines.join('\n'));
      return;
    }

    if (sub === 'clear') {
      this.teamConfigs.delete(groupId);
      await this.persistGroup(groupId);
      this.logger.info({ groupId }, 'GroupCoordinator: team cleared');
      await this.replyInGroup(groupId, botName, '🗑️ 团队已清除，后续将使用智能路由。');
      return;
    }

    const candidates = parts.slice(1);
    const valid = this.validateBotNames(candidates);
    if (valid.length === 0) {
      await this.replyInGroup(groupId, botName, `❌ 未找到有效的Bot名称。可用的飞书Bot:\n${this.listAvailableBots()}`);
      return;
    }

    this.teamConfigs.set(groupId, valid);
    await this.persistGroup(groupId);
    this.logger.info({ groupId, team: valid }, 'GroupCoordinator: team set via /team command');
    await this.replyInGroup(groupId, botName, `✅ 团队已设置: ${valid.join(', ')}\n现在可以直接发任务了。`);
  }

  // ── /ask command ─────────────────────────────────────────────

  private async handleAskCommand(groupId: string, botName: string, chatId: string, text: string): Promise<void> {
    const parts = text.split(/\s+/).filter(Boolean);
    const knownBots = new Set(this.registry.list().map((b) => b.name));
    const specialists: string[] = [];
    let taskStart = -1;

    for (let i = 1; i < parts.length; i++) {
      if (knownBots.has(parts[i])) {
        specialists.push(parts[i]);
      } else {
        taskStart = i;
        break;
      }
    }

    if (taskStart === -1) taskStart = specialists.length + 1;
    const task = parts.slice(taskStart).join(' ');

    if (specialists.length === 0) {
      await this.replyInGroup(
        groupId,
        botName,
        '❌ 用法: /ask Bot名1 Bot名2 任务描述\n例如: /ask 情报分析员 分析竞品动态',
      );
      return;
    }
    if (!task) {
      await this.replyInGroup(groupId, botName, '❌ 请提供任务描述。用法: /ask Bot名1 任务描述');
      return;
    }

    const valid = this.validateBotNames(specialists);
    const assignments = valid.map((m) => ({ bot: m, task }));
    await this.replyInGroup(groupId, botName, `📤 正在分配任务给: ${valid.join(', ')}...`);

    this.logger.info({ groupId, specialists: valid, task: task.slice(0, 100) }, 'GroupCoordinator: /ask dispatching');

    await this.dispatchWithStreamingCard(groupId, botName, assignments, task, chatId);
  }

  // ── helpers ──────────────────────────────────────────────────

  async reloadFromDB(): Promise<void> {
    if (!this.configStore) return;
    try {
      const rows = await this.configStore.list();
      for (const row of rows) {
        if (row.coordinatorBot) this.groupCoordinators.set(row.groupId, row.coordinatorBot);
        if (row.teamMembers.length > 0) this.teamConfigs.set(row.groupId, row.teamMembers);
      }
      this.logger.info({ count: rows.length }, 'GroupCoordinator: loaded configs from DB');
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'GroupCoordinator: failed to load DB configs');
    }
  }

  private async persistGroup(groupId: string): Promise<void> {
    if (!this.configStore) return;
    try {
      const coordinatorBot = this.groupCoordinators.get(groupId) || '';
      const teamMembers = this.teamConfigs.get(groupId) || [];
      if (coordinatorBot || teamMembers.length > 0) {
        await this.configStore.upsert(groupId, { coordinatorBot, teamMembers });
      }
    } catch (err: any) {
      this.logger.warn({ err: err?.message, groupId }, 'GroupCoordinator: failed to persist');
    }
  }

  private validateBotNames(names: string[]): string[] {
    const registered = new Set(this.registry.list().map((b) => b.name));
    return names.filter((n) => registered.has(n));
  }

  private listAvailableBots(): string {
    return this.registry
      .list()
      .filter((b) => b.platform === 'feishu')
      .map((b) => `  • ${b.name}`)
      .join('\n');
  }

  private async replyInGroup(groupId: string, botName: string, text: string): Promise<void> {
    const bot = this.registry.get(botName);
    if (!bot) return;
    try {
      await bot.sender.sendText(groupId, text);
    } catch (err: any) {
      this.logger.error({ err, groupId, botName }, 'GroupCoordinator: failed to reply in group');
    }
  }

  private findCoordinatorForGroup(groupId: string): string | undefined {
    const dynamic = this.groupCoordinators.get(groupId);
    if (dynamic) return dynamic;
    const config = this.configs.find((c) => !c.groupIds?.length || c.groupIds.includes(groupId));
    return config?.coordinatorBot;
  }

  private findConfigForGroup(groupId: string): CoordinatorConfig | undefined {
    return this.configs.find((c) => !c.groupIds?.length || c.groupIds.includes(groupId));
  }

  private async routeToSpecialists(message: string, groupId: string): Promise<string[]> {
    const config = this.findConfigForGroup(groupId);

    // 1. Database bindings (admin-panel configured) — highest priority
    if (this.bindingEngine) {
      try {
        const dbBots = await this.bindingEngine.findMatches(groupId, message);
        if (dbBots.length > 0) return dbBots;
      } catch (err: any) {
        this.logger.warn({ err, groupId }, 'GroupCoordinator: BindingEngine query failed');
      }
    }

    // 2. Per-group /team override (in-chat configured)
    const teamOverride = this.teamConfigs.get(groupId);
    if (teamOverride?.length) {
      return teamOverride;
    }

    // 3. Code-level defaultSpecialists
    if (config?.defaultSpecialists?.length) {
      return config.defaultSpecialists;
    }

    const availableBots = this.registry.list().filter((b) => b.platform === 'feishu');
    try {
      const result = await this.router.route(message, availableBots);
      if (result.targetBot) return [result.targetBot];
    } catch {
      // Router failed
    }

    const coordinatorBot = config?.coordinatorBot;
    return availableBots
      .filter((b) => b.name !== coordinatorBot)
      .map((b) => b.name)
      .slice(0, 3);
  }

  /** Dispatch tasks to specialists with a live streaming card from the coordinator. */
  private async dispatchWithStreamingCard(
    groupId: string,
    coordinatorBotName: string,
    assignments: Array<{ bot: string; task: string }>,
    userTask: string,
    chatId?: string,
  ): Promise<void> {
    const coordinatorBot = this.registry.get(coordinatorBotName);
    if (!coordinatorBot) return;

    const specialistNames = assignments.map((a) => a.bot);
    const startTime = Date.now();

    // Track per-specialist state and files
    const specialistStates = new Map<
      string,
      { status: 'running' | 'done'; responseText: string; error?: string; durationMs?: number }
    >();
    const specialistFiles = new Map<string, OutputFile[]>();
    for (const a of assignments) {
      specialistStates.set(a.bot, { status: 'running', responseText: '' });
      specialistFiles.set(a.bot, []);
    }

    // Build initial tool calls: each specialist as a "tool call" in running state
    const toolCalls: ToolCall[] = assignments.map((a) => ({
      name: a.bot,
      detail: a.task,
      status: 'running' as const,
    }));

    const initialState: CardState = {
      status: 'running',
      userPrompt: userTask,
      responseText: '',
      toolCalls,
    };

    // Create the streaming card
    let cardMessageId: string | undefined;
    try {
      cardMessageId = await coordinatorBot.sender.sendCard(groupId, initialState);
    } catch (err: any) {
      this.logger.error({ err, groupId }, 'GroupCoordinator: failed to create streaming card');
    }

    // Throttled card update
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL_MS = 2000;
    const updateCard = () => {
      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_INTERVAL_MS || !cardMessageId) return;
      lastUpdateTime = now;

      const completedCount = Array.from(specialistStates.values()).filter((s) => s.status === 'done').length;
      const allDone = completedCount === assignments.length;

      const currentToolCalls: ToolCall[] = assignments.map((a) => {
        const s = specialistStates.get(a.bot)!;
        return { name: a.bot, detail: a.task, status: s.status };
      });

      const parts: string[] = [];
      for (const a of assignments) {
        const s = specialistStates.get(a.bot)!;
        if (s.status === 'done') {
          const icon = s.error ? '❌' : '✅';
          const preview = s.responseText?.slice(0, 800) || s.error || 'done';
          parts.push(`**${icon} ${a.bot}** — ${a.task}\n${preview}`);
        }
      }

      const state: CardState = {
        status: allDone ? 'complete' : 'running',
        userPrompt: userTask,
        responseText: parts.join('\n\n---\n\n'),
        toolCalls: currentToolCalls,
        durationMs: allDone ? Date.now() - startTime : undefined,
      };

      coordinatorBot.sender.updateCard(cardMessageId, state).catch(() => {});
    };

    // Dispatch with onUpdate + file collection
    const effectiveChatId = chatId || groupId;
    const results = await this.bus.sendToSpecialists(specialistNames, userTask, effectiveChatId, groupId, {
      sendCards: false,
      skipOutputFiles: true,
      groupMembers: specialistNames,
      onSpecialistUpdate: (botName, state, _msgId, final) => {
        if (final) {
          const s = specialistStates.get(botName);
          if (s) {
            s.status = 'done';
            s.responseText = state.responseText || '';
            s.error = state.errorMessage;
            s.durationMs = state.durationMs;
          }
        }
        updateCard();
      },
      onSpecialistFiles: (botName, files) => {
        specialistFiles.set(botName, files);
      },
    });

    // Save session messages
    for (const [name, result] of results) {
      if (result.success && result.responseText) {
        this.sessions.addMessage(groupId, name, 'assistant', result.responseText);
      }
    }

    // Build file inventory from all specialists
    const allFiles: Array<{ bot: string; file: OutputFile }> = [];
    for (const [name, files] of specialistFiles) {
      for (const f of files) {
        allFiles.push({ bot: name, file: f });
      }
    }

    // Send only the last/largest file as final deliverable
    let finalFile: OutputFile | undefined;
    if (allFiles.length > 0) {
      // Pick the largest non-image file as the "final deliverable"
      const nonImageFiles = allFiles.filter((f) => !f.file.isImage);
      if (nonImageFiles.length > 0) {
        finalFile = nonImageFiles[nonImageFiles.length - 1].file;
      }
    }

    // Build final card with file inventory
    const finalToolCalls: ToolCall[] = assignments.map((a) => {
      const s = specialistStates.get(a.bot)!;
      return { name: a.bot, detail: a.task, status: s.status };
    });

    const finalParts: string[] = [];
    for (const a of assignments) {
      const r = results.get(a.bot);
      const s = specialistStates.get(a.bot)!;
      if (s.status === 'done' || r) {
        const icon = r?.success ? '✅' : '❌';
        const isTurnError = r?.error?.includes('maximum number of turn');
        const durationStr = s.durationMs ? ` (${Math.round(s.durationMs / 1000)}s)` : '';
        const preview = r?.responseText?.slice(0, 800) || r?.error || 'done';
        finalParts.push(`**${icon} ${a.bot}** — ${a.task}${durationStr}\n${preview}`);
        if (isTurnError) {
          finalParts.push('💡 建议：将任务拆分为更小的子任务后重试');
        }
      }
    }

    // File inventory section
    if (allFiles.length > 0) {
      finalParts.push('\n---\n');
      finalParts.push(`📁 **产出文件** (${allFiles.length} 个)`);
      for (const { bot, file } of allFiles) {
        const sizeKB = Math.round(file.sizeBytes / 1024);
        const marker = file === finalFile ? ' ⭐最终成果' : '';
        finalParts.push(`- ${file.fileName} (${sizeKB}KB) — ${bot}${marker}`);
      }
    }

    // Archive specialist output files to memory
    if (this.outputArchiver) {
      for (const [botName, files] of specialistFiles) {
        if (files.length > 0) {
          if (this.workspaceManager) {
            this.outputArchiver.archiveFilesForGroup(groupId, botName, files, this.workspaceManager).catch(() => {});
          } else {
            this.outputArchiver.archiveFiles(botName, files).catch(() => {});
          }
        }
      }
    }

    const finalState: CardState = {
      status: 'complete',
      userPrompt: userTask,
      responseText: finalParts.join('\n\n'),
      toolCalls: finalToolCalls,
      durationMs: Date.now() - startTime,
    };

    if (cardMessageId) {
      try {
        await coordinatorBot.sender.updateCard(cardMessageId, finalState);
      } catch (err: any) {
        this.logger.error({ err, groupId }, 'GroupCoordinator: failed to update final card');
      }
    }

    // Send only the final deliverable file
    if (finalFile) {
      try {
        this.logger.info({ fileName: finalFile.fileName }, 'GroupCoordinator: sending final deliverable file');
        await coordinatorBot.sender.sendLocalFile(groupId, finalFile.filePath, `最终成果_${finalFile.fileName}`);
      } catch (err: any) {
        this.logger.error({ err, groupId }, 'GroupCoordinator: failed to send final file');
      }
    }

    // Send a dedicated "file manifest" card (green header, one line per file,
    // ⭐ on the final deliverable). Phase 1 of the snuggly plan: a clean
    // inventory separate from the streaming progress card.
    if (allFiles.length > 0) {
      try {
        const manifestFiles: FileManifestEntry[] = allFiles.map(({ bot, file }) => ({
          fileName: file.fileName,
          sizeBytes: file.sizeBytes,
          isImage: file.isImage,
          botName: bot,
          isFinal: file === finalFile,
        }));
        const totalSizeKB = manifestFiles.reduce((sum, f) => sum + f.sizeBytes, 0) / 1024;
        const manifestJson = buildFileManifestCard({
          userTask,
          files: manifestFiles,
          totalSizeKB,
        });
        await coordinatorBot.sender.sendRawCard(groupId, manifestJson);
        this.logger.info({ fileCount: manifestFiles.length, groupId }, 'GroupCoordinator: sent file manifest card');
      } catch (err: any) {
        this.logger.error({ err, groupId }, 'GroupCoordinator: failed to send file manifest card');
      }
    }
  }
}
