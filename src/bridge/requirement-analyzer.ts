import type { Logger } from '../utils/logger.js';
import type { Executor } from '../engines/index.js';
import type { Question } from '../clarification/types.js';

/** Structured output from a single requirement analysis pass. */
export interface RequirementAnalysis {
  /** Whether the bot should pause and ask the user clarifying questions. */
  needsClarification: boolean;
  /** The user's objective in one sentence (extracted or inferred). */
  objective: string;
  /** Suggested intent name for chain matching (null if unclear). */
  intentHint: string | null;
  /** Confidence in the intent hint: 'high' | 'medium' | 'low'. */
  confidence: 'high' | 'medium' | 'low';
  /** Clarifying questions to ask the user (max 3). */
  clarifyingQuestions: Question[];
  /** Concrete parameters already extracted from the message. */
  enrichedPayload: Record<string, string>;
  /** What the analyzer still doesn't understand. */
  missingInfo: string[];
}

/** Context accumulated across clarification rounds. */
export interface ClarificationContext {
  /** The original user message. */
  originalMessage: string;
  /** Previous Q&A pairs from clarification rounds. */
  history: Array<{ question: string; answer: string }>;
  /** Accumulated extracted parameters. */
  payload: Record<string, string>;
}

const ANALYSIS_PROMPT = `你是一个需求分析师。你的默认立场是：**能行动就不问**。只有真正卡住时才生成引导性问题。

## 核心铁律（CRITICAL）

1. **默认不提问**。只要用户意图大致可判断，就设 needsClarification: false，让执行层去处理细节
2. **只有卡住才问**。仅当完全不知道用户要做什么、或在两个完全矛盾的方向间无法抉择时才问
3. **一次最多 2 个问题**。优先只问 1 个最关键的问题
4. **选择题优先**。提供 2-4 个选项让用户一键选择
5. 不要问泛问题（"还有什么要补充的吗"），不要问执行层自己能解决的事（文件路径、具体实现方式）

## 判断标准（严格版）

- 用户消息是闲聊/打招呼/感谢/确认 → needsClarification: false, confidence: "high"
- 用户需求明确或大致可判断 → needsClarification: false（即使缺少细节，让执行层自己处理）
- 用户需求有微小歧义但上下文可推断 → needsClarification: false
- 用户消息包含两个矛盾方向且无法判断优先级 → needsClarification: true, 1个选择题
- 用户消息完全无法理解意图 → needsClarification: true, 1-2个聚焦问题

## 真正的"卡住"场景（才需要问）

- 用户说"修一下"但没有上下文、没有 session、不知道修什么
- 用户说"帮我部署"但没说部署哪个项目
- 用户的消息有 2 个截然不同的解读方向

## 不需要问的场景（直接放行）

- "帮我修个 bug"→ 有目标，执行层会自己找 bug、自己修
- "加个功能"→ 有方向，执行层会追问细节
- "优化性能"→ 有目标，执行层会自己分析瓶颈
- "帮我部署"→ 意图明确，执行层会确认部署目标

## 续接模式（CRITICAL）

当用户消息上方有"## 会话上下文"或"## 对话历史（之前已澄清的内容）"区块时：
- 用户正在**延续之前的对话或任务**，不是开启新任务
- "检查"、"继续"、"修一下"、"排查"、"看一下"、单个词 → 指向上下文中的任务
- **绝不**问"你要做什么"、"你想执行什么任务"这类问题
- **绝不**问上下文已经明确的信息（如对话历史中已经回答过的问题）
- needsClarification: false, confidence: "high"，让系统继续执行

## 多轮澄清终止规则（CRITICAL）

当"对话历史（之前已澄清的内容）"中包含 2 轮或以上的 Q&A 时：
- 用户已经历多轮澄清，**必须停止提问**
- 即使用户回答仍然不完美，也让执行层自己去处理
- needsClarification: false, confidence: "high"
- 不要再分析需求，直接放行

## 输出格式

严格输出 JSON，不要包含其他内容：
{
  "needsClarification": true/false,
  "objective": "一句话总结用户目标",
  "intentHint": "建议的意图名称或null",
  "confidence": "high/medium/low",
  "clarifyingQuestions": [
    {"fieldName": "字段名", "text": "问题文本", "kind": "button/free_text", "options": [{"label": "选项", "value": "值"}]}
  ],
  "enrichedPayload": {"已提取的字段": "值"},
  "missingInfo": ["还不清楚的点"]
}

JSON:`;

/**
 * LLM-powered requirement analyzer.
 * Runs BEFORE intent matching to understand what the user actually wants.
 * Injects Superpowers questioning frameworks for guided clarification.
 */
export class RequirementAnalyzer {
  /** Cached Superpowers questioning framework content. */
  private frameworkContent: string | null = null;

  constructor(
    private logger: Logger,
    private skillLoader: { load(name: string): string },
  ) {}

  /**
   * Analyze a user message. If prior clarification context exists,
   * pass it so the analyzer can build on previous answers.
   */
  async analyze(
    userMessage: string,
    executor: Executor,
    cwd: string,
    abortController: AbortController,
    model: string,
    priorContext?: ClarificationContext,
    ironLaws?: string[],
    boundaryCan?: string[],
    boundaryCannot?: string[],
    sessionContext?: string,
  ): Promise<RequirementAnalysis> {
    // Only include essential context for intent understanding (NOT execution rules)
    // Iron laws, boundaries, and frameworks are execution concerns — irrelevant here
    const contextBlock = priorContext
      ? this.buildContextBlock(priorContext)
      : '';

    const sessionBlock = sessionContext
      ? `## 会话状态
${sessionContext.slice(0, 300)}

`
      : '';

    const prompt = `${sessionBlock}${contextBlock}用户消息: ${userMessage}

${ANALYSIS_PROMPT}`;

    this.logger.debug({ msgLen: userMessage.length, hasContext: !!priorContext }, 'RequirementAnalyzer: starting analysis');

    try {
      const handle = executor.startExecution({
        prompt,
        cwd,
        sessionId: undefined,
        abortController,
        outputsDir: '',
        model,
      });

      let responseText = '';
      try {
        for await (const msg of handle.stream) {
          if (abortController.signal.aborted) break;
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                responseText = block.text;
              }
            }
          }
          if (msg.type === 'stream_event' && msg.event?.type === 'content_block_delta') {
            const delta = msg.event.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              responseText += delta.text;
            }
          }
          if (msg.type === 'result') break;
        }
      } finally {
        try { handle.finish(); } catch {}
      }

      if (!responseText) {
        this.logger.warn('RequirementAnalyzer: empty response, falling through');
        return this.passThrough(userMessage);
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn({ preview: responseText.slice(0, 200) }, 'RequirementAnalyzer: no JSON found');
        return this.passThrough(userMessage);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      const questions: Question[] = (parsed.clarifyingQuestions || []).map((q: any) => ({
        fieldName: String(q.fieldName || ''),
        text: String(q.text || ''),
        kind: (q.kind === 'button' ? 'button' : 'free_text') as 'button' | 'free_text',
        options: q.options?.map((o: any) => ({
          label: String(o.label || ''),
          value: String(o.value || ''),
        })),
      }));

      const result: RequirementAnalysis = {
        needsClarification: parsed.needsClarification === true && questions.length > 0,
        objective: String(parsed.objective || userMessage.slice(0, 100)),
        intentHint: parsed.intentHint || null,
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
        clarifyingQuestions: questions,
        enrichedPayload: parsed.enrichedPayload || {},
        missingInfo: parsed.missingInfo || [],
      };

      this.logger.info({
        needsClarification: result.needsClarification,
        intentHint: result.intentHint,
        confidence: result.confidence,
        questionCount: result.clarifyingQuestions.length,
      }, 'RequirementAnalyzer: analysis complete');

      return result;
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'RequirementAnalyzer: call failed, passing through');
      return this.passThrough(userMessage);
    }
  }

  /** Load and cache the Superpowers questioning framework. */
  private getFramework(): string {
    if (this.frameworkContent) return this.frameworkContent;

    const parts: string[] = [];
    const skills = ['superpowers:brainstorming'];

    for (const name of skills) {
      try {
        const content = this.skillLoader.load(name);
        if (content && !content.startsWith('[技能 ')) {
          // Extract only the questioning-relevant sections
          const lines = content.split('\n');
          let inRelevant = false;
          const extracted: string[] = [];
          for (const line of lines) {
            if (line.includes('Ask clarifying questions') ||
                line.includes('Understanding the idea') ||
                line.includes('## Checklist') ||
                line.includes('提问原则') ||
                line.includes('clarifying')) {
              inRelevant = true;
            }
            if (inRelevant && line.startsWith('## ') &&
                !line.includes('clarify') && !line.includes('Understanding') &&
                !line.includes('Checklist')) {
              inRelevant = false;
            }
            if (inRelevant) {
              extracted.push(line);
            }
          }
          if (extracted.length > 0) {
            parts.push(`## 提问框架 (来自 ${name})\n${extracted.join('\n')}`);
          }
        }
      } catch { /* skill not found — skip */ }
    }

    this.frameworkContent = parts.length > 0
      ? parts.join('\n\n') + '\n\n'
      : '';
    return this.frameworkContent;
  }

  private buildContextBlock(ctx: ClarificationContext): string {
    const lines: string[] = [];
    lines.push('## 对话历史（之前已澄清的内容）');
    lines.push(`原始消息: ${ctx.originalMessage}`);
    for (const h of ctx.history) {
      lines.push(`问: ${h.question}`);
      lines.push(`答: ${h.answer}`);
    }
    if (Object.keys(ctx.payload).length > 0) {
      lines.push(`已确认信息: ${JSON.stringify(ctx.payload)}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  private buildRulesBlock(
    ironLaws?: string[],
    boundaryCan?: string[],
    boundaryCannot?: string[],
  ): string {
    const lines: string[] = [];
    if (ironLaws?.length) {
      lines.push('## 铁律（这些规则在分析需求时也要遵守）');
      ironLaws.forEach((l) => lines.push(`- ${l}`));
    }
    if (boundaryCan?.length) {
      lines.push('## 能做');
      boundaryCan.forEach((c) => lines.push(`- ${c}`));
    }
    if (boundaryCannot?.length) {
      lines.push('## 不能做');
      boundaryCannot.forEach((c) => lines.push(`- ${c}`));
    }
    if (lines.length > 0) lines.push('');
    return lines.join('\n');
  }

  /** Fallback: pass through without clarification. */
  private passThrough(userMessage: string): RequirementAnalysis {
    return {
      needsClarification: false,
      objective: userMessage.slice(0, 100),
      intentHint: null,
      confidence: 'medium',
      clarifyingQuestions: [],
      enrichedPayload: {},
      missingInfo: [],
    };
  }
}
