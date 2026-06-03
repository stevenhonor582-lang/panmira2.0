import { randomUUID } from 'node:crypto';
import { TaskStatus } from '../core/constants.js';
import type { Task } from '../core/types.js';
import { TaskStateMachine } from './state-machine.js';

export class TaskManager {
  private tasks = new Map<string, Task>();
  private stateMachine = new TaskStateMachine();

  create(name: string, metadata: Record<string, unknown> = {}): Task {
    const now = new Date();
    const task: Task = {
      id: randomUUID(),
      name,
      status: TaskStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      metadata,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  transition(id: string, target: TaskStatus): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    task.status = this.stateMachine.transition(task.status, target);
    task.updatedAt = new Date();
    return task;
  }

  complete(id: string, result?: unknown): Task {
    const task = this.transition(id, TaskStatus.COMPLETED);
    task.result = result;
    return task;
  }

  fail(id: string, error: string): Task {
    const task = this.transition(id, TaskStatus.FAILED);
    task.error = error;
    return task;
  }

  cancel(id: string): Task {
    return this.transition(id, TaskStatus.CANCELLED);
  }

  list(status?: TaskStatus): Task[] {
    const all = Array.from(this.tasks.values());
    return status ? all.filter((t) => t.status === status) : all;
  }

  onTransition(from: TaskStatus, to: TaskStatus, cb: (from: TaskStatus, to: TaskStatus) => void): void {
    this.stateMachine.on(from, to, cb);
  }
}
