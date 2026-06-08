import type { Logger } from '../../utils/logger.js';
import type { IncomingMessage } from '../../types.js';
import type { IMessageSender } from '../message-sender.interface.js';
import type { MemoryClient } from '../../memory/memory-client.js';
import type {
  AgentRuntimeConfig,
  OrchestrationResult,
  OrchestrationProgress,
  OrchestrationStatus,
  GateResult,
  StepResult,
  OrchestrationStep,
  ExecutionPlan,
  ExecutionStep,
} from './types.js';
import { IntentResolver } from './intent-resolver.js';
import { TaskPlanner } from './task-planner.js';
import { ContextBuilder } from './context-builder.js';
import { GateChecker } from './gate-checker.js';
import { SkillLoader } from './skill-loader.js';
import { StepExecutor } from './step-executor.js';
import { CardUpdater } from './card-updater.js';

/** State needed to resume a paused orchestration (wait_for_user). */
export interface OrchestrationResumeState {
  agentConfig: AgentRuntimeConfig;
  plan: ExecutionPlan;
  progress: OrchestrationProgress;
  previousOutput: string;
  allGateResults: GateResult[];
  totalCostUsd: number;
  knowledgeContext: string;
  cwd: string;
  outputsDir: string;
  cardMessageId: string;
  preFetchedKnowledge?: string;
}

export class Orchestrator {
  private intentResolver: IntentResolver;
  private taskPlanner: TaskPlanner;
  private contextBuilder: ContextBuilder;
  private gateChecker: GateChecker;
  private skillLoader: SkillLoader;
  private cardUpdater: CardUpdater;

  constructor(
    private stepExecutor: StepExecutor,
    private memoryClient: MemoryClient | undefined,
    private logger: Logger,
  ) {
    this.intentResolver = new IntentResolver();
    this.taskPlanner = new TaskPlanner();
    this.contextBuilder = new ContextBuilder();
    this.gateChecker = new GateChecker(logger);
    this.skillLoader = new SkillLoader();
    this.cardUpdater = new CardUpdater(logger);
  }

  async execute(
    msg: IncomingMessage,
    agentConfig: AgentRuntimeConfig,
    cwd: string,
    outputsDir: string,
    cardMessageId: string,
    abortController: AbortController,
    getSender: (chatId?: string) => IMessageSender,
    ragContext?: { formattedContext: string; sourceCount: number },
    preFetchedKnowledge?: string,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const { chatId, text: userMessage } = msg;

    // 1. Intent matching
    const intent = this.intentResolver.resolve(userMessage, agentConfig.orchestration.intents);
    this.logger.info(
      { chatId, intent: intent.name, userMessage: userMessage.slice(0, 100) },
      'Intent resolved',
    );

    // 2. Knowledge search (Layer 5)
    let knowledgeContext = '';
    if (preFetchedKnowledge) {
      knowledgeContext = preFetchedKnowledge;
      this.logger.debug({ chatId, len: knowledgeContext.length }, 'Using pre-fetched knowledge context');
    } else if (this.memoryClient && agentConfig.knowledgeFolders.length > 0 && userMessage) {
      try {
        const searchQuery = userMessage.slice(0, 300);
        const results = await this.memoryClient.searchInFolders(searchQuery, agentConfig.knowledgeFolders, 3);
        if (results && results.length > 0) {
          const formatted = results
            .map((r: any, i: number) => {
              const snippet = (r.snippet || '').replace(/<[^>]*>/g, '');
              return `### ${i + 1}. ${r.title}\n${snippet.slice(0, 300)}`;
            })
            .join('\n\n');
          knowledgeContext = formatted;
          this.logger.info(
            { chatId, folders: agentConfig.knowledgeFolders, resultCount: results.length },
            'Knowledge search results injected',
          );
        }
      } catch (err: any) {
        this.logger.debug({ err: err?.message }, 'Knowledge search skipped');
      }
    }

    // 3. Build plan
    const plan = this.taskPlanner.build(intent, userMessage);
    const progress: OrchestrationProgress = {
      status: 'running',
      intentName: intent.name,
      currentStepIndex: 0,
      totalSteps: plan.steps.length,
      steps: plan.steps.map((s) => ({ step: s.step, status: 'pending' })),
    };

    await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);

    // 4. Execute steps (delegated to shared loop)
    return this.executeSteps({
      msg, agentConfig, plan, progress, cwd, outputsDir, cardMessageId,
      abortController, getSender, startTime,
      previousOutput: `[用户需求] ${userMessage}`,
      allGateResults: [],
      totalCostUsd: 0,
      knowledgeContext,
      userMessage,
    });
  }

  /** Resume a paused orchestration from the given state. */
  async resume(
    msg: IncomingMessage,
    state: OrchestrationResumeState,
    abortController: AbortController,
    getSender: (chatId?: string) => IMessageSender,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    return this.executeSteps({
      msg,
      agentConfig: state.agentConfig,
      plan: state.plan,
      progress: state.progress,
      cwd: state.cwd,
      outputsDir: state.outputsDir,
      cardMessageId: state.cardMessageId,
      abortController,
      getSender,
      startTime,
      previousOutput: state.previousOutput,
      allGateResults: state.allGateResults,
      totalCostUsd: state.totalCostUsd,
      knowledgeContext: state.knowledgeContext,
      userMessage: msg.text || '',
    });
  }

  /** Shared step execution loop — used by both execute() and resume(). */
  private async executeSteps(params: {
    msg: IncomingMessage;
    agentConfig: AgentRuntimeConfig;
    plan: ExecutionPlan;
    progress: OrchestrationProgress;
    cwd: string;
    outputsDir: string;
    cardMessageId: string;
    abortController: AbortController;
    getSender: (chatId?: string) => IMessageSender;
    startTime: number;
    previousOutput: string;
    allGateResults: GateResult[];
    totalCostUsd: number;
    knowledgeContext: string;
    userMessage: string;
  }): Promise<OrchestrationResult> {
    const {
      msg, agentConfig, plan, cwd, outputsDir, cardMessageId,
      abortController, getSender, startTime, knowledgeContext, userMessage,
    } = params;
    let { previousOutput, totalCostUsd } = params;
    const progress = params.progress;
    const allGateResults = params.allGateResults;

    for (let i = progress.currentStepIndex; i < plan.steps.length; i++) {
      if (abortController.signal.aborted) {
        progress.status = 'failed';
        return {
          success: false, progress, allGateResults,
          totalDurationMs: Date.now() - startTime, totalCostUsd,
          error: 'Aborted',
        };
      }

      const step = plan.steps[i];

      // ── wait_for_user: pause and wait for user confirmation ──
      if (step.wait_for_user && progress.steps[i].status !== 'passed') {
        progress.status = 'waiting_user';
        progress.currentStepIndex = i;
        progress.steps[i].status = 'running'; // show as active so card renders it
        await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);

        this.logger.info({ step: step.step, chatId: msg.chatId }, 'Orchestration paused for user approval');
        return {
          success: false,
          progress,
          allGateResults,
          totalDurationMs: Date.now() - startTime,
          totalCostUsd,
          plan, // include plan so caller can reconstruct resume state
          error: undefined,
        };
      }

      progress.currentStepIndex = i;
      progress.steps[i].status = 'running';
      await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);

      // Load skill
      let skillContent = '';
      if (step.skill) {
        skillContent = this.skillLoader.loadForStep(step.skill, step.step);
      }

      // Build context
      const stepContext = this.contextBuilder.build({
        agentConfig, step, skillContent, previousOutput, userMessage, knowledgeContext,
      });

      // Execute step with retries
      const stepTimeoutMs = (step as any).timeoutMs ?? 10 * 60 * 1000;
      let stepResult: StepResult | null = null;
      let retriesLeft = step.retry;

      do {
        const stepAbortController = new AbortController();
        const stepTimeoutId = setTimeout(
          () => stepAbortController.abort(new Error('步骤超时（10分钟无进展）')),
          stepTimeoutMs,
        );
        const onGlobalAbort = () => stepAbortController.abort();
        abortController.signal.addEventListener('abort', onGlobalAbort, { once: true });

        stepResult = await this.stepExecutor.execute({
          prompt: stepContext, cwd, outputsDir,
          abortController: stepAbortController, chatId: msg.chatId,
          currentSkill: step.skill,
        });

        clearTimeout(stepTimeoutId);
        abortController.signal.removeEventListener('abort', onGlobalAbort);

        if (stepAbortController.signal.aborted && !abortController.signal.aborted) {
          this.logger.warn({ step: step.step, timeoutMs: stepTimeoutMs }, 'Step timed out');
          stepResult.success = false;
          stepResult.output = `[步骤超时] 执行超过 ${stepTimeoutMs / 1000}s`;
          stepResult.gateResults = [{
            gate: 'step_timeout' as const, passed: false,
            expected: `在 ${stepTimeoutMs / 1000}s 内完成`, actual: '超时未完成',
            durationMs: stepTimeoutMs,
          }];
          break;
        }

        const gateResults = await this.gateChecker.checkAll(step.gates, stepResult, cwd);
        allGateResults.push(...gateResults);
        stepResult.gateResults = gateResults;
        const allPassed = stepResult.success && gateResults.every((g) => g.passed);

        this.logger.info({
          step: step.step, success: stepResult.success,
          gatesPassed: allPassed, retriesLeft, costUsd: stepResult.costUsd,
        }, 'Step executed');

        if (allPassed) break;

        retriesLeft--;
        if (retriesLeft >= 0) {
          const failedInfo = gateResults
            .filter((g) => !g.passed)
            .map((g) => `${g.gate}: 期望${g.expected}, 实际${g.actual}`)
            .join('; ');
          previousOutput = `${stepResult.output}\n\n[门控未通过: ${failedInfo}] 请修正后重试。`;
        }
      } while (retriesLeft >= 0);

      const allGatesPassed = stepResult!.gateResults.every((g) => g.passed);
      progress.steps[i].status = allGatesPassed ? 'passed' : 'failed';
      progress.steps[i].result = stepResult!;

      if (!allGatesPassed) {
        progress.status = 'failed';
        await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);
        return {
          success: false, progress, allGateResults,
          totalDurationMs: Date.now() - startTime, totalCostUsd,
          error: `步骤 "${step.step}" 门控未通过，重试 ${step.retry} 次后仍失败`,
        };
      }

      previousOutput = this.buildStepHandoff(step, stepResult!);
      totalCostUsd += stepResult!.costUsd;
      await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);
    }

    // Complete
    progress.status = 'completed';
    progress.currentStepIndex = plan.steps.length;
    await this.cardUpdater.update(msg.chatId, cardMessageId, progress, getSender);

    const totalDurationMs = Date.now() - startTime;
    this.logger.info({
      chatId: msg.chatId, intent: progress.intentName,
      totalSteps: plan.steps.length, totalDurationMs, totalCostUsd,
    }, 'Orchestration completed');

    return { success: true, progress, allGateResults, totalDurationMs, totalCostUsd };
  }

  private buildStepHandoff(step: OrchestrationStep, result: StepResult): string {
    const summary = result.summary || result.output.slice(0, 500);
    return `[步骤 "${step.step}" 完成]\n${summary}`;
  }
}
