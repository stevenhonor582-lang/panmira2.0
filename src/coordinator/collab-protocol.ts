import { randomUUID } from 'node:crypto';
import { CollabRequestStatus } from '../core/constants.js';
import type { CollabRequest } from '../core/types.js';

export class CollabProtocol {
  private requests = new Map<string, CollabRequest>();

  request(fromAgent: string, toAgent: string, taskId: string): CollabRequest {
    const req: CollabRequest = {
      id: randomUUID(),
      fromAgent,
      toAgent,
      taskId,
      status: CollabRequestStatus.PENDING,
      createdAt: new Date(),
    };
    this.requests.set(req.id, req);
    return req;
  }

  accept(id: string): CollabRequest {
    return this.updateStatus(id, CollabRequestStatus.ACCEPTED);
  }

  reject(id: string): CollabRequest {
    return this.updateStatus(id, CollabRequestStatus.REJECTED);
  }

  complete(id: string, result?: unknown): CollabRequest {
    const req = this.updateStatus(id, CollabRequestStatus.COMPLETED);
    req.result = result;
    return req;
  }

  getPendingForAgent(agentName: string): CollabRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.toAgent === agentName && r.status === CollabRequestStatus.PENDING,
    );
  }

  private updateStatus(id: string, status: CollabRequestStatus): CollabRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Collab request not found: ${id}`);
    req.status = status;
    req.respondedAt = new Date();
    return req;
  }
}
