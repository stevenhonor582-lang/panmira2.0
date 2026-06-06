/**
 * RequirementAnalyzer — STUB (disabled 2026-06-06)
 * Original implementation removed due to latency / UX / notification issues.
 * All messages now route directly to intent matching + standard LLM.
 */

export interface RequirementAnalysis {
  needsClarification: boolean;
  objective: string;
  intentHint: string | null;
  confidence: 'high' | 'medium' | 'low';
  clarifyingQuestions: any[];
  enrichedPayload: Record<string, string>;
  missingInfo: string[];
}

export interface ClarificationContext {
  originalMessage: string;
  history: Array<{ question: string; answer: string }>;
  payload: Record<string, string>;
}
