import type { TemplateRegistry } from './template-registry.js';
import type { Retriever } from '../kb-search/retriever.js';
import type { BrowserActions } from '../browser/browser-actions.js';
import type { TemplateRunParams, TemplateRunResult } from '../../shared/ipc-contract.js';

export interface TemplateRunnerDeps {
  registry: Pick<TemplateRegistry, 'get'>;
  retriever: Pick<Retriever, 'retrieve'>;
  browser: BrowserActions;
  streamAgent: (prompt: string) => Promise<string>;
}

export class TemplateRunner {
  constructor(private deps: TemplateRunnerDeps) {}

  async run(args: TemplateRunParams): Promise<TemplateRunResult & { output: string }> {
    const tpl = this.deps.registry.get(args.templateId);
    if (!tpl) throw new Error(`Unknown template: ${args.templateId}`);

    // 1. Validate params
    const parsed = tpl.params.parse(args.params);

    // 2. Optional KB retrieval
    let kbContext: string | undefined;
    if (tpl.kbRequired) {
      const chunks = await this.deps.retriever.retrieve({
        query: JSON.stringify(parsed).slice(0, 500),
        topK: 5,
      });
      if (chunks.length > 0) {
        kbContext = chunks
          .map((c) => `[doc: ${c.docName}, p.${c.position}] ${c.text}`)
          .join('\n\n');
      }
    }

    // 3. Optional browser actions
    let browserOutput: string | undefined;
    if (tpl.browserActions) {
      browserOutput = await tpl.browserActions(this.deps.browser, parsed);
    }

    // 4. Compose prompt
    const prompt = tpl.prompt(parsed, browserOutput, kbContext);

    // 5. Stream via agent
    const output = await this.deps.streamAgent(prompt);

    return {
      taskId: `task-${Date.now()}`,
      outputFormat: tpl.outputFormat,
      output,
    };
  }
}
