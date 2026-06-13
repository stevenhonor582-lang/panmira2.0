import type { AnyTemplate, TemplateSummary } from '../../shared/ipc-contract.js';
import type { Template } from './types.js';

export class TemplateRegistry {
  private templates = new Map<string, AnyTemplate>();

  register(templates: AnyTemplate[]): void {
    for (const t of templates) {
      this.templates.set(t.id, t);
    }
  }

  get(id: string): AnyTemplate | undefined {
    return this.templates.get(id);
  }

  list(): TemplateSummary[] {
    return Array.from(this.templates.values()).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      estimatedDurationSec: t.estimatedDurationSec,
    }));
  }
}
