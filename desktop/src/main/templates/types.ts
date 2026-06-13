import type { z } from 'zod';
import type { BrowserActions } from '../browser/browser-actions.js';
import type { SessionId } from '../browser/session-store.js';

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
   * Optional browser interaction. Receives a browser context and a launched
   * session id, returns extracted text to be fed into the prompt.
   */
  browserActions?: (
    ctx: BrowserActions,
    sessionId: SessionId,
    params: z.infer<TParams>,
  ) => Promise<string>;
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

/**
 * Helper that lets builtin templates declare their params schema as a
 * literal object without an explicit generic on `Template<T>`. TypeScript
 * infers the schema type and propagates it through `params`, `browserActions`,
 * and `prompt` so `params` is never `unknown`.
 */
export function defineTemplate<T extends z.ZodTypeAny>(t: {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  estimatedDurationSec: number;
  params: T;
  kbRequired: boolean;
  outputFormat: 'markdown' | 'markdown-table' | 'json' | 'email-draft';
  browserActions?: (
    browser: BrowserActions,
    sessionId: SessionId,
    params: z.infer<T>,
  ) => Promise<string>;
  prompt: (
    params: z.infer<T>,
    browserOutput: string | undefined,
    kbContext: string | undefined,
  ) => string;
}): Template<T> {
  return t as Template<T>;
}
