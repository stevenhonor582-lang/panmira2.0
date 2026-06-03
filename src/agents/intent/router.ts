import { Intent } from '../../core/constants.js';
import type { IntentClassification, AgentSelection, RoutingResult } from '../../core/types.js';
import type { BaseAgent } from '../base-agent.js';
import { classifyIntent } from './classifier.js';
import { selectAgent } from './selector.js';

export class IntentRouter {
  constructor(private agents: BaseAgent[]) {}

  async route(input: string): Promise<RoutingResult> {
    const classification = classifyIntent(input);
    const activeAgents = this.agents.filter((a) => a.isActive);
    const agentSelection = selectAgent(activeAgents, input);

    let handlerResponse: string | undefined;
    if (classification.intent === Intent.TASK && agentSelection.agentId) {
      const agent = activeAgents.find((a) => a.id === agentSelection.agentId);
      if (agent) {
        const result = await agent.execute(input);
        handlerResponse = result.result;
      }
    }

    return {
      intent: classification.intent,
      classification,
      agentSelection,
      handlerResponse,
    };
  }
}
