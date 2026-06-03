import { randomUUID } from 'node:crypto';
import { ApprovalStatus } from '../../core/constants.js';
import type { ApprovalTask } from '../../core/types.js';
import { ApprovalAction } from '../../core/constants.js';

export class ApprovalQueue {
  private queue = new Map<string, ApprovalTask>();

  submit(action: ApprovalAction, actor: string, target: string, reason: string, metadata: Record<string, unknown> = {}): ApprovalTask {
    const task: ApprovalTask = {
      id: randomUUID(),
      action,
      actor,
      target,
      reason,
      status: ApprovalStatus.PENDING,
      createdAt: new Date(),
      metadata,
    };
    this.queue.set(task.id, task);
    return task;
  }

  approve(id: string, resolvedBy: string): ApprovalTask {
    return this.resolve(id, ApprovalStatus.APPROVED, resolvedBy);
  }

  reject(id: string, resolvedBy: string): ApprovalTask {
    return this.resolve(id, ApprovalStatus.REJECTED, resolvedBy);
  }

  getPending(): ApprovalTask[] {
    return Array.from(this.queue.values()).filter((t) => t.status === ApprovalStatus.PENDING);
  }

  get(id: string): ApprovalTask | undefined {
    return this.queue.get(id);
  }

  private resolve(id: string, status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED, resolvedBy: string): ApprovalTask {
    const task = this.queue.get(id);
    if (!task) throw new Error(`Approval task not found: ${id}`);
    if (task.status !== ApprovalStatus.PENDING) throw new Error(`Task already resolved: ${task.status}`);
    task.status = status;
    task.resolvedAt = new Date();
    task.resolvedBy = resolvedBy;
    return task;
  }
}
