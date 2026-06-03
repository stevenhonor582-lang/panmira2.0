import type { IntentDefinition } from './types.js';

export class IntentResolver {
  resolve(userMessage: string, intents: IntentDefinition[]): IntentDefinition {
    if (intents.length === 0) {
      throw new Error('No intents defined in orchestration config');
    }
    if (intents.length === 1) {
      return intents[0];
    }

    const msgLower = userMessage.toLowerCase();
    const scored = intents.map((intent) => {
      let score = 0;
      for (const trigger of intent.triggers) {
        if (msgLower.includes(trigger.toLowerCase())) {
          score += trigger.length;
        }
      }
      return { intent, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      return scored[0].intent;
    }

    return intents[0];
  }
}
