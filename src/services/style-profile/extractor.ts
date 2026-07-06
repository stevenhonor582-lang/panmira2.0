// extractor.ts — LLM-based feature extraction via MiniMax chat completion
// Output: 8-dim style slots + topic_tags + reader_tags

import { proxyFetch } from '../../utils/http.js';
import type { FetcherResult, StyleProfile } from './types.js';
import { parseAndNormalize } from './extractor-parse.js';

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';

const SYSTEM_PROMPT = `You are a precise writing style analyzer for engineering/B2B articles.

Given an article's structure (title, headings, paragraphs, CTAs), extract a JSON style profile with EXACTLY these 8 dimensions:

1. title_formula — pattern, e.g., "X vs Y: Choosing the Right Z"
2. opening_pattern — first 100-word opening style
3. body_structure — section organization pattern
4. voice_tone — e.g., "engineer-to-engineer, data-driven, confident"
5. pronoun_usage — e.g., "you-dominant + occasional we"
6. paragraph_rhythm — e.g., "3-5 sentences per paragraph (60-100 words)"
7. cta_strategy — closing CTA pattern
8. link_strategy — internal/external link approach

Also produce:
- topic_tags: 3-5 lowercase keywords (e.g., ["3d_printing", "process_comparison", "mjf", "fdm"])
- reader_tags: 2-4 lowercase persona keywords (e.g., ["engineer", "procurement_manager"])
- name: a short human-readable label (max 80 chars), e.g., "Protolabs MJF vs FDM"

Output STRICT JSON only. No markdown fences, no prose commentary, no explanation.`;

export async function extractProfile(
  apiKey: string,
  fetched: FetcherResult,
  model = 'MiniMax-Text-01',
): Promise<StyleProfile> {
  const userPrompt = `# Article URL
${fetched.url}

# Title
${fetched.title}

# H1 (${fetched.h1List.length})
${fetched.h1List.join('\n')}

# H2 (${fetched.h2List.length})
${fetched.h2List.join('\n')}

# H3 (${fetched.h3List.length})
${fetched.h3List.join('\n')}

# Word count: ${fetched.wordCount}

# First 5 paragraphs (opening)
${fetched.paragraphs.slice(0, 5).join('\n\n')}

# Last 5 paragraphs (CTA region)
${fetched.paragraphs.slice(-5).join('\n\n')}

Extract the style profile as JSON now.`;

  const res = await proxyFetch(`${MINIMAX_BASE_URL}/text/chatcompletion_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax extraction failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`MiniMax returned no content: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return parseAndNormalize(content, fetched);
}