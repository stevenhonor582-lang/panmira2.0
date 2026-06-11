import type { Trace } from '../store/chat-store';
import type { AgentName } from '../../../shared/agent-types';

const AGENT_LABELS: Record<AgentName, string> = {
  generation: '生成',
  quality: '质检',
  optimization: '优化',
  verification: '校验',
  memory: '记忆',
  execution: '执行'
};

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '⏵',
  done: '✓',
  failed: '✗'
};

interface Props {
  trace: Trace;
}

export function AgentTrace({ trace }: Props) {
  return (
    <div data-testid="agent-trace" style={{ fontFamily: 'monospace' }}>
      {trace.steps.map((step) => (
        <div key={step.agent} data-status={step.status}>
          {STATUS_ICONS[step.status]} {AGENT_LABELS[step.agent]}
          {step.message && <span> — {step.message}</span>}
        </div>
      ))}
    </div>
  );
}
