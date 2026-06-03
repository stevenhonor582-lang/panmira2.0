import { ClarificationError } from './errors.js';
import { QuestionGenerator } from './question-generator.js';
import { SchemaValidator } from './schema-validator.js';
import type {
  ClarificationConfig, EngineInput, EngineOutput,
} from './types.js';

export class ClarificationEngine {
  constructor(
    private validator: SchemaValidator,
    private generator: QuestionGenerator,
    private config: ClarificationConfig,
  ) {}

  async process(input: EngineInput): Promise<EngineOutput> {
    if (!this.config.enabled) {
      return this.skip(input);
    }

    if (!this.config.applicableSkills.includes(input.targetSkill)) {
      return this.skip(input);
    }

    let gaps;
    try {
      gaps = this.validator.check(input.targetSkill, input.existingPayload || {});
    } catch (err) {
      if (err instanceof ClarificationError && err.code === 'SCHEMA_NOT_FOUND') {
        return this.skip(input);
      }
      throw err;
    }

    if (gaps.length === 0) {
      return {
        needsClarification: false,
        missingFields: [],
        payload: input.existingPayload || {},
      };
    }

    const payload = input.existingPayload || {};
    const questions = this.generator.generate(gaps, this.config.maxQuestionsPerRound);

    return {
      needsClarification: true,
      missingFields: gaps,
      payload,
      suggestedQuestions: questions,
    };
  }

  private skip(input: EngineInput): EngineOutput {
    return {
      needsClarification: false,
      missingFields: [],
      payload: input.existingPayload || {},
    };
  }
}
