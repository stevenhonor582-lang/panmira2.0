import type { TemplateRegistry } from './template-registry.js';
import type { TemplateRunner } from './template-runner.js';
import type { TemplateSummary, TemplateRunParams, TemplateRunResult } from '../../shared/ipc-contract.js';

export interface TemplateHandlersDeps {
  registry: Pick<TemplateRegistry, 'list'>;
  runner: Pick<TemplateRunner, 'run'>;
}

export interface TemplateRunResultWithOutput extends TemplateRunResult {
  output: string;
}

export function createTemplateHandlers(deps: TemplateHandlersDeps) {
  return {
    'templates:list': (): TemplateSummary[] => deps.registry.list(),
    'templates:run': (args: TemplateRunParams): Promise<TemplateRunResultWithOutput> => deps.runner.run(args),
  };
}
