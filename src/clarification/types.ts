export type FieldType = 'string' | 'number' | 'enum' | 'boolean';

export interface FieldSchema {
  name: string;
  type: FieldType;
  question: string;
  options?: string[];
  required: boolean;
}

export interface FieldGap {
  name: string;
  type: FieldType;
  question: string;
  options?: string[];
  required: boolean;
}

export interface QuestionOption {
  label: string;
  value: string;
}

export type QuestionKind = 'button' | 'free_text';

export interface Question {
  fieldName: string;
  text: string;
  kind: QuestionKind;
  options?: QuestionOption[];
}

export interface EngineInput {
  userId: string;
  botId: string;
  targetSkill: string;
  rawMessage: string;
  existingPayload?: Record<string, any>;
}

export interface EngineOutput {
  needsClarification: boolean;
  missingFields: FieldGap[];
  payload: Record<string, any>;
  suggestedQuestions?: Question[];
}

export interface ClarificationConfig {
  enabled: boolean;
  maxQuestionsPerRound: number;
  sessionTtlHours: number;
  applicableSkills: string[];
  fallbackToLLM: boolean;
}

export type SessionStatus = 'pending' | 'completed' | 'abandoned';

export interface SessionRecord {
  id: number;
  userId: string;
  botId: string;
  targetSkill: string;
  payload: Record<string, any>;
  missingFields: FieldGap[];
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CardCallbackEvent {
  userId: string;
  botId: string;
  actionValue: string;
  actionField: string;
}
