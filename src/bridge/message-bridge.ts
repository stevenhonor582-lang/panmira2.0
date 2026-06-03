import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { BotConfigBase } from '../config.js';
import { isUserAllowed, resolveUserRole } from "../auth/role-permissions.js";
import type { Logger } from '../utils/logger.js';
import type { IncomingMessage, CardState, PendingQuestion } from '../types.js';
import type { IMessageSender } from './message-sender.interface.js';
import type { DocSync } from '../sync/doc-sync.js';
import type { Engine, Executor, ExecutionHandle, EngineName } from '../engines/index.js';
import { createEngine, resolveEngineName, StreamProcessor, SessionManager } from '../engines/index.js';
import { RateLimiter } from './rate-limiter.js';
import { OutputsManager } from './outputs-manager.js';
import { MemoryClient } from '../memory/memory-client.js';
import { AuditLogger } from '../utils/audit-logger.js';
import { CommandHandler } from './command-handler.js';
import { pool } from '../db/index.js';
import { OutputHandler } from './output-handler.js';
import { CostTracker } from '../utils/cost-tracker.js';
import { metrics } from '../utils/metrics.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { ChatSessionStore } from '../db/chat-session-store.js';
import { SkillRouter } from '../skills/skill-router.js';
import { deploySelectedSkills } from '../api/skills-installer.js';
import { CONTEXT_USAGE_THRESHOLD } from './context-manager.js';
import { MemoryWriter } from './memory-writer.js';
import { ClarificationMiddleware } from '../clarification/index.js';
import type { FeishuCard } from '../clarification/card-builder.js';
import { ConfigReader } from './orchestrator/config-reader.js';
import { Orchestrator } from './orchestrator/index.js';
import { StepExecutor } from './orchestrator/step-executor.js';
import type { AgentRuntimeConfig } from './orchestrator/types.js';
import { OutputArchiver } from './output-archiver.js';
import { PanmiraRAG } from '../panmira/rag.js';
import {
  TASK_TIMEOUT_MS,
  QUESTION_TIMEOUT_MS,
  MAX_QUEUE_SIZE,
  IDLE_TIMEOUT_MS,
  FINAL_CARD_RETRIES,
  FINAL_CARD_BASE_DELAY_MS,
  TASK_TIMEOUT_MESSAGE,
  IDLE_TIMEOUT_MESSAGE,
  BATCH_DEBOUNCE_MS,
  DEFAULT_IMAGE_TEXT,
  DEFAULT_FILE_TEXT,
  isStaleSessionError,
  isContextOverflowError,
} from './bridge-types.js';
export type { PendingBatch, RunningTask, ApiTaskOptions, ApiTaskResult, ActivityEventData } from './bridge-types.js';
import type { PendingBatch, RunningTask, ApiTaskOptions, ApiTaskResult, ActivityEventData } from './bridge-types.js';
import { sendFinalCard, sendPlanContent, sendCompletionNotice } from './card-renderer.js';
import type { CardRendererDeps } from './card-renderer.js';
import { executorForChat, prepareSessionForExecution, recordSession } from './bridge-session.js';
import type { SessionHelperDeps } from './bridge-session.js';
import { fetchKnowledgeContext } from './knowledge-fetcher.js';
import type { KnowledgeFetcherDeps } from './knowledge-fetcher.js';

export class MessageBridge {
  private engine: Engine;
  private executor: Executor;
  /** Lazy per-engine cache so a session override doesn't pay instantiation cost each turn. */
  private engineCache = new Map<EngineName, { engine: Engine; executor: Executor }>();
  private sessionManager: SessionManager;
  private outputsManager: OutputsManager;
  private audit: AuditLogger;
  private commandHandler: CommandHandler;
  private outputHandler: OutputHandler;
  readonly costTracker: CostTracker;
  private memoryClient: MemoryClient;
  private sessionRegistry?: SessionRegistry;
  private senderOverrides = new Map<string, IMessageSender>();
  private runningTasks = new Map<string, RunningTask>(); // keyed by chatId
  private messageQueues = new Map<string, IncomingMessage[]>(); // per-chatId message queue
  private pendingBatches = new Map<string, PendingBatch>(); // media debounce batches
  /** Callback for activity lifecycle events (task started/completed/failed). */
  onActivityEvent?: (event: ActivityEventData) => void;
  private skillRouter: SkillRouter;
  private configReader: ConfigReader;
  private orchestrator: Orchestrator;
  private memoryWriter: MemoryWriter;
  private clarificationMw: ClarificationMiddleware | null = null;
  private outputArchiver: OutputArchiver;
  private rag: PanmiraRAG;
  private workspaceManager?: import('../memory/workspace-manager.js').WorkspaceManager;

  constructor(
    private config: BotConfigBase,
    private logger: Logger,
    private sender: IMessageSender,
    memoryServerUrl: string,
    memorySecret?: string,
    sessionStore?: ChatSessionStore,
  ) {
    this.engine = createEngine(config, logger);
    this.executor = this.engine.createExecutor();
    const defaultEngineName = resolveEngineName(config);
    this.engineCache.set(defaultEngineName, { engine: this.engine, executor: this.executor });
    this.sessionManager = new SessionManager(config.claude.defaultWorkingDirectory, logger, config.name, sessionStore);
    this.outputsManager = new OutputsManager(config.claude.outputsBaseDir, logger);
    this.audit = new AuditLogger(logger);
    this.costTracker = new CostTracker();

    const memoryClient = new MemoryClient(memoryServerUrl, logger, memorySecret);
    this.memoryClient = memoryClient;
    this.memoryWriter = new MemoryWriter(memoryClient, logger);
    this.outputArchiver = new OutputArchiver(memoryClient, logger);
    this.rag = new PanmiraRAG(logger, { maxDocuments: 3, maxMemories: 2 });

    this.commandHandler = new CommandHandler(
      config,
      logger,
      sender,
      this.sessionManager,
      memoryClient,
      this.audit,
      (chatId) => this.runningTasks.get(chatId),
      (chatId) => this.stopTask(chatId),
    );

    this.outputHandler = new OutputHandler(logger, sender, this.outputsManager);

    const isFeishu = !!(config as any).feishu;
    this.skillRouter = new SkillRouter(isFeishu ? 'feishu' : 'all');

    this.configReader = new ConfigReader(logger);
    const stepExecutor = new StepExecutor(this.engineCache, logger, config);
    this.orchestrator = new Orchestrator(stepExecutor, this.memoryClient, logger);
  }

  /** Emit an activity event if a listener is registered. */
  private emitActivity(event: ActivityEventData): void {
    try {
      this.onActivityEvent?.(event);
    } catch (err: any) {
      this.logger.debug({ err: err?.message }, 'Activity event emission failed');
    }
  }

  private get _sessionDeps(): SessionHelperDeps {
    return {
      config: this.config,
      logger: this.logger,
      sessionManager: this.sessionManager,
      engineCache: this.engineCache,
      sessionRegistry: this.sessionRegistry,
      getSender: (chatId) => this.getSender(chatId),
    };
  }

  private get _cardDeps(): CardRendererDeps {
    return {
      logger: this.logger,
      sessionManager: this.sessionManager,
      getSender: (chatId) => this.getSender(chatId),
    };
  }

  private get _knowledgeDeps(): KnowledgeFetcherDeps {
    return {
      config: this.config,
      logger: this.logger,
      memoryClient: this.memoryClient,
      workspaceManager: this.workspaceManager,
    };
  }

  /**
   * Pick the executor for a chat based on its session engine override
   * (set via `/model claude` or `/model kimi`), falling back to the bot's
   * configured engine. Executors are cached per-engine so repeated turns
   * on the same engine don't re-instantiate the SDK wrapper.
   */
  private executorForChat(chatId: string): Executor {
    return executorForChat(this._sessionDeps, chatId);
  }

  /**
   * Session ids and model overrides are engine-specific. If a bot's default
   * engine changes between restarts, discard the old per-chat state before the
   * next execution so another engine does not try to resume it.
   */
  private prepareSessionForExecution(chatId: string) {
    return prepareSessionForExecution(this._sessionDeps, chatId);
  }

  /** Inject the doc sync service for /sync commands. */
  setDocSync(docSync: DocSync): void {
    this.commandHandler.setDocSync(docSync);
  }

  /** Inject the session registry for cross-platform session sync. */
  setSessionRegistry(registry: SessionRegistry): void {
    this.sessionRegistry = registry;
  }

  /** Override the sender for a specific chatId (used by proxy_message). */
  setSenderOverride(chatId: string, sender: IMessageSender): void {
    this.senderOverrides.set(chatId, sender);
  }

  /** Remove a sender override after proxy task completes. */
  clearSenderOverride(chatId: string): void {
    this.senderOverrides.delete(chatId);
  }

  /** Get the effective sender for a chatId (override or default). */
  private getSender(chatId?: string): IMessageSender {
    if (!chatId) return this.sender;
    return this.senderOverrides.get(chatId) ?? this.sender;
  }

  /** Expose the default sender for ProxySender (needs original for downloads). */
  getDefaultSender(): IMessageSender {
    return this.sender;
  }

  /** Expose session manager for cross-platform session linking. */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  isBusy(chatId: string): boolean {
    return this.runningTasks.has(chatId);
  }

  /** Return info about all currently running tasks (for team status display). */
  getRunningTasksInfo(): Array<{ chatId: string; startTime: number }> {
    return Array.from(this.runningTasks.entries()).map(([chatId, task]) => ({
      chatId,
      startTime: task.startTime,
    }));
  }

  /** Stop a running task for the given chatId. Returns true if a task was stopped. */
  stopChatTask(chatId: string): boolean {
    if (!this.runningTasks.has(chatId)) return false;
    this.stopTask(chatId);
    return true;
  }

  private stopTask(chatId: string): void {
    const task = this.runningTasks.get(chatId);
    if (!task) return;
    if (task.questionTimeoutId) clearTimeout(task.questionTimeoutId);
    task.executionHandle.finish();
    task.abortController.abort();
    // Don't delete from runningTasks here — the finally block in executeQuery will
    // handle cleanup. Deleting early creates a race: if the user sends a new message
    // before the old loop exits, the old finally block would delete the NEW task entry.
  }

  private processQueue(chatId: string): void {
    const queue = this.messageQueues.get(chatId);
    if (!queue || queue.length === 0) {
      this.messageQueues.delete(chatId);
      return;
    }
    const next = queue.shift()!;
    if (queue.length === 0) {
      this.messageQueues.delete(chatId);
    }
    this.executeQuery(next).catch((err) => {
      this.logger.error({ err, chatId }, 'Error processing queued message');
    });
  }

  /**
   * Handle a user click on an interactive card button (currently only used for
   * AskUserQuestion answer buttons). The click is converted into the same
   * synthetic reply that a numeric text-reply would produce, then handed to
   * handleAnswer so both paths go through the exact same flow.
   */
  async handleCardAction(event: {
    chatId: string;
    userId: string;
    messageId: string;
    value: Record<string, unknown>;
  }): Promise<void> {
    const { chatId, userId, messageId, value } = event;
    const task = this.runningTasks.get(chatId);
    if (!task || !task.pendingQuestion) {
      this.logger.debug({ chatId, userId }, 'Card action but no pending question — ignoring');
      return;
    }
    if (value.action !== 'answer_question') {
      this.logger.debug({ chatId, action: value.action }, 'Unknown card action — ignoring');
      return;
    }
    if (value.toolUseId !== task.pendingQuestion.toolUseId) {
      this.logger.warn(
        { chatId, expected: task.pendingQuestion.toolUseId, got: value.toolUseId },
        'Card action targets a stale question — ignoring',
      );
      return;
    }
    const optionIndex = typeof value.optionIndex === 'number' ? value.optionIndex : -1;
    const currentQ = task.pendingQuestion.questions[task.currentQuestionIndex];
    if (!currentQ || optionIndex < 0 || optionIndex >= currentQ.options.length) {
      this.logger.warn({ chatId, optionIndex }, 'Card action has invalid optionIndex — ignoring');
      return;
    }
    const syntheticMsg: IncomingMessage = {
      messageId,
      chatId,
      chatType: 'card_action',
      userId,
      text: String(optionIndex + 1),
    };
    await this.handleAnswer(syntheticMsg, task);
  }

  async handleMessage(msg: IncomingMessage): Promise<void> {
    const { chatId, text } = msg;

    // ── Permission check: reject users not in the bot allowlist ──
    if (this.config.permissions) {
      if (!isUserAllowed(this.config.permissions, msg.userId)) {
        this.logger.warn({ userId: msg.userId, botName: this.config.name }, "User denied by permissions");
        await this.getSender(msg.chatId).sendText(msg.chatId, "抱歉，你没有权限使用此助手。请联系管理员开通。");
        return;
      }
    }

    // Handle commands (always allowed, even during pending questions)
    if (text.startsWith('/')) {
      const handled = await this.commandHandler.handle(msg);
      if (handled) return;

      // Unrecognized /xxx command — pass through to Claude
      if (this.runningTasks.has(chatId)) {
        await this.getSender(chatId).sendTextNotice(
          chatId,
          '⏳ Task In Progress',
          'You have a running task. Use `/stop` to abort it, or wait for it to finish.',
          'orange',
        );
        return;
      }
      await this.executeQuery(msg);
      return;
    }

    // Check if there's a pending question waiting for an answer
    const task = this.runningTasks.get(chatId);
    if (task && task.pendingQuestion) {
      await this.handleAnswer(msg, task);
      return;
    }

    // If a task is running, queue the message instead of rejecting
    if (this.runningTasks.has(chatId)) {
      // If there's a pending batch and this is a text message, merge batch into the queued text
      const batch = this.pendingBatches.get(chatId);
      if (batch && !this.isDefaultMediaText(msg)) {
        clearTimeout(batch.timerId);
        this.pendingBatches.delete(chatId);
        const merged = this.mergeBatchWithText(batch.messages, msg);
        msg = merged;
      } else if (batch && this.isDefaultMediaText(msg)) {
        // Another media message while task is running — just add to batch
        batch.messages.push(msg);
        clearTimeout(batch.timerId);
        batch.timerId = setTimeout(() => this.flushBatch(chatId), BATCH_DEBOUNCE_MS);
        return;
      }

      const queue = this.messageQueues.get(chatId) || [];
      if (queue.length >= MAX_QUEUE_SIZE) {
        await this.getSender(chatId).sendTextNotice(
          chatId,
          '⏳ Queue Full',
          `Queue is full (${MAX_QUEUE_SIZE} pending). Use \`/stop\` to abort the current task, or wait.`,
          'orange',
        );
        return;
      }
      queue.push(msg);
      this.messageQueues.set(chatId, queue);
      this.audit.log({
        event: 'task_queued',
        botName: this.config.name,
        chatId,
        userId: msg.userId,
        prompt: msg.text,
        meta: { position: queue.length },
      });
      await this.getSender(chatId).sendTextNotice(
        chatId,
        '📋 Queued',
        `Your message has been queued (position #${queue.length}). It will run after the current task finishes.`,
        'blue',
      );
      return;
    }

    // Smart debounce: batch media-only messages, execute text immediately
    const isMediaOnly = this.isDefaultMediaText(msg);
    const batch = this.pendingBatches.get(chatId);

    if (isMediaOnly) {
      // Media message: add to batch and wait for more
      if (batch) {
        batch.messages.push(msg);
        clearTimeout(batch.timerId);
        batch.timerId = setTimeout(() => this.flushBatch(chatId), BATCH_DEBOUNCE_MS);
      } else {
        const timerId = setTimeout(() => this.flushBatch(chatId), BATCH_DEBOUNCE_MS);
        this.pendingBatches.set(chatId, { messages: [msg], timerId });
      }
      this.logger.info(
        { chatId, imageKey: msg.imageKey, fileKey: msg.fileKey },
        'Media message batched, waiting for more',
      );
      return;
    }

    // Text message: if pending batch exists, merge and execute immediately
    if (batch) {
      clearTimeout(batch.timerId);
      this.pendingBatches.delete(chatId);
      const merged = this.mergeBatchWithText(batch.messages, msg);
      this.logger.info({ chatId, batchSize: batch.messages.length }, 'Flushing media batch with text message');
      await this.executeQuery(merged);
      return;
    }

    // Plain text, no batch: execute immediately (original behavior)
    await this.executeQuery(msg);
  }

  private async handleAnswer(msg: IncomingMessage, task: RunningTask): Promise<void> {
    const { chatId, text, imageKey } = msg;
    const pending = task.pendingQuestion!;

    if (imageKey) {
      await this.getSender(chatId).sendText(chatId, '请用文字回复选择，或直接输入自定义答案。');
      return;
    }

    const trimmed = text.trim();
    const currentQuestion = pending.questions[task.currentQuestionIndex];
    if (!currentQuestion) return;

    // Parse answer for the current question
    let answerText: string;
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= currentQuestion.options.length) {
      answerText = currentQuestion.options[num - 1].label;
    } else {
      answerText = trimmed;
    }

    // Store answer for this question
    task.collectedAnswers[currentQuestion.header] = answerText;

    this.logger.info(
      {
        chatId,
        answer: answerText,
        questionIndex: task.currentQuestionIndex,
        total: pending.questions.length,
        toolUseId: pending.toolUseId,
      },
      'User answered question',
    );

    // Check if more questions remain in this AskUserQuestion call
    if (task.currentQuestionIndex + 1 < pending.questions.length) {
      task.currentQuestionIndex++;
      // Reset question timeout for the next question
      if (task.questionTimeoutId) {
        clearTimeout(task.questionTimeoutId);
      }
      task.questionTimeoutId = setTimeout(() => {
        this.autoAnswerRemainingQuestions(task);
      }, QUESTION_TIMEOUT_MS);

      // Update card to show next question
      const currentState = task.processor.getCurrentState();
      const nextQ = pending.questions[task.currentQuestionIndex];
      const displayQuestion: PendingQuestion = {
        toolUseId: pending.toolUseId,
        questions: [nextQ],
      };
      const progress = `(${task.currentQuestionIndex + 1}/${pending.questions.length})`;
      await this.getSender(chatId).updateCard(task.cardMessageId, {
        ...currentState,
        status: 'waiting_for_input',
        responseText: currentState.responseText
          ? currentState.responseText + `\n\n> **Reply ${progress}:** ${answerText}`
          : `> **Reply:** ${answerText}`,
        pendingQuestion: displayQuestion,
      });
      return;
    }

    // All questions in this call answered — resolve the PreToolUse hook.
    // resolveQuestion returns answers as updatedInput so the SDK short-circuits
    // its own interaction prompt; sendAnswer is only a fallback for the legacy
    // tool_result path (kept inside ExecutionHandle.resolveQuestion).
    const collectedAnswers = task.collectedAnswers;

    if (task.questionTimeoutId) {
      clearTimeout(task.questionTimeoutId);
      task.questionTimeoutId = undefined;
    }
    task.pendingQuestion = null;
    task.currentQuestionIndex = 0;
    task.collectedAnswers = {};
    task.processor.clearPendingQuestion();

    task.executionHandle.resolveQuestion(pending.toolUseId, collectedAnswers);

    this.logger.info(
      { chatId, answers: collectedAnswers, toolUseId: pending.toolUseId },
      'Resolved AskUserQuestion hook with collected answers',
    );

    // Check if there are more queued AskUserQuestion calls
    const nextPending = task.processor.getPendingQuestion();
    if (nextPending) {
      task.pendingQuestion = nextPending;
      task.currentQuestionIndex = 0;
      task.collectedAnswers = {};

      // Show next question call
      const currentState = task.processor.getCurrentState();
      const displayQuestion: PendingQuestion = {
        toolUseId: nextPending.toolUseId,
        questions: [nextPending.questions[0]],
      };
      const progress = nextPending.questions.length > 1 ? ` (1/${nextPending.questions.length})` : '';
      task.questionTimeoutId = setTimeout(() => {
        this.autoAnswerRemainingQuestions(task);
      }, QUESTION_TIMEOUT_MS);

      await this.getSender(chatId).updateCard(task.cardMessageId, {
        ...currentState,
        status: 'waiting_for_input',
        responseText: currentState.responseText
          ? currentState.responseText + `\n\n> **Reply:** ${answerText}\n\n_Next question${progress}..._`
          : `> **Reply:** ${answerText}\n\n_Next question${progress}..._`,
        pendingQuestion: displayQuestion,
      });
      return;
    }

    // No more questions — resume normal execution
    const answerSummary =
      Object.values(task.collectedAnswers).length > 0 ? Object.values(task.collectedAnswers).join(', ') : answerText;
    const currentState = task.processor.getCurrentState();
    await this.getSender(chatId).updateCard(task.cardMessageId, {
      ...currentState,
      status: 'running',
      responseText: currentState.responseText
        ? currentState.responseText + `\n\n> **Reply:** ${answerSummary}\n\n_Continuing..._`
        : `> **Reply:** ${answerSummary}\n\n_Continuing..._`,
    });
  }

  /** Auto-answer remaining questions when timeout fires. */
  private autoAnswerRemainingQuestions(task: RunningTask): void {
    const pending = task.pendingQuestion;
    if (!pending) return;

    this.logger.warn(
      { chatId: task.chatId, toolUseId: pending.toolUseId },
      'Question timeout, auto-answering remaining questions',
    );

    // Fill remaining unanswered questions with timeout message
    for (let i = task.currentQuestionIndex; i < pending.questions.length; i++) {
      const q = pending.questions[i];
      if (!task.collectedAnswers[q.header]) {
        task.collectedAnswers[q.header] = '用户未及时回复，请自行判断继续';
      }
    }

    const collectedAnswers = task.collectedAnswers;
    task.pendingQuestion = null;
    task.currentQuestionIndex = 0;
    task.collectedAnswers = {};
    task.processor.clearPendingQuestion();

    task.executionHandle.resolveQuestion(pending.toolUseId, collectedAnswers);
  }

  /** Check if message is a media message with default (auto-generated) text. */
  private isDefaultMediaText(msg: IncomingMessage): boolean {
    return (!!msg.imageKey && msg.text === DEFAULT_IMAGE_TEXT) || (!!msg.fileKey && msg.text === DEFAULT_FILE_TEXT);
  }

  /** Timer expired: merge batched media messages and execute. */
  private flushBatch(chatId: string): void {
    const batch = this.pendingBatches.get(chatId);
    if (!batch) return;
    this.pendingBatches.delete(chatId);

    const merged = this.mergeBatchMessages(batch.messages);
    this.logger.info({ chatId, batchSize: batch.messages.length }, 'Flushing media batch (timeout)');

    // If a task started running during the debounce window, queue instead
    if (this.runningTasks.has(chatId)) {
      const queue = this.messageQueues.get(chatId) || [];
      if (queue.length < MAX_QUEUE_SIZE) {
        queue.push(merged);
        this.messageQueues.set(chatId, queue);
        this.getSender(chatId)
          .sendTextNotice(
            chatId,
            '📋 Queued',
            `Your ${batch.messages.length} media message(s) have been queued.`,
            'blue',
          )
          .catch((err) => this.logger.warn({ err, chatId }, 'Failed to process message queue'));
      }
      return;
    }

    this.executeQuery(merged).catch((err) => {
      this.logger.error({ err, chatId }, 'Error executing batched messages');
    });
  }

  /** Merge multiple media-only messages into one (no user text). */
  private mergeBatchMessages(messages: IncomingMessage[]): IncomingMessage {
    const first = messages[0];
    if (messages.length === 1) return first;

    const imageCount = messages.filter((m) => m.imageKey).length;
    const fileCount = messages.filter((m) => m.fileKey).length;
    const parts: string[] = [];
    if (imageCount > 0) parts.push(`${imageCount}张图片`);
    if (fileCount > 0) parts.push(`${fileCount}个文件`);

    return {
      ...first,
      text: `请分析这些${parts.join('和')}`,
      extraMedia: messages.slice(1).map((m) => ({
        messageId: m.messageId,
        imageKey: m.imageKey,
        fileKey: m.fileKey,
        fileName: m.fileName,
      })),
    };
  }

  /** Merge batched media messages with a user text message. */
  private mergeBatchWithText(batchMsgs: IncomingMessage[], textMsg: IncomingMessage): IncomingMessage {
    return {
      ...textMsg,
      extraMedia: batchMsgs.map((m) => ({
        messageId: m.messageId,
        imageKey: m.imageKey,
        fileKey: m.fileKey,
        fileName: m.fileName,
      })),
    };
  }

  private async executeQuery(msg: IncomingMessage): Promise<void> {
    console.log("[PANMIRA-DIAG] executeQuery called: " + this.config.name + " agentId=" + (this.config.agentId || "NONE"));
    const { userId, chatId, text, imageKey, fileKey, fileName, messageId: msgId } = msg;
    const { session, engineName } = this.prepareSessionForExecution(chatId);
    const cwd = session.workingDirectory;
    const abortController = new AbortController();

    // Prepare downloads directory (bot-isolated)
    const downloadsDir = this.config.claude.downloadsDir;
    fs.mkdirSync(downloadsDir, { recursive: true });

    // Handle image download if present
    let prompt = text;
    let imagePath: string | undefined;
    let filePath: string | undefined;
    if (imageKey) {
      imagePath = path.join(downloadsDir, `${imageKey}.png`);
      const ok = await this.getSender(chatId).downloadImage(msgId, imageKey, imagePath);
      if (ok) {
        prompt = `${text}\n\n[Image saved at: ${imagePath}]\nPlease use the Read tool to read and analyze this image file.`;
      } else {
        prompt = `${text}\n\n(Note: Failed to download the image)`;
      }
    }

    // Handle file download if present
    if (fileKey && fileName) {
      filePath = path.join(downloadsDir, `${fileKey}_${fileName}`);
      const ok = await this.getSender(chatId).downloadFile(msgId, fileKey, filePath);
      if (ok) {
        prompt = `${text}\n\n[File saved at: ${filePath}]\nPlease use the Read tool (for text/code files, images, PDFs) or Bash tool (for other formats) to read and analyze this file.`;
      } else {
        prompt = `${text}\n\n(Note: Failed to download the file)`;
      }
    }

    // Handle extra media from batched messages
    const extraPaths: string[] = [];
    if (msg.extraMedia && msg.extraMedia.length > 0) {
      for (const media of msg.extraMedia) {
        if (media.imageKey) {
          const p = path.join(downloadsDir, `${media.imageKey}.png`);
          const ok = await this.getSender(chatId).downloadImage(media.messageId, media.imageKey, p);
          if (ok) {
            extraPaths.push(p);
            prompt += `\n[Image saved at: ${p}]`;
          }
        }
        if (media.fileKey && media.fileName) {
          const p = path.join(downloadsDir, `${media.fileKey}_${media.fileName}`);
          const ok = await this.getSender(chatId).downloadFile(media.messageId, media.fileKey, p);
          if (ok) {
            extraPaths.push(p);
            prompt += `\n[File saved at: ${p}]`;
          }
        }
      }
      if (extraPaths.length > 0) {
        prompt += '\nPlease use the Read tool to analyze all the above files.';
      }
    }

    // Prepare per-chat outputs directory
    const outputsDir = this.outputsManager.prepareDir(chatId);

    // Send initial "thinking" card
    const mediaCount = 1 + (msg.extraMedia?.length || 0);
    const hasMedia = imageKey || fileKey;
    const displayPrompt =
      hasMedia && mediaCount > 1
        ? `🖼️ [${mediaCount} files] ${text}`
        : fileKey
          ? '📎 ' + text
          : imageKey
            ? '🖼️ ' + text
            : text;
    const processor = new StreamProcessor(displayPrompt, this.config.contextWindow, this.config.claude.model);
    const initialState: CardState = {
      status: 'thinking',
      userPrompt: displayPrompt,
      responseText: '',
      toolCalls: [],
    };

    const messageId = await this.getSender(chatId).sendCard(chatId, initialState);

    if (!messageId) {
      this.logger.error('Failed to send initial card, aborting');
      return;
    }

    const apiContext = { botName: this.config.name, chatId };

    // Resolve agent knowledge and system prompt
    let systemPromptOverride: string | undefined;
    let knowledgeContext: string | null = null;
    let agentBoundSkills: string[] = [];
    try {
      const knowledgeResult = await this.fetchKnowledgeContext(text, chatId);
      systemPromptOverride = knowledgeResult.systemPromptOverride;
      knowledgeContext = knowledgeResult.knowledgeContext;
      agentBoundSkills = knowledgeResult.agentBoundSkills;
    } catch (err) {
      this.logger.warn({ err }, 'Knowledge search failed, continuing without injection');
    }

    // Inject pending summary from previous session reset
    const pendingSummary = this.sessionManager.consumePendingSummary(chatId);
    if (pendingSummary) {
      knowledgeContext = knowledgeContext
        ? `${knowledgeContext}\n\n## 前次会话摘要\n${pendingSummary}`
        : `## 前次会话摘要\n${pendingSummary}`;
      this.logger.info({ chatId, summaryLen: pendingSummary.length }, 'Injected pre-reset summary');
    }

    // Orchestrator branch: if agent has orchestration config, use code-driven flow
    let agentRuntimeConfig: AgentRuntimeConfig | null = null;
    this.logger.info({ agentId: this.config.agentId, botName: this.config.name }, '[DIAG] Checking orchestrator eligibility');
    if (this.config.agentId) {
      agentRuntimeConfig = await this.configReader.readFromAgent(this.config.agentId);
      this.logger.info({ agentId: this.config.agentId, found: !!agentRuntimeConfig, hasIntents: agentRuntimeConfig?.orchestration?.intents?.length }, '[DIAG] Agent config loaded');
    } else {
      this.logger.warn({ botName: this.config.name }, '[DIAG] No agentId configured — skipping orchestrator');
    }
    if (agentRuntimeConfig && agentRuntimeConfig.orchestration.intents.length > 0) {
      this.logger.info({ chatId, agentId: this.config.agentId }, 'Using orchestrator flow');

      // ── Step 1: Clarification — ask structured questions if needed ──
      if (this.clarificationMw) {
        const intent = agentRuntimeConfig.orchestration.intents[0];
        const targetSkill = intent.chain[0]?.skill || intent.name;
        try {
          let clarified = false;
          await this.clarificationMw.handle(
            { userId: msg.userId, botId: this.config.name, targetSkill, rawMessage: text || '', chatId },
            async () => { clarified = true; },
          );
          if (!clarified) {
            // Clarification card was sent — stop here, wait for user response
            this.logger.info({ chatId, targetSkill }, 'Clarification in progress, waiting for user');
            return;
          }
        } catch (err: any) {
          this.logger.warn({ err: err?.message, targetSkill }, 'Clarification skipped due to error');
        }
      }

      // ── Step 2: RAG — retrieve relevant knowledge ──
      const ragContext = await this.rag.retrieve(text || '', chatId, this.config.name);
      if (ragContext.sourceCount > 0) {
        this.logger.info({ chatId, sources: ragContext.sourceCount }, 'RAG context retrieved');
      }

      // ── Step 3: Skill selection — match skills to intent ──
      const selectedSkills = this.skillRouter.selectSkills(text || '');
      const selectedNames = selectedSkills.map((s) => s.name);
      if (selectedNames.length > 0) {
        this.logger.info({ chatId, skills: selectedNames }, 'Skills selected for orchestration');
        try {
          const { deploySelectedSkills } = await import('../api/skills-installer.js');
          deploySelectedSkills(cwd, selectedNames, this.logger);
        } catch (err) {
          this.logger.warn({ err }, 'Skill deployment failed, continuing with loaded skills');
        }
      }

      // ── Step 4: Execute orchestration ──
      await this.executeWithOrchestrator(
        msg,
        agentRuntimeConfig,
        cwd,
        outputsDir,
        messageId,
        abortController,
      );
      return;
    }
    }  // closes try-catch from knowledge context fetching

    // Dynamic skill deployment: select relevant skills for this query
    try {
      const selectedSkills = this.skillRouter.selectSkills(text || '');
      const selectedNames = selectedSkills.map((s) => s.name);
      const mergedNames = [...new Set([...selectedNames, ...agentBoundSkills])];
      deploySelectedSkills(cwd, mergedNames, this.logger);
      this.logger.debug({ chatId, skills: mergedNames }, 'Skills deployed for query');
    } catch (err) {
      this.logger.warn({ err }, 'Skill deployment failed, using default skills');
    }

    // Start multi-turn execution
    // Resolve user role from permissions config
    const userRole = resolveUserRole(this.config.permissions, userId);
    const executionHandle = this.executorForChat(chatId).startExecution({
      prompt,
      cwd,
      sessionId: session.sessionId,
      abortController,
      outputsDir,
      apiContext,
      model: session.model,
      systemPromptOverride,
      knowledgeContext,
      userRole,
    });

    const rateLimiter = new RateLimiter(1500);

    // Register running task
    const startTime = Date.now();
    const runningTask: RunningTask = {
      abortController,
      startTime,
      executionHandle,
      pendingQuestion: null,
      currentQuestionIndex: 0,
      collectedAnswers: {},
      cardMessageId: messageId,
      processor,
      rateLimiter,
      chatId,
    };
    this.runningTasks.set(chatId, runningTask);
    metrics.setGauge('metabot_active_tasks', this.runningTasks.size);

    this.audit.log({ event: 'task_start', botName: this.config.name, chatId, userId, prompt: text });
    this.emitActivity({
      type: 'task_started',
      botName: this.config.name,
      chatId,
      userId,
      prompt: text?.slice(0, 200),
      timestamp: startTime,
    });

    // Setup timeout
    let timedOut = false;
    let idledOut = false;
    const timeoutId = setTimeout(() => {
      this.logger.warn({ chatId, userId }, 'Task timeout, aborting');
      timedOut = true;
      executionHandle.finish();
      abortController.abort();
    }, TASK_TIMEOUT_MS);

    // Idle detection: reset timer on every stream message
    let idleTimerId: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimer = () => {
      if (idleTimerId) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(() => {
        this.logger.warn({ chatId, userId }, 'Task idle timeout (1h no stream), aborting');
        idledOut = true;
        executionHandle.finish();
        abortController.abort();
      }, IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    let lastState: CardState = initialState;

    try {
      for await (const message of executionHandle.stream) {
        if (abortController.signal.aborted) break;
        resetIdleTimer();

        const state = processor.processMessage(message);
        lastState = state;

        // Update session ID if discovered
        const newSessionId = processor.getSessionId();
        if (newSessionId && (newSessionId !== session.sessionId || session.sessionIdEngine !== engineName)) {
          this.sessionManager.setSessionId(chatId, newSessionId, engineName);
        }

        // Check if we hit a waiting_for_input state
        if (state.status === 'waiting_for_input' && state.pendingQuestion) {
          // Only initialize tracking when we see a NEW question call
          if (
            !runningTask.pendingQuestion ||
            runningTask.pendingQuestion.toolUseId !== state.pendingQuestion.toolUseId
          ) {
            runningTask.pendingQuestion = state.pendingQuestion;
            runningTask.currentQuestionIndex = 0;
            runningTask.collectedAnswers = {};
          }

          await rateLimiter.flush();

          // Show only the current question (not all at once)
          const pending = runningTask.pendingQuestion;
          const currentQ = pending.questions[runningTask.currentQuestionIndex];
          const displayQuestion: PendingQuestion = {
            toolUseId: pending.toolUseId,
            questions: currentQ ? [currentQ] : pending.questions,
          };
          const progress =
            pending.questions.length > 1
              ? ` (${runningTask.currentQuestionIndex + 1}/${pending.questions.length})`
              : '';
          await this.getSender(chatId).updateCard(messageId, {
            ...state,
            pendingQuestion: displayQuestion,
            // Append progress indicator to response if multi-question
            responseText: progress
              ? (state.responseText || '') + (state.responseText ? '\n\n' : '') + `_Question${progress}_`
              : state.responseText,
          });

          // Set/reset timeout for auto-answer
          if (runningTask.questionTimeoutId) {
            clearTimeout(runningTask.questionTimeoutId);
          }
          runningTask.questionTimeoutId = setTimeout(() => {
            this.autoAnswerRemainingQuestions(runningTask);
          }, QUESTION_TIMEOUT_MS);

          continue;
        }

        // Detect SDK-handled tools for side effects (plan content display).
        // Do NOT call sendAnswer — the SDK auto-responds in bypassPermissions mode.
        // Sending a duplicate tool_result causes API 400 errors.
        const sdkTools = processor.drainSdkHandledTools();
        for (const tool of sdkTools) {
          this.logger.info({ chatId, toolName: tool.name, toolUseId: tool.toolUseId }, 'Detected SDK-handled tool');
          if (tool.name === 'ExitPlanMode') {
            await this.sendPlanContent(chatId, processor, state);
          }
        }

        // If we just got a message after answering a question, clear timeout state
        if (runningTask.pendingQuestion === null && runningTask.questionTimeoutId) {
          clearTimeout(runningTask.questionTimeoutId);
          runningTask.questionTimeoutId = undefined;
        }

        // Break on final states
        if (state.status === 'complete' || state.status === 'error') {
          break;
        }

        // Throttled card update for non-final states (skip if aborted)
        if (!abortController.signal.aborted) {
          rateLimiter.schedule(() => {
            if (!abortController.signal.aborted) {
              this.getSender(chatId).updateCard(messageId, state);
            }
          });
        }
      }

      rateLimiter.cancel();

      // Force terminal state if stream ended without one
      if (lastState.status !== 'complete' && lastState.status !== 'error') {
        if (timedOut) {
          lastState = { ...lastState, status: 'error', errorMessage: TASK_TIMEOUT_MESSAGE };
        } else if (idledOut) {
          lastState = { ...lastState, status: 'error', errorMessage: IDLE_TIMEOUT_MESSAGE };
        } else if (abortController.signal.aborted) {
          lastState = { ...lastState, status: 'error', errorMessage: 'Task was stopped' };
        } else {
          this.logger.warn({ chatId }, 'Stream ended without result message, forcing complete state');
          lastState = {
            ...lastState,
            status: lastState.responseText ? 'complete' : 'error',
            errorMessage: lastState.responseText ? undefined : 'Claude session ended unexpectedly',
          };
        }
      }

      // Auto-retry with fresh session when Claude can't find the conversation
      if (lastState.status === 'error' && isStaleSessionError(lastState.errorMessage) && session.sessionId) {
        this.logger.info({ chatId }, 'Stale session detected, retrying with fresh session');
        const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        lastState = { ...lastState, status: 'running', errorMessage: undefined };
        await this.getSender(chatId).updateCard(messageId, {
          ...lastState,
          responseText: '_Session expired, retrying..._',
        });

        // Retry execution without sessionId
        const retryHandle = this.executorForChat(chatId).startExecution({
          prompt,
          cwd,
          sessionId: undefined,
          abortController,
          outputsDir,
          apiContext,
          model: session.model,
          systemPromptOverride,
          knowledgeContext,
      userRole,
        });
        executionHandle.finish();
        runningTask.executionHandle = retryHandle;

        for await (const message of retryHandle.stream) {
          if (abortController.signal.aborted) break;
          resetIdleTimer();
          const state = processor.processMessage(message);
          lastState = state;
          const newSid = processor.getSessionId();
          if (newSid) this.sessionManager.setSessionId(chatId, newSid, engineName);
          if (state.status === 'complete' || state.status === 'error') break;
          rateLimiter.schedule(() => {
            this.getSender(chatId).updateCard(messageId, state);
          });
        }
        await rateLimiter.cancelAndWait();
      }

      // Auto-retry with fresh session on context overflow (e.g. third-party models without compaction)
      if (lastState.status === 'error' && isContextOverflowError(lastState.errorMessage) && session.sessionId) {
        this.logger.info(
          { chatId, threshold: CONTEXT_USAGE_THRESHOLD },
          'Context overflow detected, retrying with continuation prompt',
        );
        const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        lastState = { ...lastState, status: 'running', errorMessage: undefined };
        await this.getSender(chatId).updateCard(messageId, {
          ...lastState,
          responseText: '_对话内容过长，正在压缩上下文并继续..._',
        });

        const continuationPrompt = this.buildContinuationPrompt(prompt, lastState);
        const retryHandle = this.executorForChat(chatId).startExecution({
          prompt: continuationPrompt,
          cwd,
          sessionId: undefined,
          abortController,
          outputsDir,
          apiContext,
          model: session.model,
          systemPromptOverride,
          knowledgeContext,
      userRole,
        });
        executionHandle.finish();
        runningTask.executionHandle = retryHandle;

        for await (const message of retryHandle.stream) {
          if (abortController.signal.aborted) break;
          resetIdleTimer();
          const state = processor.processMessage(message);
          lastState = state;
          const newSid = processor.getSessionId();
          if (newSid) this.sessionManager.setSessionId(chatId, newSid, engineName);
          if (state.status === 'complete' || state.status === 'error') break;
          rateLimiter.schedule(() => {
            this.getSender(chatId).updateCard(messageId, state);
          });
        }
        await rateLimiter.cancelAndWait();
      }

      const finalCardStart = Date.now();
      await this.sendFinalCard(messageId, lastState, chatId);
      this.logger.info({ chatId, finalCardMs: Date.now() - finalCardStart, status: lastState.status }, 'Final card sent');

      // Audit + cost tracking
      const durationMs = Date.now() - startTime;
      const auditEvent = timedOut
        ? ('task_timeout' as const)
        : idledOut
          ? ('task_idle_timeout' as const)
          : lastState.status === 'error'
            ? ('task_error' as const)
            : ('task_complete' as const);
      this.audit.log({
        event: auditEvent,
        botName: this.config.name,
        chatId,
        userId,
        prompt: text,
        durationMs,
        costUsd: lastState.costUsd,
        error: lastState.errorMessage,
      });
      this.emitActivity({
        type: lastState.status === 'complete' ? 'task_completed' : 'task_failed',
        botName: this.config.name,
        chatId,
        userId,
        prompt: text?.slice(0, 200),
        responsePreview: lastState.responseText?.slice(0, 200),
        costUsd: lastState.costUsd,
        durationMs,
        errorMessage: lastState.errorMessage,
        timestamp: Date.now(),
        inputTokens: lastState.inputTokens,
        outputTokens: lastState.outputTokens,
        cacheReadTokens: lastState.cacheReadTokens,
        cacheCreationTokens: lastState.cacheCreationTokens,
        model: lastState.model,
      });
      this.costTracker.record({
        botName: this.config.name,
        userId,
        success: lastState.status === 'complete',
        costUsd: lastState.costUsd,
        durationMs,
        inputTokens: lastState.inputTokens,
        outputTokens: lastState.outputTokens,
        cacheReadTokens: lastState.cacheReadTokens,
        cacheCreationTokens: lastState.cacheCreationTokens,
      });
      metrics.incCounter('metabot_tasks_total');
      metrics.incCounter('metabot_tasks_by_status', lastState.status === 'complete' ? 'success' : 'error');
      metrics.observeHistogram('metabot_task_duration_seconds', durationMs / 1000);
      if (lastState.costUsd) metrics.observeHistogram('metabot_task_cost_usd', lastState.costUsd);

      // Auto-record conversation memory (fire-and-forget)
      if (lastState.status === 'complete' && text) {
        this.memoryWriter
          .record(this.config.name, text, lastState.responseText || '', {
            chatId,
            chatType: msg.chatType,
            userId,
            durationMs,
            costUsd: lastState.costUsd,
          })
          .catch((err) => this.logger.warn({ err, chatId }, 'Failed to process message queue'));
      }

      // Auto-archive output files to MetaMemory (fire-and-forget)
      if (outputsDir && lastState.status === 'complete') {
        const outputFiles = this.outputsManager.scanOutputs(outputsDir);
        if (outputFiles.length > 0) {
          if (msg.chatType === 'group' && this.workspaceManager) {
            this.outputArchiver.archiveFilesForGroup(chatId, this.config.name, outputFiles, this.workspaceManager).catch((err) => this.logger.warn({ err, chatId }, 'Failed to archive files for group'));
          } else {
            this.outputArchiver.archiveFiles(this.config.name, outputFiles).catch((err) => this.logger.warn({ err }, 'Failed to archive files'));
          }
        }
      }

      // Post-processing: fire-and-forget to avoid blocking task cleanup
      const postProcessPromise = (async () => {
        try {
          await this.recordSession(
            chatId,
            displayPrompt,
            lastState.responseText,
            processor.getSessionId(),
            lastState.costUsd,
            durationMs,
          );
        } catch (e) { this.logger.warn({ err: e, chatId }, 'recordSession failed'); }

        try {
          await this.sendCompletionNotice(chatId, lastState, durationMs);
        } catch (e) { this.logger.warn({ err: e, chatId }, 'sendCompletionNotice failed'); }

      this.logger.info({ chatId, status: lastState.status, totalTokens: lastState.totalTokens, contextWindow: lastState.contextWindow, hasSessionId: !!session.sessionId, model: lastState.model }, 'Context usage check');
      // Proactive session reset: if context usage is high, reset so next message starts fresh
      // instead of waiting for an overflow error on the next call
      if (lastState.status === 'complete' && lastState.totalTokens && lastState.contextWindow && session.sessionId) {
        const usagePct = lastState.totalTokens / lastState.contextWindow;
        if (usagePct >= CONTEXT_USAGE_THRESHOLD) {
          this.logger.info(
            { chatId, usagePct: Math.round(usagePct * 100), sessionId: session.sessionId },
            'Proactive session reset: context usage above threshold',
          );
          try {
            await this.handlePreResetContext(chatId, prompt, lastState, msg.chatType);
            const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
          } catch (e) { this.logger.warn({ err: e, chatId }, 'handlePreResetContext failed'); }
        }
      }

      try {
        await this.outputHandler.sendOutputFiles(chatId, outputsDir, processor, lastState);
      } catch (e) { this.logger.warn({ err: e, chatId }, 'sendOutputFiles failed'); }
      })().catch((err) => this.logger.warn({ err, chatId }, 'Failed to send output files'));
    } catch (err: any) {
      this.logger.error({ err, chatId, userId }, 'Claude execution error');

      // Auto-retry with fresh session when Claude can't find the conversation or context overflows
      const errMsg: string = err.message || '';
      const isOverflow = isContextOverflowError(errMsg);
      const isStale = isStaleSessionError(errMsg);
      if ((isStale && session.sessionId) || isOverflow) {
        this.logger.info(
          { chatId, isOverflow },
          isOverflow
            ? 'Context overflow in catch, retrying with continuation prompt'
            : 'Stale session detected in catch, retrying with fresh session',
        );
        const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        const retryMsg = isOverflow ? '_对话内容过长，正在压缩上下文并继续..._' : '_Session expired, retrying..._';
        await this.getSender(chatId).updateCard(messageId, { ...lastState, status: 'running', responseText: retryMsg });

        try {
          const retryPrompt = isOverflow ? this.buildContinuationPrompt(prompt, lastState) : prompt;
          const retryHandle = this.executorForChat(chatId).startExecution({
            prompt: retryPrompt,
            cwd,
            sessionId: undefined,
            abortController,
            outputsDir,
            apiContext,
            model: session.model,
            systemPromptOverride,
            knowledgeContext,
      userRole,
          });
          executionHandle.finish();
          runningTask.executionHandle = retryHandle;

          for await (const message of retryHandle.stream) {
            if (abortController.signal.aborted) break;
            resetIdleTimer();
            const state = processor.processMessage(message);
            lastState = state;
            const newSid = processor.getSessionId();
            if (newSid) this.sessionManager.setSessionId(chatId, newSid, engineName);
            if (state.status === 'complete' || state.status === 'error') break;
            rateLimiter.schedule(() => {
              this.getSender(chatId).updateCard(messageId, state);
            });
          }
          await rateLimiter.cancelAndWait();
          await this.sendFinalCard(messageId, lastState, chatId);

          const durationMs = Date.now() - startTime;
          this.audit.log({
            event: lastState.status === 'error' ? 'task_error' : 'task_complete',
            botName: this.config.name,
            chatId,
            userId,
            prompt: text,
            durationMs,
            costUsd: lastState.costUsd,
            error: lastState.errorMessage,
          });
          this.emitActivity({
            type: lastState.status === 'complete' ? 'task_completed' : 'task_failed',
            botName: this.config.name,
            chatId,
            userId,
            prompt: text?.slice(0, 200),
            responsePreview: lastState.responseText?.slice(0, 200),
            costUsd: lastState.costUsd,
            durationMs,
            errorMessage: lastState.errorMessage,
            timestamp: Date.now(),
            inputTokens: lastState.inputTokens,
            outputTokens: lastState.outputTokens,
            cacheReadTokens: lastState.cacheReadTokens,
            cacheCreationTokens: lastState.cacheCreationTokens,
            model: lastState.model,
          });
          this.costTracker.record({
            botName: this.config.name,
            userId,
            success: lastState.status === 'complete',
            costUsd: lastState.costUsd,
            durationMs,
            inputTokens: lastState.inputTokens,
            outputTokens: lastState.outputTokens,
            cacheReadTokens: lastState.cacheReadTokens,
            cacheCreationTokens: lastState.cacheCreationTokens,
          });
          metrics.incCounter('metabot_tasks_total');
          metrics.incCounter('metabot_tasks_by_status', lastState.status === 'complete' ? 'success' : 'error');

          await this.recordSession(
            chatId,
            displayPrompt,
            lastState.responseText,
            processor.getSessionId(),
            lastState.costUsd,
            durationMs,
          );
          await this.sendCompletionNotice(chatId, lastState, durationMs);
          await this.outputHandler.sendOutputFiles(chatId, outputsDir, processor, lastState);
          return; // skip the normal error handling below
        } catch (retryErr: any) {
          this.logger.error({ err: retryErr, chatId }, 'Retry after stale session also failed');
          lastState = { ...lastState, status: 'error', errorMessage: retryErr.message || 'Retry failed' };
        }
      }

      const durationMs = Date.now() - startTime;
      this.audit.log({
        event: 'task_error',
        botName: this.config.name,
        chatId,
        userId,
        prompt: text,
        durationMs,
        error: err.message || 'Unknown error',
      });
      this.emitActivity({
        type: 'task_failed',
        botName: this.config.name,
        chatId,
        userId,
        prompt: text?.slice(0, 200),
        errorMessage: err.message || 'Unknown error',
        durationMs,
        timestamp: Date.now(),
      });
      this.costTracker.record({ botName: this.config.name, userId, success: false, durationMs });
      metrics.incCounter('metabot_tasks_total');
      metrics.incCounter('metabot_tasks_by_status', 'error');

      const errorState: CardState = {
        status: 'error',
        userPrompt: displayPrompt,
        responseText: lastState.responseText,
        toolCalls: lastState.toolCalls,
        errorMessage: err.message || 'Unknown error',
      };
      await rateLimiter.cancelAndWait();
      await this.sendFinalCard(messageId, errorState, chatId);
    } finally {
      clearTimeout(timeoutId);
      if (idleTimerId) clearTimeout(idleTimerId);
      if (runningTask.questionTimeoutId) {
        clearTimeout(runningTask.questionTimeoutId);
      }
      try {
        executionHandle.finish();
      } catch (e) {
        this.logger.warn({ err: e, chatId }, 'Error finishing execution handle');
      }
      // Only delete if this is still our task (guards against stopTask race condition)
      if (this.runningTasks.get(chatId) === runningTask) {
        this.runningTasks.delete(chatId);
        metrics.setGauge('metabot_active_tasks', this.runningTasks.size);
        this.processQueue(chatId);
      }
      if (imagePath) {
        try {
          fs.unlinkSync(imagePath);
        } catch {
          // temp file cleanup, safe to ignore
        }
      }
      if (filePath) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // temp file cleanup, safe to ignore
        }
      }
      for (const p of extraPaths) {
        try {
          fs.unlinkSync(p);
        } catch {
          // temp file cleanup, safe to ignore
        }
      }
      try {
        this.outputsManager.cleanup(outputsDir);
      } catch (err: any) {
        this.logger.debug({ err: err?.message }, 'Output cleanup failed');
      }
    }
  }

  private async fetchKnowledgeContext(
    text: string,
    chatId: string,
  ): Promise<{ systemPromptOverride?: string; knowledgeContext: string | null; agentBoundSkills: string[] }> {
    return fetchKnowledgeContext(this._knowledgeDeps, text, chatId);
  }

  async executeApiTask(options: ApiTaskOptions): Promise<ApiTaskResult> {
    const { prompt, chatId, userId = 'api', sendCards = false } = options;

    if (this.runningTasks.has(chatId)) {
      return { success: false, responseText: '', error: 'Chat is busy with another task' };
    }

    const { session, engineName } = this.prepareSessionForExecution(chatId);
    const cwd = session.workingDirectory;
    const abortController = new AbortController();

    const outputsDir = this.outputsManager.prepareDir(chatId);

    const displayPrompt = prompt;
    const processor = new StreamProcessor(displayPrompt, this.config.contextWindow, this.config.claude.model);
    const rateLimiter = new RateLimiter(1500);

    const initialState: CardState = {
      status: 'thinking',
      userPrompt: displayPrompt,
      responseText: '',
      toolCalls: [],
    };

    let messageId: string | undefined;
    if (sendCards) {
      messageId = await this.getSender(chatId).sendCard(chatId, initialState);
    }

    // Generate a messageId for onUpdate even if sendCards is false
    const effectiveMessageId = messageId || `api-${chatId}-${Date.now()}`;
    options.onUpdate?.(initialState, effectiveMessageId, false);

    const apiContext = {
      botName: this.config.name,
      chatId,
      groupMembers: options.groupMembers,
      groupId: options.groupId,
    };

    // Knowledge retrieval for API tasks
    let systemPromptOverride: string | undefined;
    let knowledgeContext: string | null = null;
    let apiAgentBoundSkills: string[] = [];
    try {
      const knowledgeResult = await this.fetchKnowledgeContext(prompt, chatId);
      systemPromptOverride = knowledgeResult.systemPromptOverride;
      knowledgeContext = knowledgeResult.knowledgeContext;
      apiAgentBoundSkills = knowledgeResult.agentBoundSkills;
    } catch (err) {
      this.logger.warn({ err }, 'Knowledge search for API task failed, continuing without injection');
    }

    // Inject pending summary from previous session reset
    const apiPendingSummary = this.sessionManager.consumePendingSummary(chatId);
    if (apiPendingSummary) {
      knowledgeContext = knowledgeContext
        ? `${knowledgeContext}\n\n## 前次会话摘要\n${apiPendingSummary}`
        : `## 前次会话摘要\n${apiPendingSummary}`;
      this.logger.info({ chatId, summaryLen: apiPendingSummary.length }, 'API task: injected pre-reset summary');
    }

    // Dynamic skill deployment for API tasks (merge with agent-bound skills)
    try {
      const selectedSkills = this.skillRouter.selectSkills(prompt);
      const selectedNames = selectedSkills.map((s) => s.name);
      const mergedNames = [...new Set([...selectedNames, ...apiAgentBoundSkills])];
      deploySelectedSkills(cwd, mergedNames, this.logger);
    } catch (err: any) {
      this.logger.debug({ err: err?.message }, 'Skill staging not available, using default skills');
    }

    const executionHandle = this.executorForChat(chatId).startExecution({
      prompt,
      cwd,
      sessionId: session.sessionId,
      abortController,
      outputsDir,
      apiContext,
      maxTurns: options.maxTurns,
      model: options.model ?? session.model,
      allowedTools: options.allowedTools,
      systemPromptOverride,
      knowledgeContext,

    });

    const startTime = Date.now();
    const runningTask: RunningTask = {
      abortController,
      startTime,
      executionHandle,
      pendingQuestion: null,
      currentQuestionIndex: 0,
      collectedAnswers: {},
      cardMessageId: messageId || '',
      processor,
      rateLimiter,
      chatId,
    };
    this.runningTasks.set(chatId, runningTask);
    metrics.setGauge('metabot_active_tasks', this.runningTasks.size);

    this.audit.log({ event: 'api_task_start', botName: this.config.name, chatId, userId, prompt });
    this.emitActivity({
      type: 'task_started',
      botName: this.config.name,
      chatId,
      userId,
      prompt: prompt?.slice(0, 200),
      timestamp: startTime,
    });

    let timedOut = false;
    let idledOut = false;
    const timeoutId = setTimeout(() => {
      this.logger.warn({ chatId, userId }, 'API task timeout, aborting');
      timedOut = true;
      executionHandle.finish();
      abortController.abort();
    }, TASK_TIMEOUT_MS);

    let idleTimerId: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimer = () => {
      if (idleTimerId) clearTimeout(idleTimerId);
      idleTimerId = setTimeout(() => {
        this.logger.warn({ chatId, userId }, 'API task idle timeout (1h no stream), aborting');
        idledOut = true;
        executionHandle.finish();
        abortController.abort();
      }, IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    let lastState: CardState = {
      status: 'thinking',
      userPrompt: displayPrompt,
      responseText: '',
      toolCalls: [],
    };

    try {
      for await (const message of executionHandle.stream) {
        if (abortController.signal.aborted) break;
        resetIdleTimer();

        const state = processor.processMessage(message);
        lastState = state;

        const newSessionId = processor.getSessionId();
        if (newSessionId && (newSessionId !== session.sessionId || session.sessionIdEngine !== engineName)) {
          this.sessionManager.setSessionId(chatId, newSessionId, engineName);
        }

        if (state.status === 'waiting_for_input' && state.pendingQuestion) {
          const pending = state.pendingQuestion;
          if (options.onQuestion) {
            // Notify the caller about the question state
            options.onUpdate?.(state, effectiveMessageId, false);
            // Wait for the caller to provide an answer
            const answerJson = await options.onQuestion(pending);
            processor.clearPendingQuestion();
            // Parse answers from the caller's JSON and resolve the PreToolUse hook.
            try {
              const parsed = JSON.parse(answerJson);
              executionHandle.resolveQuestion(pending.toolUseId, parsed.answers || {});
            } catch {
              executionHandle.resolveQuestion(pending.toolUseId, { _answer: answerJson });
            }
          } else {
            // Auto-answer when no onQuestion handler is provided
            processor.clearPendingQuestion();
            executionHandle.resolveQuestion(pending.toolUseId, { _auto: 'Please decide on your own and proceed.' });
          }
          continue;
        }

        // Detect SDK-handled tools for side effects only (no sendAnswer).
        const sdkTools = processor.drainSdkHandledTools();
        for (const tool of sdkTools) {
          this.logger.info(
            { chatId, toolName: tool.name, toolUseId: tool.toolUseId },
            'API task: detected SDK-handled tool',
          );
          if (tool.name === 'ExitPlanMode' && sendCards) {
            await this.sendPlanContent(chatId, processor, state);
          }
        }

        if (state.status === 'complete' || state.status === 'error') {
          break;
        }

        if (sendCards && messageId) {
          rateLimiter.schedule(() => {
            this.getSender(chatId).updateCard(messageId!, state);
          });
        }
        options.onUpdate?.(state, effectiveMessageId, false);
      }

      await rateLimiter.cancelAndWait();

      if (lastState.status !== 'complete' && lastState.status !== 'error') {
        if (timedOut) {
          lastState = { ...lastState, status: 'error', errorMessage: TASK_TIMEOUT_MESSAGE };
        } else if (idledOut) {
          lastState = { ...lastState, status: 'error', errorMessage: IDLE_TIMEOUT_MESSAGE };
        } else if (abortController.signal.aborted) {
          lastState = { ...lastState, status: 'error', errorMessage: 'Task was stopped' };
        } else {
          lastState = {
            ...lastState,
            status: lastState.responseText ? 'complete' : 'error',
            errorMessage: lastState.responseText ? undefined : 'Claude session ended unexpectedly',
          };
        }
      }

      // Auto-retry with fresh session when Claude can't find the conversation or context overflows
      const isOverflowResult = lastState.status === 'error' && isContextOverflowError(lastState.errorMessage);
      const isStaleResult = lastState.status === 'error' && isStaleSessionError(lastState.errorMessage) && session.sessionId;
      if (isStaleResult || isOverflowResult) {
        const isOverflow = isOverflowResult;
        this.logger.info(
          { chatId, isOverflow },
          isOverflow
            ? 'API task: context overflow, retrying with continuation prompt'
            : 'API task: stale session detected, retrying with fresh session',
        );
        const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        const retryMsg = isOverflow ? '_对话内容过长，正在压缩上下文并继续..._' : '_Session expired, retrying..._';
        if (sendCards && messageId) {
          await this.getSender(chatId).updateCard(messageId, {
            ...lastState,
            status: 'running',
            responseText: retryMsg,
          });
        }

        const retryPrompt = isOverflow ? this.buildContinuationPrompt(prompt, lastState) : prompt;
        const retryHandle = this.executorForChat(chatId).startExecution({
          prompt: retryPrompt,
          cwd,
          sessionId: undefined,
          abortController,
          outputsDir,
          apiContext,
          model: options.model ?? session.model,
          systemPromptOverride,
          knowledgeContext,

        });
        executionHandle.finish();
        runningTask.executionHandle = retryHandle;

        for await (const message of retryHandle.stream) {
          if (abortController.signal.aborted) break;
          resetIdleTimer();
          const state = processor.processMessage(message);
          lastState = state;
          const newSid = processor.getSessionId();
          if (newSid) this.sessionManager.setSessionId(chatId, newSid, engineName);
          if (state.status === 'complete' || state.status === 'error') break;
          if (sendCards && messageId) {
            rateLimiter.schedule(() => {
              this.getSender(chatId).updateCard(messageId!, state);
            });
          }
          options.onUpdate?.(state, effectiveMessageId, false);
        }
        await rateLimiter.cancelAndWait();
      }

      if (sendCards && messageId) {
        await this.sendFinalCard(messageId, lastState, chatId);
      }
      options.onUpdate?.(lastState, effectiveMessageId, true);

      if (!options.skipOutputFiles) {
        await this.outputHandler.sendOutputFiles(chatId, outputsDir, processor, lastState);
      }

      // Notify web clients about output files before cleanup
      if (options.onOutputFiles) {
        const outputFiles = this.outputsManager.scanOutputs(outputsDir);
        if (outputFiles.length > 0) options.onOutputFiles(outputFiles);
      }

      const durationMs = Date.now() - startTime;
      this.audit.log({
        event: 'api_task_complete',
        botName: this.config.name,
        chatId,
        userId,
        prompt,
        durationMs,
        costUsd: lastState.costUsd,
        error: lastState.errorMessage,
      });
      this.emitActivity({
        type: lastState.status === 'complete' ? 'task_completed' : 'task_failed',
        botName: this.config.name,
        chatId,
        userId,
        prompt: prompt?.slice(0, 200),
        responsePreview: lastState.responseText?.slice(0, 200),
        costUsd: lastState.costUsd,
        durationMs,
        errorMessage: lastState.errorMessage,
        timestamp: Date.now(),
        inputTokens: lastState.inputTokens,
        outputTokens: lastState.outputTokens,
        cacheReadTokens: lastState.cacheReadTokens,
        cacheCreationTokens: lastState.cacheCreationTokens,
        model: lastState.model,
      });
      this.costTracker.record({
        botName: this.config.name,
        userId,
        success: lastState.status === 'complete',
        costUsd: lastState.costUsd,
        durationMs,
        inputTokens: lastState.inputTokens,
        outputTokens: lastState.outputTokens,
        cacheReadTokens: lastState.cacheReadTokens,
        cacheCreationTokens: lastState.cacheCreationTokens,
      });
      metrics.incCounter('metabot_api_tasks_total');
      metrics.observeHistogram('metabot_task_duration_seconds', durationMs / 1000);
      if (lastState.costUsd) metrics.observeHistogram('metabot_task_cost_usd', lastState.costUsd);

      // Auto-record conversation memory (fire-and-forget)
      if (lastState.status === 'complete' && prompt) {
        this.memoryWriter
          .record(this.config.name, prompt, lastState.responseText || '', {
            chatId,
            chatType: options.chatType,
            durationMs,
            costUsd: lastState.costUsd,
          })
          .catch((err) => this.logger.warn({ err, chatId }, 'Failed to process message queue'));
      }

      // Auto-archive output files to MetaMemory (fire-and-forget)
      if (outputsDir && lastState.status === 'complete') {
        const outputFiles = this.outputsManager.scanOutputs(outputsDir);
        if (outputFiles.length > 0) {
          if (options.chatType === 'group' && this.workspaceManager) {
            this.outputArchiver.archiveFilesForGroup(chatId, this.config.name, outputFiles, this.workspaceManager).catch((err) => this.logger.warn({ err, chatId }, 'Failed to archive files for group'));
          } else {
            this.outputArchiver.archiveFiles(this.config.name, outputFiles).catch((err) => this.logger.warn({ err }, 'Failed to archive files'));
          }
        }
      }

      // Record in cross-platform session registry
      await this.recordSession(
        chatId,
        prompt,
        lastState.responseText,
        processor.getSessionId(),
        lastState.costUsd,
        durationMs,
      );

      // Proactive session reset for API tasks too
      if (lastState.status === 'complete' && lastState.totalTokens && lastState.contextWindow && session.sessionId) {
        const usagePct = lastState.totalTokens / lastState.contextWindow;
        if (usagePct >= CONTEXT_USAGE_THRESHOLD) {
          this.logger.info(
            { chatId, usagePct: Math.round(usagePct * 100), sessionId: session.sessionId },
            'API task: proactive session reset (context usage above threshold)',
          );
          await this.handlePreResetContext(chatId, prompt, lastState, options.chatType);
          const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        }
      }

      return {
        success: lastState.status === 'complete',
        responseText: lastState.responseText,
        sessionId: processor.getSessionId(),
        costUsd: lastState.costUsd,
        durationMs: lastState.durationMs,
        error: lastState.errorMessage,
      };
    } catch (err: any) {
      this.logger.error({ err, chatId, userId }, 'API task execution error');

      // Auto-retry with fresh session when Claude can't find the conversation or context overflows
      const errMsg: string = err.message || '';
      const isOverflow = isContextOverflowError(errMsg);
      const isStale = isStaleSessionError(errMsg);
      if ((isStale && session.sessionId) || isOverflow) {
        this.logger.info(
          { chatId, isOverflow },
          isOverflow
            ? 'API task: context overflow in catch, retrying with continuation prompt'
            : 'API task: stale session in catch, retrying with fresh session',
        );
        const _summary = this.buildProactiveSummary(lastState); this.sessionManager.resetSession(chatId, _summary);
        const retryMsg = isOverflow ? '_对话内容过长，正在压缩上下文并继续..._' : '_Session expired, retrying..._';
        if (sendCards && messageId) {
          await this.getSender(chatId).updateCard(messageId, {
            ...lastState,
            status: 'running',
            responseText: retryMsg,
          });
        }

        try {
          const retryPrompt = isOverflow ? this.buildContinuationPrompt(prompt, lastState) : prompt;
          const retryHandle = this.executorForChat(chatId).startExecution({
            prompt: retryPrompt,
            cwd,
            sessionId: undefined,
            abortController,
            outputsDir,
            apiContext,
            model: options.model ?? session.model,
            systemPromptOverride,
            knowledgeContext,

          });
          executionHandle.finish();
          runningTask.executionHandle = retryHandle;

          for await (const message of retryHandle.stream) {
            if (abortController.signal.aborted) break;
            resetIdleTimer();
            const state = processor.processMessage(message);
            lastState = state;
            const newSid = processor.getSessionId();
            if (newSid) this.sessionManager.setSessionId(chatId, newSid, engineName);
            if (state.status === 'complete' || state.status === 'error') break;
            if (sendCards && messageId) {
              rateLimiter.schedule(() => {
                this.getSender(chatId).updateCard(messageId!, state);
              });
            }
            options.onUpdate?.(state, effectiveMessageId, false);
          }
          await rateLimiter.cancelAndWait();

          if (sendCards && messageId) {
            await this.sendFinalCard(messageId, lastState, chatId);
          }
          options.onUpdate?.(lastState, effectiveMessageId, true);

          await this.outputHandler.sendOutputFiles(chatId, outputsDir, processor, lastState);

          if (options.onOutputFiles) {
            const outputFiles = this.outputsManager.scanOutputs(outputsDir);
            if (outputFiles.length > 0) options.onOutputFiles(outputFiles);
          }

          return {
            success: lastState.status === 'complete',
            responseText: lastState.responseText,
            sessionId: processor.getSessionId(),
            costUsd: lastState.costUsd,
            durationMs: lastState.durationMs,
            error: lastState.errorMessage,
          };
        } catch (retryErr: any) {
          this.logger.error({ err: retryErr, chatId }, 'API task retry after stale session also failed');
          // Fall through to normal error handling
        }
      }

      if (sendCards && messageId) {
        const errorState: CardState = {
          status: 'error',
          userPrompt: displayPrompt,
          responseText: lastState.responseText,
          toolCalls: lastState.toolCalls,
          errorMessage: err.message || 'Unknown error',
        };
        await rateLimiter.cancelAndWait();
        await this.sendFinalCard(messageId, errorState, chatId);
      }

      const catchErrorState: CardState = {
        status: 'error',
        userPrompt: displayPrompt,
        responseText: lastState.responseText,
        toolCalls: lastState.toolCalls,
        errorMessage: err.message || 'Unknown error',
      };
      options.onUpdate?.(catchErrorState, effectiveMessageId, true);

      this.emitActivity({
        type: 'task_failed',
        botName: this.config.name,
        chatId,
        userId,
        prompt: prompt?.slice(0, 200),
        errorMessage: err.message || 'Unknown error',
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      });

      return {
        success: false,
        responseText: lastState.responseText,
        error: err.message || 'Unknown error',
      };
    } finally {
      clearTimeout(timeoutId);
      if (idleTimerId) clearTimeout(idleTimerId);
      try {
        executionHandle.finish();
      } catch (e) {
        this.logger.warn({ err: e, chatId }, 'Error finishing execution handle');
      }
      this.runningTasks.delete(chatId);
      metrics.setGauge('metabot_active_tasks', this.runningTasks.size);
      this.processQueue(chatId);
      try {
        this.outputsManager.cleanup(outputsDir);
      } catch (err: any) {
        this.logger.debug({ err: err?.message }, 'Output cleanup failed');
      }
    }
  }

  /**
   * Send the final card update with exponential backoff retry.
   * Retries with exponential backoff (2s → 4s → 8s). If all retries fail,
   * sends a plain text fallback so the user at least sees the result.
   */
  private async sendFinalCard(messageId: string, state: CardState, chatId?: string): Promise<void> {
    return sendFinalCard(this._cardDeps, messageId, state, chatId);
  }

  /**
   * Read and send plan file content to the user when ExitPlanMode is triggered.
   */
  private async sendPlanContent(chatId: string, processor: StreamProcessor, _currentState: CardState): Promise<void> {
    return sendPlanContent(this._cardDeps, chatId, processor, _currentState);
  }

  /**
   * Send a short text message when a task completes (for long-running tasks).
   * Card updates don't trigger Feishu mobile push notifications, but new messages do.
   * Only sends for tasks that took longer than 10 seconds.
   */
  /** Get the OutputArchiver for external wiring (e.g. GroupCoordinator). */
  getOutputArchiver(): OutputArchiver {
    return this.outputArchiver;
  }

  /** Inject WorkspaceManager for proper document routing. */
  setWorkspaceManager(wm: import('../memory/workspace-manager.js').WorkspaceManager): void {
    this.workspaceManager = wm;
    this.memoryWriter.setWorkspaceManager(wm);
  }

  /** Record session and messages in the cross-platform registry. */
  private async recordSession(
    chatId: string,
    prompt: string,
    responseText: string | undefined,
    claudeSessionId: string | undefined,
    costUsd: number | undefined,
    durationMs: number | undefined,
  ): Promise<void> {
    return recordSession(this._sessionDeps, chatId, prompt, responseText, claudeSessionId, costUsd, durationMs);
  }

  private async sendCompletionNotice(chatId: string, state: CardState, durationMs: number): Promise<void> {
    return sendCompletionNotice(this._cardDeps, chatId, state, durationMs);
  }

  updateConfig(newConfig: BotConfigBase): void {
    this.config = newConfig;
    this.engine = createEngine(newConfig, this.logger);
    this.executor = this.engine.createExecutor();
    const engineName = resolveEngineName(newConfig);
    this.engineCache.set(engineName, { engine: this.engine, executor: this.executor });
  }

  /**
   * Build a continuation prompt that carries forward context from the previous (overflowed) session.
   * The new Claude session gets: what was asked, what was done, and what still needs doing.
   */
  private buildContinuationPrompt(originalPrompt: string, lastState: CardState): string {
    const parts: string[] = [
      '## 上下文续接（前次对话因长度溢出被压缩）',
      '',
      `**用户原始请求**: ${originalPrompt.slice(0, 500)}`,
      '',
    ];

    if (lastState.toolCalls && lastState.toolCalls.length > 0) {
      const toolSummary = lastState.toolCalls
        .slice(-10)
        .map((tc) => `- ${tc.name}${tc.detail ? ': ' + tc.detail.slice(0, 100) : ''} [${tc.status}]`)
        .join('\n');
      parts.push(`**已执行的操作**:\n${toolSummary}`, '');
    }

    if (lastState.responseText && lastState.responseText.length > 0) {
      const truncated =
        lastState.responseText.length > 1500
          ? lastState.responseText.slice(0, 1500) + '...(已截断)'
          : lastState.responseText;
      parts.push(`**上次的回复摘要**:\n${truncated}`, '');
    }

    parts.push('---', '');
    parts.push('请基于以上上下文继续。如果之前的操作已完成，直接告诉用户结果。如果有未完成的工作，继续执行。');
    parts.push('', `用户最新消息: ${originalPrompt}`);

    return parts.join('\n');
  }

  /**
   * Handle pre-reset context: generate summary (A) + auto-save to knowledge base (C).
   * Called before resetSession() at proactive reset points.
   */
  private async handlePreResetContext(
    chatId: string,
    prompt: string,
    lastState: CardState,
    chatType?: string,
  ): Promise<void> {
    const botName = this.config.name;

    // C: Auto-save full conversation to knowledge base (fire-and-forget, no rate limit)
    this.autoSaveToKnowledgeBase(chatId, prompt, lastState, chatType).catch((err) => this.logger.warn({ err, chatId }, 'Failed to auto-save to knowledge base'));

    // A: Generate LLM summary and store in SessionManager
    const summary = await this.generateSessionSummary(prompt, lastState);
    if (summary) {
      const session = this.sessionManager.getSession(chatId);
      session.pendingSummary = summary;
      this.sessionManager.markDirty();
      this.logger.info({ chatId, summaryLen: summary.length, botName }, 'Pre-reset summary generated');
    }
  }

  /**
   * Generate a structured conversation summary using the default LLM provider.
   */
  private async generateSessionSummary(prompt: string, lastState: CardState): Promise<string | undefined> {
    try {
      const { rows } = await pool.query(
        "SELECT api_key_encrypted, base_url, model FROM provider_configs WHERE type = 'LLM' AND is_default = true LIMIT 1",
      );
      if (!rows[0]?.api_key_encrypted) return undefined;

      const { decrypt } = await import('../db/crypto.js');
      const apiKey = decrypt(rows[0].api_key_encrypted);
      const baseUrl = (rows[0].base_url || '').replace(/\/+$/, '');
      const model = rows[0].model || 'GLM-5.1';
      const isAnthropic = /\/anthropic/i.test(baseUrl);

      const summaryPrompt = this.buildSummaryInput(prompt, lastState);

      let summaryText: string | undefined;
      if (isAnthropic) {
        summaryText = await this.callAnthropicForSummary(baseUrl, apiKey, model, summaryPrompt);
      } else {
        summaryText = await this.callOpenAIForSummary(baseUrl, apiKey, model, summaryPrompt);
      }

      return summaryText;
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'Failed to generate session summary');
      return undefined;
    }
  }

  private buildSummaryInput(prompt: string, lastState: CardState): string {
    const parts: string[] = [
      '请用中文总结以下对话的核心内容，控制在2000字以内。',
      '',
      '要求：',
      '1. 对话的主题和目标',
      '2. 已完成的工作（具体结果）',
      '3. 进行中或未完成的工作',
      '4. 关键决策和结论',
      '5. 用户明确的偏好或要求',
      '',
    ];

    parts.push(`**用户请求**: ${prompt.slice(0, 500)}`);
    parts.push('');

    if (lastState.toolCalls && lastState.toolCalls.length > 0) {
      const toolSummary = lastState.toolCalls
        .slice(-15)
        .map((tc) => `- ${tc.name}${tc.detail ? ': ' + tc.detail.slice(0, 200) : ''} [${tc.status}]`)
        .join('\n');
      parts.push(`**已执行的操作**:\n${toolSummary}`, '');
    }

    if (lastState.responseText && lastState.responseText.length > 0) {
      const truncated =
        lastState.responseText.length > 4000
          ? lastState.responseText.slice(0, 4000) + '...(已截断)'
          : lastState.responseText;
      parts.push(`**助手回复**:\n${truncated}`, '');
    }

    parts.push('请输出结构化的对话摘要：');
    return parts.join('\n');
  }

  private async callAnthropicForSummary(
    baseUrl: string,
    apiKey: string,
    model: string,
    summaryPrompt: string,
  ): Promise<string | undefined> {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: summaryPrompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return undefined;
    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    return data.content?.find((c) => c.type === 'text')?.text;
  }

  private async callOpenAIForSummary(
    baseUrl: string,
    apiKey: string,
    model: string,
    summaryPrompt: string,
  ): Promise<string | undefined> {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 3000,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return undefined;
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content;
  }

  /**
   * Auto-save conversation to knowledge base before reset.
   * Bypasses MemoryWriter's 10-minute rate limit.
   */
  private async autoSaveToKnowledgeBase(
    chatId: string,
    prompt: string,
    lastState: CardState,
    chatType?: string,
  ): Promise<void> {
    try {
      const botName = this.config.name;
      const title = `[上下文归档] ${prompt.replace(/\n/g, ' ').trim().slice(0, 57)}${prompt.length > 60 ? '...' : ''}`;

      const ts = new Date().toISOString();
      const lines = [`# 上下文归档 ${ts}`, '', `**用户请求**: ${prompt.slice(0, 500)}`, ''];

      if (lastState.toolCalls && lastState.toolCalls.length > 0) {
        const toolSummary = lastState.toolCalls
          .slice(-15)
          .map((tc) => `- ${tc.name}${tc.detail ? ': ' + tc.detail.slice(0, 200) : ''} [${tc.status}]`)
          .join('\n');
        lines.push(`**已执行的操作**:\n${toolSummary}`, '');
      }

      if (lastState.responseText) {
        lines.push('**助手回复**:');
        lines.push(lastState.responseText.slice(0, 4000));
        lines.push('');
      }

      const content = lines.join('\n');
      const tags = ['auto-archive', 'context-reset', botName, chatId];

      if (this.workspaceManager) {
        if (chatType === 'group') {
          await this.workspaceManager.createGroupDoc(chatId, 'knowledge', title, content, tags);
        } else {
          await this.workspaceManager.createBotDoc(botName, 'knowledge', title, content, tags);
        }
      } else {
        const folderId = await this.ensureKnowledgeFolder(botName);
        if (folderId) {
          await this.memoryClient.createDocument({
            title,
            content,
            tags,
            folder_id: folderId,
            created_by: botName,
          });
        }
      }

      this.logger.info({ botName, chatId }, 'Auto-saved conversation to knowledge base before reset');
    } catch (err: any) {
      this.logger.warn({ err: err?.message, chatId }, 'Failed to auto-save to knowledge base');
    }
  }

  private async ensureKnowledgeFolder(botName: string): Promise<string | null> {
    const empRoot = await this.memoryClient.ensureFolder('数字员工');
    if (!empRoot) return null;
    const botRoot = await this.memoryClient.ensureFolder(botName, empRoot);
    if (!botRoot) return null;
    return await this.memoryClient.ensureFolder('知识沉淀', botRoot);
  }

  private async executeWithOrchestrator(
    msg: IncomingMessage,
    agentConfig: AgentRuntimeConfig,
    cwd: string,
    outputsDir: string,
    cardMessageId: string,
    abortController: AbortController,
  ): Promise<void> {
    const result = await this.orchestrator.execute(
      msg,
      agentConfig,
      cwd,
      outputsDir,
      cardMessageId,
      abortController,
      (chatId) => this.getSender(chatId),
    );

    this.audit.log({
      event: result.success ? "task_complete" : "task_error",
      botName: this.config.name,
      chatId: msg.chatId,
      userId: msg.userId,
      meta: {
        intent: result.progress.intentName,
        totalSteps: result.progress.totalSteps,
        totalCostUsd: result.totalCostUsd,
        totalDurationMs: result.totalDurationMs,
      },
    });

    const lastResult = result.progress.steps[result.progress.steps.length - 1]?.result;
    if (lastResult) {
      const finalState = {
        status: result.success ? "complete" as const : "error" as const,
        userPrompt: msg.text || "",
        responseText: result.success
          ? `✅ 编排完成: ${result.progress.intentName} (${result.progress.totalSteps}步, 费用: $${result.totalCostUsd.toFixed(4)})`
          : `❌ 编排失败: ${result.error || "未知错误"}`,
        toolCalls: [],
        costUsd: result.totalCostUsd,
        durationMs: result.totalDurationMs,
      };
      await this.sendFinalCard(cardMessageId, finalState, msg.chatId);
    }

    this.emitActivity({
      type: result.success ? "task_completed" : "task_failed",
      botName: this.config.name,
      chatId: msg.chatId,
      userId: msg.userId,
      prompt: msg.text?.slice(0, 200),
      timestamp: Date.now(),
    });
  }


  private buildProactiveSummary(state: { responseText?: string; toolCalls?: Array<{ name: string; detail: string }> }): string | undefined {
    const parts: string[] = [];
    if (state.responseText) {
      parts.push("## 最近回复");
      parts.push(state.responseText.slice(0, 2000));
    }
    if (state.toolCalls && state.toolCalls.length > 0) {
      parts.push("## 最近的工具调用");
      const lines = state.toolCalls.slice(-10).map(t => "- " + t.name + ": " + t.detail.slice(0, 200));
      parts.push(lines.join(String.fromCharCode(10)));
    }
    return parts.length > 0 ? parts.join(String.fromCharCode(10) + String.fromCharCode(10)) : undefined;
  }

  destroy(): void {
    for (const [, batch] of this.pendingBatches) {
      clearTimeout(batch.timerId);
    }
    this.pendingBatches.clear();
    for (const [chatId, task] of this.runningTasks) {
      if (task.questionTimeoutId) {
        clearTimeout(task.questionTimeoutId);
      }
      task.executionHandle.finish();
      task.abortController.abort();
      this.logger.info({ chatId }, 'Aborted running task during shutdown');
    }
    this.runningTasks.clear();
    this.sessionManager.destroy();
  }
}
