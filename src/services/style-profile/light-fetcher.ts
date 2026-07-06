// light-fetcher.ts — lightweight page probe for D3 scoring
// Extracts ONLY: h2 count, paragraph count, word count (no LLM, no full structure)
// Designed to run in parallel for SERP top 10

import { chromium, type Browser } from 'playwright';

const CHROMIUM_PATHS = ['/snap/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  const fs = await import('node:fs/promises');
  let exe = CHROMIUM_PATHS[0];
  for (const p of CHROMIUM_PATHS) {
    try {
      await fs.access(p);
      exe = p;
      break;
    } catch {
      /* keep looking */
    }
  }
  _browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}

export interface LightProbe {
  url: string;
  ok: boolean;
  h2Count: number;
  paragraphCount: number;
  wordCount: number;
  error?: string;
}

export async function lightFetch(url: string, timeoutMs = 20000): Promise<LightProbe> {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(400);

    const result = (await page.evaluate(`(() => {
      const h2Count = document.querySelectorAll('h2').length;
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => (p.textContent || '').trim())
        .filter(p => p.length > 30);
      const wordCount = paragraphs.join(' ').split(/\\s+/).filter(Boolean).length;
      return { h2Count, paragraphCount: paragraphs.length, wordCount };
    })()`)) as { h2Count: number; paragraphCount: number; wordCount: number };

    await page.close();
    return { url, ok: true, ...result };
  } catch (e) {
    return { url, ok: false, h2Count: 0, paragraphCount: 0, wordCount: 0, error: (e as Error).message.slice(0, 200) };
  }
}

export async function lightFetchAll(urls: string[], concurrency = 5): Promise<LightProbe[]> {
  const results: LightProbe[] = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const myIdx = i++;
      const url = urls[myIdx];
      results[myIdx] = await lightFetch(url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export async function closeLightBrowser(): Promise<void> {
  if (_browser && _browser.isConnected()) {
    await _browser.close();
    _browser = null;
  }
}