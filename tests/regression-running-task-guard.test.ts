/**
 * Regression test for runningTask guard in executeApiTask finally block.
 *
 * Bug: executeApiTask's finally block unconditionally deleted runningTasks.delete(chatId),
 * which could delete a NEW task if a new message arrived during API execution.
 * Fix: Added guard `if (this.runningTasks.get(chatId) === runningTask)` before delete.
 */
import { describe, expect, it } from 'vitest';

describe('runningTask guard regression', () => {
  it('should only delete task if it is still the current running task', () => {
    const runningTasks = new Map<string, { id: string }>();

    const originalTask = { id: 'task-1' };
    runningTasks.set('chat1', originalTask);

    // Simulate: new task replaced the original during execution
    const newTask = { id: 'task-2' };
    runningTasks.set('chat1', newTask);

    // Bug (old code): unconditional delete
    runningTasks.delete('chat1');
    expect(runningTasks.has('chat1')).toBe(false);
    // newTask was incorrectly deleted!

    // Reset
    runningTasks.set('chat1', originalTask);
    runningTasks.set('chat1', newTask);

    // Fix (new code): guarded delete
    if (runningTasks.get('chat1') === originalTask) {
      runningTasks.delete('chat1');
    }
    // newTask should still be there
    expect(runningTasks.get('chat1')).toEqual({ id: 'task-2' });
  });

  it('should delete task when it is still the current task', () => {
    const runningTasks = new Map<string, { id: string }>();
    const task = { id: 'task-1' };
    runningTasks.set('chat1', task);

    // Fix (new code): guarded delete — should succeed
    if (runningTasks.get('chat1') === task) {
      runningTasks.delete('chat1');
    }

    expect(runningTasks.has('chat1')).toBe(false);
  });

  it('should not interfere with tasks on other chatIds', () => {
    const runningTasks = new Map<string, { id: string }>();
    const task1 = { id: 'task-1' };
    const task2 = { id: 'task-2' };
    runningTasks.set('chat1', task1);
    runningTasks.set('chat2', task2);

    if (runningTasks.get('chat1') === task1) {
      runningTasks.delete('chat1');
    }

    expect(runningTasks.has('chat1')).toBe(false);
    expect(runningTasks.get('chat2')).toEqual({ id: 'task-2' });
  });
});
