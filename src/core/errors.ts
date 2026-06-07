export class PanmiraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PanmiraError';
  }
}

export class TenantNotFoundError extends PanmiraError {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

export class UserNotFoundError extends PanmiraError {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class AgentNotFoundError extends PanmiraError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
  }
}

export class UnauthorizedError extends PanmiraError {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends PanmiraError {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ApprovalRequiredError extends PanmiraError {
  constructor(action: string) {
    super(`Approval required for action: ${action}`);
    this.name = 'ApprovalRequiredError';
  }
}

export class InvalidTransitionError extends PanmiraError {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
