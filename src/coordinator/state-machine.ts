import { TaskStatus } from '../core/constants.js';
import { InvalidTransitionError } from '../core/errors.js';

type TransitionCallback = (from: TaskStatus, to: TaskStatus) => void;

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
  [TaskStatus.RUNNING]: [TaskStatus.WAITING, TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
  [TaskStatus.WAITING]: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.FAILED]: [],
  [TaskStatus.CANCELLED]: [],
};

const TERMINAL_STATES = new Set([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]);

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATES.has(status);
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export class TaskStateMachine {
  private callbacks = new Map<string, TransitionCallback[]>();

  private key(from: TaskStatus, to: TaskStatus): string {
    return `${from}->${to}`;
  }

  on(from: TaskStatus, to: TaskStatus, cb: TransitionCallback): void {
    const k = this.key(from, to);
    const existing = this.callbacks.get(k) ?? [];
    this.callbacks.set(k, [...existing, cb]);
  }

  transition(current: TaskStatus, target: TaskStatus): TaskStatus {
    if (!canTransition(current, target)) {
      throw new InvalidTransitionError(current, target);
    }
    const cbs = this.callbacks.get(this.key(current, target)) ?? [];
    for (const cb of cbs) cb(current, target);
    return target;
  }
}
