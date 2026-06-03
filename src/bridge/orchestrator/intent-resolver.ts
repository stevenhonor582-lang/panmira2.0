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

/**
 * Match user message against intent triggers.
 * Returns null when no trigger matches — unlike IntentResolver.resolve()
 * which always falls back to intents[0].
 * Used by the orchestrator pre-check in message-bridge.ts.
 */
export function matchIntent(
  userMessage: string,
  intents: IntentDefinition[],
): IntentDefinition | null {
  if (intents.length === 0) return null;
  if (intents.length === 1) {
    const only = intents[0];
    if (only.triggers.length === 0) return only; // no triggers = match-all
    const msgLower = userMessage.toLowerCase();
    for (const trigger of only.triggers) {
      if (msgLower.includes(trigger.toLowerCase())) return only;
    }
    return null;
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

  if (scored[0].score > 0) return scored[0].intent;
  return null;
}
