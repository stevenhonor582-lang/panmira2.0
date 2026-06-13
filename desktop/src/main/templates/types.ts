import type { z } from 'zod';
import type { BrowserActions } from '../browser/browser-actions.js';

export type TemplateCategory = 'lead-gen' | 'outreach' | 'analysis' | 'admin';

export interface Template<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  estimatedDurationSec: number;
  params: TParams;
  kbRequired: boolean;
  /**
   * Optional browser interaction. Receives a browser context, returns
   * extracted text to be fed into the prompt.
   */
  browserActions?: (ctx: BrowserActions, params: z.infer<TParams>) => Promise<string>;
  /**
   * Compose the final prompt. Inject browser output and KB context as needed.
   */
  prompt: (
    params: z.infer<TParams>,
    browserOutput: string | undefined,
    kbContext: string | undefined,
  ) => string;
  /** Used by the UI to render the result. */
  outputFormat: 'markdown' | 'markdown-table' | 'json' | 'email-draft';
}

export type AnyTemplate = Template<z.ZodTypeAny>;
