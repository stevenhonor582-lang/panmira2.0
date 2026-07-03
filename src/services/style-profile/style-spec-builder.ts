// style-spec-builder.ts — 1-line builder for writer skill
// writer skill calls buildStyleSpecForWriting({topic, reader}) and gets:
// - spec: full StyleSpecLite (for log / card)
// - promptFragment: ready-to-inject text (for LLM system_prompt / user_message)

import { compose } from './compositor.js';
import { renderStyleSpec } from './style-spec-renderer.js';
import type { StyleSpecLite } from './style-spec-renderer.js';

export interface BuildOptions {
  topic: string;
  reader: string;
  auxThreshold?: number;
  maxAux?: number;
  pinProfileIds?: string[];
  /** When true, include which profile contributed each slot. Default: false */
  withProvenance?: boolean;
  /** Markdown or plain text. Default: true (markdown) */
  markdown?: boolean;
}

export interface BuildResult {
  spec: StyleSpecLite;
  promptFragment: string;
  summary: string;
}

/** Build StyleSpec + render prompt fragment in one call. */
export async function buildStyleSpecForWriting(opts: BuildOptions): Promise<BuildResult> {
  const fullSpec = await compose({
    topic: opts.topic,
    reader: opts.reader,
    ...(opts.auxThreshold !== undefined ? { auxThreshold: opts.auxThreshold } : {}),
    ...(opts.maxAux !== undefined ? { maxAux: opts.maxAux } : {}),
    ...(opts.pinProfileIds?.length ? { pinProfileIds: opts.pinProfileIds } : {}),
  });

  const spec: StyleSpecLite = {
    topic: fullSpec.topic,
    reader: fullSpec.reader,
    master: fullSpec.master
      ? { id: fullSpec.master.id, name: fullSpec.master.name, sourceUrl: fullSpec.master.sourceUrl }
      : null,
    aux: fullSpec.aux.map((a) => ({ id: a.id, name: a.name, score: a.score })),
    slots: fullSpec.slots,
    slotProvenance: fullSpec.slotProvenance,
    empty: fullSpec.empty,
  };

  const promptFragment = renderStyleSpec(spec, {
    markdown: opts.markdown !== false,
    withProvenance: opts.withProvenance === true,
  });

  const summary = renderSummary(spec);

  return { spec, promptFragment, summary };
}

function renderSummary(spec: StyleSpecLite): string {
  const filled = 8 - spec.empty.length;
  const masterName = spec.master?.name ?? '(no master)';
  return `StyleSpec: master=${masterName}, aux=${spec.aux.length}, filled=${filled}/8`;
}