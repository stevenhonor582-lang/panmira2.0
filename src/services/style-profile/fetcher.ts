// fetcher.ts — URL fetcher using Playwright + Chromium
// Extracts: title, H1/H2/H3, paragraphs, word count, CTA snippets

import { chromium } from 'playwright';
import type { FetcherResult } from './types.js';

const CHROMIUM_PATHS = [
  '/snap/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

async function findChromium(): Promise<string> {
  const fs = await import('node:fs/promises');
  for (const p of CHROMIUM_PATHS) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('No chromium binary found at ' + CHROMIUM_PATHS.join(', '));
}

export async function fetchArticle(url: string): Promise<FetcherResult> {
  const executablePath = await findChromium();
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait briefly for late JS to render content
    await page.waitForTimeout(800);

    const result = await page.evaluate(`(() => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();

      const title = clean(document.title);

      const h1List = Array.from(document.querySelectorAll('h1'))
        .map((h) => clean(h.textContent))
        .filter((s) => s.length > 0);

      const h2List = Array.from(document.querySelectorAll('h2'))
        .map((h) => clean(h.textContent))
        .filter((s) => s.length > 0);

      const h3List = Array.from(document.querySelectorAll('h3'))
        .map((h) => clean(h.textContent))
        .filter((s) => s.length > 0);

      const main =
        document.querySelector('main') ||
        document.querySelector('article') ||
        document.body;

      const paragraphs = Array.from(main.querySelectorAll('p'))
        .map((p) => clean(p.textContent))
        .filter((p) => p.length > 30);

      const fullText = paragraphs.join(' ');
      const wordCount = fullText.split(/\\s+/).filter(Boolean).length;

      const ctaKeywords = /get quote|request|contact|try|book|schedule|download|talk to|call us|learn more/i;
      const ctaSnippets = paragraphs
        .slice(-15)
        .filter((p) => ctaKeywords.test(p))
        .slice(0, 3);

      return { title, h1List, h2List, h3List, paragraphs, wordCount, ctaSnippets };
    })()`) as {
      title: string;
      h1List: string[];
      h2List: string[];
      h3List: string[];
      paragraphs: string[];
      wordCount: number;
      ctaSnippets: string[];
    };

    return { url, ...result };
  } finally {
    await browser.close();
  }
}