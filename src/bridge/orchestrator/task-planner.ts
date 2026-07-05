import type { IntentDefinition, ExecutionPlan } from './types.js';

export class TaskPlanner {
  build(intent: IntentDefinition, userMessage: string): ExecutionPlan {
    const steps = intent.chain.map((s) => ({
      step: s.step,
      skill: s.skill,
      prompt: s.prompt.replaceAll('{user_message}', userMessage),
      gates: s.gates,
      retry: s.retry,
      wait_for_user: s.wait_for_user,
    }));

    return { steps };
  }
}
