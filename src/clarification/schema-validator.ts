import { ClarificationError } from './errors.js';
import type { FieldGap, FieldSchema } from './types.js';

export class SchemaValidator {
  constructor(private schemas: Record<string, FieldSchema[]>) {}

  check(skillName: string, payload: Record<string, any>): FieldGap[] {
    const schema = this.schemas[skillName];
    if (!schema) {
      throw new ClarificationError(
        'SCHEMA_NOT_FOUND',
        `[SCHEMA_NOT_FOUND] No schema declared for skill: ${skillName}`,
        true
      );
    }

    return schema
      .filter(field => field.required)
      .filter(field => this.isMissing(payload[field.name]))
      .map(field => ({
        name: field.name,
        type: field.type,
        question: field.question,
        options: field.options,
        required: field.required,
      }));
  }

  private isMissing(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
  }
}
