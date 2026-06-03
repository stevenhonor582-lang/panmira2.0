// Exception hierarchy migrated from matebot Python

export class MateBotError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MateBotError';
  }
}

export class TenantNotFoundError extends MateBotError {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

export class UserNotFoundError extends MateBotError {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class AgentNotFoundError extends MateBotError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
  }
}

export class UnauthorizedError extends MateBotError {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends MateBotError {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ApprovalRequiredError extends MateBotError {
  constructor(action: string) {
    super(`Approval required for action: ${action}`);
    this.name = 'ApprovalRequiredError';
  }
}

export class InvalidTransitionError extends MateBotError {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}
