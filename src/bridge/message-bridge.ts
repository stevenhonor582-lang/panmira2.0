/**
 * R49-C1 step 6: MessageBridge facade.
 * Re-exports the real implementation from ./message-bridge-impl.js.
 * 12 个外部 import 站点零改动 (group-coordinator / bot-registry / agent-bus /
 * bot-routes / feishu-bot-starter / telegram-bot / wechat-bot / index.ts /
 * team-pipeline / review-panel / multi-bot-orchestrator / expert-subagent)。
 *
 * 历史:
 *  - 2026-07-11 步 1: 抽出 BridgeObserver (83 行)
 *  - 2026-07-11 步 2: 抽出 BridgeCard (181 行)
 *  - 2026-07-11 步 3: 抽出 BridgeExecutor (259 行)
 *  - 2026-07-11 步 4: 抽出 BridgeStream (226 行)
 *  - 2026-07-11 步 5: 抽出 BridgeCore + BridgeCoreDelegates (126 行)
 *  - 2026-07-11 步 6: facade 收尾 (本文件 23 行,只 re-export)
 */
export { MessageBridge } from './message-bridge-impl.js';
export type {
  PendingBatch,
  RunningTask,
  ApiTaskOptions,
  ApiTaskResult,
  ActivityEventData,
} from './bridge-types.js';