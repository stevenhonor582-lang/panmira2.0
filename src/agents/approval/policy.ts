import { ApprovalAction } from '../../core/constants.js';

interface ApprovalPolicy {
  action: ApprovalAction;
  requiresApproval: boolean;
  autoApproveBelow?: number;
}

const DEFAULT_POLICIES: ApprovalPolicy[] = [
  { action: ApprovalAction.SEND_MESSAGE, requiresApproval: true, autoApproveBelow: 3 },
  { action: ApprovalAction.EXTERNAL_API, requiresApproval: true },
  { action: ApprovalAction.DATA_ACCESS, requiresApproval: true },
];

export function requiresApproval(action: ApprovalAction, metadata?: Record<string, unknown>): boolean {
  const policy = DEFAULT_POLICIES.find((p) => p.action === action);
  if (!policy?.requiresApproval) return false;
  if (policy.autoApproveBelow != null && metadata?.count != null) {
    return (metadata.count as number) >= policy.autoApproveBelow;
  }
  return true;
}
