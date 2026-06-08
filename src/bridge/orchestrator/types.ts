/** 门控类型 */
export type GateType =
  | 'test_pass'
  | 'coverage'
  | 'lint_pass'
  | 'typecheck_pass'
  | 'docker_build_pass'
  | 'health_check'
  | 'rollback_available'
  | 'repro_test_exists'
  | 'step_timeout'
  | 'requirement_verify';

/** 门控规则 */
export interface GateRule {
  type: GateType;
  threshold?: number;
  endpoint?: string;
  expect?: number;
  cwd?: string;
}

/** 门控检查结果 */
export interface GateResult {
  passed: boolean;
  gate: GateType;
  actual?: string;
  expected?: string;
  error?: string;
  durationMs: number;
}

/** 编排任务步骤（来自 DB jsonb） */
export interface OrchestrationStep {
  step: string;
  skill?: string;
  prompt: string;
  gates: GateRule[];
  retry: number;
  wait_for_user?: boolean;
}

/** 意图定义（来自 DB jsonb） */
export interface IntentDefinition {
  name: string;
  triggers: string[];
  chain: OrchestrationStep[];
}

/** 完整的编排配置（agents.orchestration jsonb） */
export interface OrchestrationConfig {
  intents: IntentDefinition[];
}

/** 行为边界 */
export interface BoundaryConfig {
  can: string[];
  cannot: string[];
  escalate_when: string[];
}

/** 完整的 Agent 运行时配置（从 agents 表查出） */
export interface AgentRuntimeConfig {
  agentId: string;
  name: string;
  systemPrompt: string;
  orchestration: OrchestrationConfig;
  skills: string[];
  boundary: BoundaryConfig;
  ironLaws: string[];
  knowledgeFolders: string[];
}

/** 单个步骤的执行结果 */
export interface StepResult {
  step: string;
  success: boolean;
  output: string;
  summary: string;
  gateResults: GateResult[];
  durationMs: number;
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** 本 step 所有 tool 调用（含 subagent）— 供进度卡片"执行上下文"区渲染 */
  toolCalls?: import('../../types.js').ToolCall[];
  /** 上下文总占用（input+output+cache） */
  totalTokens?: number;
  /** 模型上下文窗口大小 */
  contextWindow?: number;
  /** 本 step 加载的 skill 名（来自 OrchestrationStep.skill） */
  currentSkill?: string;
}

/** 编排执行状态 */
export type OrchestrationStatus = 'running' | 'waiting_user' | 'completed' | 'failed';

/** 编排执行进度 */
export interface OrchestrationProgress {
  status: OrchestrationStatus;
  intentName: string;
  currentStepIndex: number;
  totalSteps: number;
  steps: Array<{
    step: string;
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
    result?: StepResult;
  }>;
}

/** 编排执行最终结果 */
export interface OrchestrationResult {
  success: boolean;
  progress: OrchestrationProgress;
  allGateResults: GateResult[];
  totalDurationMs: number;
  totalCostUsd: number;
  error?: string;
  /** Aggregated incomplete work (skipped steps + failed gates). Empty when success. */
  pendingTasks?: PendingTask[];
  /** Populated when status is 'waiting_user' — the full plan for resume. */
  plan?: ExecutionPlan;
}

/** Severity hint for pending items shown in the red 看板 card. */
export type PendingSeverity = 'high' | 'medium' | 'low';

/** Source of a pending item. */
export type PendingSource = 'step_skipped' | 'step_failed' | 'gate_failed' | 'subagent_interrupted';

export interface PendingTask {
  severity: PendingSeverity;
  source: PendingSource;
  /** Short title (1 line, used in the card list). */
  title: string;
  /** 1-2 sentence detail (rendered as sub-line). */
  detail?: string;
  /** Originating orchestration step name (for '回到主线' resume flow). */
  stepName?: string;
  /** Step index in the original plan, for sorting / resume. */
  stepIndex?: number;
}

/** 已渲染的执行计划步骤 */
export interface ExecutionStep {
  step: string;
  skill?: string;
  prompt: string;
  gates: GateRule[];
  retry: number;
  wait_for_user?: boolean;
}

/** 执行计划 */
export interface ExecutionPlan {
  steps: ExecutionStep[];
}
