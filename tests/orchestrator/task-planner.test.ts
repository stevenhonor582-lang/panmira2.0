import { describe, it, expect } from 'vitest';
import { TaskPlanner } from '../../src/bridge/orchestrator/task-planner.js';
import type { IntentDefinition } from '../../src/bridge/orchestrator/types.js';

const intentWithOneStep: IntentDefinition = {
  name: 'Bug修复',
  triggers: ['bug'],
  chain: [
    {
      step: 'debug',
      skill: 'superpowers:systematic-debugging',
      prompt: '分析以下问题：{user_message}',
      gates: [],
      retry: 1,
    },
  ],
};

const intentWithMultipleSteps: IntentDefinition = {
  name: '新功能开发',
  triggers: ['新建'],
  chain: [
    {
      step: 'design',
      prompt: '设计：{user_message}',
      gates: [],
      retry: 1,
      wait_for_user: true,
    },
    {
      step: 'implement',
      skill: 'superpowers:TDD',
      prompt: '实现：{user_message}\n上一步：{previous_output}',
      gates: [{ type: 'test_pass' }],
      retry: 2,
    },
    {
      step: 'verify',
      prompt: '验证',
      gates: [{ type: 'test_pass' }, { type: 'lint_pass' }],
      retry: 1,
    },
  ],
};

describe('TaskPlanner', () => {
  const planner = new TaskPlanner();

  it('builds a plan with one step', () => {
    const plan = planner.build(intentWithOneStep, '请修bug');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].step).toBe('debug');
    expect(plan.steps[0].skill).toBe('superpowers:systematic-debugging');
    expect(plan.steps[0].retry).toBe(1);
  });

  it('replaces {user_message} placeholder', () => {
    const plan = planner.build(intentWithOneStep, '我的程序挂了');
    expect(plan.steps[0].prompt).toContain('我的程序挂了');
    expect(plan.steps[0].prompt).not.toContain('{user_message}');
  });

  it('preserves {previous_output} placeholder', () => {
    const plan = planner.build(intentWithMultipleSteps, '新建用户系统');
    expect(plan.steps[1].prompt).toContain('{previous_output}');
  });

  it('builds a plan with multiple steps preserving order', () => {
    const plan = planner.build(intentWithMultipleSteps, '新建用户系统');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].step).toBe('design');
    expect(plan.steps[1].step).toBe('implement');
    expect(plan.steps[2].step).toBe('verify');
  });

  it('preserves gate rules', () => {
    const plan = planner.build(intentWithMultipleSteps, 'test');
    expect(plan.steps[1].gates).toEqual([{ type: 'test_pass' }]);
    expect(plan.steps[2].gates).toEqual([{ type: 'test_pass' }, { type: 'lint_pass' }]);
  });

  it('preserves wait_for_user flag', () => {
    const plan = planner.build(intentWithMultipleSteps, 'test');
    expect(plan.steps[0].wait_for_user).toBe(true);
    expect(plan.steps[1].wait_for_user).toBeUndefined();
  });
});
