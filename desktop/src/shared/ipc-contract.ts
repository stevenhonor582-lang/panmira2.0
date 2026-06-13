// Shared TypeScript types for IPC bridges.
// Imported by both main (implementations) and renderer (consumers via preload).

import type { Template } from '../main/templates/types.js';
export type ViewportId = string;
export type TaskId = string;

export interface BrowserOpenResult {
  viewportId: ViewportId;
}

export interface BrowserApi {
  open(taskId: TaskId, url: string): Promise<BrowserOpenResult>;
  screenshot(viewportId: ViewportId): Promise<string>; // base64 PNG
  click(viewportId: ViewportId, selector: string): Promise<void>;
  fill(viewportId: ViewportId, selector: string, text: string): Promise<void>;
  extract(viewportId: ViewportId, selector: string): Promise<string>;
  close(viewportId: ViewportId): Promise<void>;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: 'lead-gen' | 'outreach' | 'analysis' | 'admin';
  estimatedDurationSec: number;
}

export interface TemplateRunParams {
  templateId: string;
  params: Record<string, unknown>;
}

export interface TemplateRunResult {
  taskId: TaskId;
  outputFormat: string;
}

export interface TemplatesApi {
  run(args: TemplateRunParams): Promise<TemplateRunResult>;
  list(): Promise<TemplateSummary[]>;
}

export interface KbChunk {
  docId: string;
  docName: string;
  position: number;
  text: string;
  score: number;
}

export interface KbRetrieveArgs {
  query: string;
  topK?: number;
}

export interface KbSearchApi {
  retrieve(args: KbRetrieveArgs): Promise<KbChunk[]>;
}

// Aggregated window.api shape (used in renderer via global declaration).
export interface PanmiraApi {
  browser: BrowserApi;
  templates: TemplatesApi;
  kbSearch: KbSearchApi;
}

declare global {
  interface Window {
    api: PanmiraApi;
  }
}

// Loose alias for cross-module type imports (the main template registry
// stores templates of any param shape; consumers index by id).
export type AnyTemplate = Template<any>;
