import { pool } from '../db/index.js';
import { decrypt } from '../db/crypto.js';
import type { Logger } from '../utils/logger.js';

const TAG_PROMPT = `从以下文本中提取3-5个关键词标签。只返回JSON数组，不要其他内容。
例如: ["机器学习", "Python", "模型训练"]`;

const SUMMARIZE_PROMPT = `请用1-2句话总结以下文档的核心内容。只返回总结文本，不要其他内容。`;

// Common Chinese stopwords to filter from tag extraction
const CN_STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '些', '所', '为', '所以', '因为',
  '但是', '然而', '可以', '这个', '那个', '什么', '怎么', '怎样', '如何', '多少',
  '还是', '只是', '已经', '虽然', '如果', '的话', '吧', '吗', '呢', '啊', '哦',
  '嗯', '啦', '呀', '哈', '嘛', '被', '把', '从', '以', '对', '向', '与', '及',
  '或', '等', '其', '中', '而', '且', '但', '却', '则', '又', '能', '将', '更',
  '并', '后', '前', '里', '外', '内', '之', '用', '于', '让', '给', '使', '做',
  '还', '没', '只', '处', '各', '同', '应', '该', '当', '请', '需要', '通过',
  '进行', '使用', '没有', '他们', '我们', '你们', '它们', '什么', '知道', '觉得',
  '可能', '应该', '已经', '因为', '但是', '所以', '如果', '虽然', '并且', '或者',
]);

export class AutoTagger {
  private apiKey: string | null = null;
  private baseUrl = '';
  private model = '';
  private isAnthropic = false;
  private initPromise: Promise<void> | null = null;

  constructor(private logger: Logger) {}

  private async ensureInit(): Promise<void> {
    if (this.apiKey) return;
    if (!this.initPromise) {
      this.initPromise = this.loadConfig();
    }
    await this.initPromise;
  }

  private async loadConfig(): Promise<void> {
    try {
      const { rows } = await pool.query(
        "SELECT api_key_encrypted, base_url, model FROM provider_configs WHERE type = 'LLM' ORDER BY is_default DESC, name LIMIT 1",
      );
      if (rows[0]?.api_key_encrypted) {
        this.apiKey = decrypt(rows[0].api_key_encrypted);
        this.baseUrl = (rows[0].base_url || '').replace(/\/+$/, '');
        this.model = rows[0].model || 'gpt-3.5-turbo';
        this.isAnthropic = /\/anthropic/i.test(this.baseUrl);
        this.logger.info(
          { baseUrl: this.baseUrl, model: this.model, isAnthropic: this.isAnthropic },
          'AutoTagger: loaded LLM provider',
        );
        return;
      }
      this.logger.warn('AutoTagger: no LLM provider configured');
    } catch (err: any) {
      this.logger.error({ err: err.message }, 'AutoTagger: failed to load config');
    }
  }

  async extractTags(title: string, content: string): Promise<string[]> {
    await this.ensureInit();
    if (!this.apiKey) return this.fallbackTags(title, content);

    const text = `${title}\n${content.slice(0, 500)}`;
    try {
      if (this.isAnthropic) {
        return await this.callAnthropic(text, TAG_PROMPT);
      }
      return await this.callOpenAI(text, TAG_PROMPT);
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'AutoTagger: tag extraction failed, using fallback');
      return this.fallbackTags(title, content);
    }
  }

  async summarize(title: string, content: string): Promise<string> {
    await this.ensureInit();
    if (!this.apiKey) return '';

    const text = `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`;
    try {
      if (this.isAnthropic) {
        return await this.callAnthropicSummary(text);
      }
      return await this.callOpenAISummary(text);
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'AutoTagger: summarization failed');
      return '';
    }
  }

  private async callOpenAISummary(text: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SUMMARIZE_PROMPT },
          { role: 'user', content: text },
        ],
        max_tokens: 200,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return '';
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return (data.choices?.[0]?.message?.content || '').trim();
  }

  private async callAnthropicSummary(text: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: `${SUMMARIZE_PROMPT}\n\n${text}` }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return '';
    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    const textContent = data.content?.find((c: any) => c.type === 'text')?.text || '';
    return textContent.trim();
  }

  private fallbackTags(title: string, content: string): string[] {
    const text = `${title} ${content.slice(0, 1000)}`;
    const tags: string[] = [];

    // Chinese terms (2-4 chars), filtered by stopwords and frequency
    const cnMatches = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    const cnFreq = new Map<string, number>();
    for (const w of cnMatches) {
      if (CN_STOPWORDS.has(w)) continue;
      // Weight longer terms higher
      cnFreq.set(w, (cnFreq.get(w) || 0) + w.length);
    }
    const cnSorted = [...cnFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [w] of cnSorted) tags.push(w);

    // English CamelCase terms
    const camelMatches = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g) || [];
    for (const w of camelMatches.slice(0, 2)) tags.push(w);

    // English all-caps acronyms
    const acronymMatches = text.match(/\b[A-Z]{2,6}\b/g) || [];
    for (const w of acronymMatches.slice(0, 2)) {
      if (!tags.includes(w)) tags.push(w);
    }

    return tags.slice(0, 5);
  }

  private async callOpenAI(text: string, systemPrompt: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        max_tokens: 100,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return this.parseTags(data.choices?.[0]?.message?.content);
  }

  private async callAnthropic(text: string, systemPrompt: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 100,
        messages: [{ role: 'user', content: `${systemPrompt}\n\n${text}` }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    const textContent = data.content?.find((c: any) => c.type === 'text')?.text || '';
    return this.parseTags(textContent);
  }

  private parseTags(raw: string): string[] {
    const trimmed = raw?.trim() || '';
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((t: unknown) => typeof t === 'string').slice(0, 5);
    } catch {
      return [];
    }
  }
}
