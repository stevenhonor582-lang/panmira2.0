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

  async processPreIntent(payload: Record<string, any> = {}): Promise<EngineOutput> {
    if (!this.config.enabled) {
      return { needsClarification: false, missingFields: [], payload };
    }

    const allGaps: Map<string, import('./types.js').FieldGap> = new Map();
    for (const skill of this.config.applicableSkills) {
      try {
        const gaps = this.validator.check(skill, payload);
        for (const g of gaps) {
          if (!allGaps.has(g.name)) {
            allGaps.set(g.name, g);
          }
        }
      } catch (err) {
        if (err instanceof ClarificationError && err.code === 'SCHEMA_NOT_FOUND') {
          continue;
        }
        throw err;
      }
    }

    const gaps = [...allGaps.values()];
    if (gaps.length === 0) {
      return { needsClarification: false, missingFields: [], payload };
    }

    const questions = this.generator.generate(gaps, this.config.maxQuestionsPerRound);
    return { needsClarification: true, missingFields: gaps, payload, suggestedQuestions: questions };
  }

  private skip(input: EngineInput): EngineOutput {
    return {
      needsClarification: false,
      missingFields: [],
      payload: input.existingPayload || {},
    };
  }
}
