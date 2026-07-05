import type { AgentRuntimeConfig, GateRule } from './types.js';

interface StepContextInput {
  agentConfig: AgentRuntimeConfig;
  step: { step: string; prompt: string; gates?: GateRule[] };
  skillContent: string;
  previousOutput: string;
  userMessage: string;
  knowledgeContext?: string;
}

const REFERENCE_SECTIONS = ['铁律', '止损', '反模式', '安全', '验证铁律', '部署纪律', '完成标准'];
const MAX_REFERENCE_CHARS = 800;

export class ContextBuilder {
  build(input: StepContextInput): string {
    const parts: string[] = [];

    // 身份
    const identityLine =
      input.agentConfig.systemPrompt.split('\n').find((l) => l.startsWith('>')) ||
      input.agentConfig.systemPrompt.slice(0, 200);
    parts.push(`## 身份\n${identityLine}`);

    // 铁律
    if (input.agentConfig.ironLaws.length > 0) {
      const laws = input.agentConfig.ironLaws.map((l, i) => `${i + 1}. ${l}`).join('\n');
      parts.push(`## 铁律（不可违反）\n${laws}`);
    }

    // 行为边界
    if (input.agentConfig.boundary.cannot.length > 0 || input.agentConfig.boundary.can.length > 0) {
      const lines: string[] = [];
      for (const c of input.agentConfig.boundary.can) lines.push(`- 可以: ${c}`);
      for (const c of input.agentConfig.boundary.cannot) lines.push(`- 禁止: ${c}`);
      if (lines.length > 0) parts.push(`## 行为边界\n${lines.join('\n')}`);
    }

    // 执行规范 — extracted from system_prompt reference sections
    const referenceBlock = this.extractReferenceRules(input.agentConfig.systemPrompt);
    if (referenceBlock) {
      parts.push(`## 执行规范\n${referenceBlock}`);
    }

    // 当前任务
    const rendered = input.step.prompt.replace('{previous_output}', input.previousOutput);
    parts.push(`## 当前任务\n${rendered}`);

    // 上一步产出
    if (input.previousOutput && !input.step.prompt.includes('{previous_output}')) {
      parts.push(`## 上一步产出\n${input.previousOutput.slice(0, 500)}`);
    }

    // 参考技能全文
    if (input.skillContent) {
      parts.push(`## 参考技能\n${input.skillContent}`);
    }

    // 相关知识（从 MetaMemory 检索）
    if (input.knowledgeContext) {
      parts.push(`## 相关知识\n${input.knowledgeContext}`);
    }

    // 验证要求
    if (input.step.gates && input.step.gates.length > 0) {
      const gateDescs = input.step.gates
        .map((g) => {
          switch (g.type) {
            case 'test_pass':
              return '- 所有测试必须通过（npm test 退出码 = 0）';
            case 'coverage':
              return `- 测试覆盖率必须 >= ${g.threshold || 80}%`;
            case 'lint_pass':
              return '- Lint 检查必须通过';
            case 'typecheck_pass':
              return '- TypeScript 类型检查必须通过';
            case 'docker_build_pass':
              return '- Docker 镜像构建必须成功';
            case 'health_check':
              return `- 健康检查 ${g.endpoint} 必须返回 ${g.expect || 200}`;
            case 'rollback_available':
              return '- 必须确认回滚版本已保留';
            case 'requirement_verify':
              return '- 产出必须满足原始需求目标';
            default:
              return '';
          }
        })
        .filter(Boolean)
        .join('\n');
      parts.push(`## 验证要求\n完成后代码会自动验证以下条件，不通过将重试：\n${gateDescs}`);
    }

    return parts.join('\n\n');
  }

  /** Extract and compress reference sections from the full system_prompt. */
  private extractReferenceRules(systemPrompt: string): string {
    if (!systemPrompt) return '';

    const extracted: string[] = [];
    for (const sectionName of REFERENCE_SECTIONS) {
      const block = this.extractSection(systemPrompt, sectionName);
      if (block) extracted.push(block);
    }

    if (extracted.length === 0) return '';

    // Compress to fit within max chars, trimming from last section if needed
    let result = extracted.join('\n\n');
    if (result.length > MAX_REFERENCE_CHARS) {
      const truncated = result.slice(0, MAX_REFERENCE_CHARS);
      // Truncate at paragraph boundary (double newline) to avoid cutting rules mid-way
      const lastParagraph = truncated.lastIndexOf('\n\n');
      if (lastParagraph > MAX_REFERENCE_CHARS * 0.5) {
        result = truncated.slice(0, lastParagraph);
      } else {
        const lastNewline = truncated.lastIndexOf('\n');
        if (lastNewline > 0) result = truncated.slice(0, lastNewline);
      }
    }

    return result;
  }

  /** Extract a markdown section by heading name. */
  private extractSection(text: string, headingName: string): string | null {
    // Match "## headingName" or "## headingName（...）" style headings
    const headingRegex = new RegExp(`^##\\s+${headingName}[^\\n]*\\n`, 'm');
    const match = text.match(headingRegex);
    if (!match || match.index === undefined) return null;

    const startIdx = match.index;
    const afterHeading = startIdx + match[0].length;

    // Find next ## heading or end of text
    const nextHeadingMatch = text.slice(afterHeading).match(/^##\s+/m);
    const endIdx = nextHeadingMatch
      ? afterHeading + (nextHeadingMatch.index ?? 0)
      : text.length;

    const sectionContent = text.slice(afterHeading, endIdx).trim();
    if (!sectionContent) return null;

    // Compress: strip code blocks longer than 10 lines, truncate long lines
    const compressed = sectionContent
      .replace(/```[\s\S]*?```/g, (codeBlock) => {
        const lines = codeBlock.split('\n');
        if (lines.length > 12) {
          return lines.slice(0, 2).join('\n') + '\n...(省略)...\n' + lines.slice(-2).join('\n');
        }
        return codeBlock;
      })
      .split('\n')
      .map((line) => (line.length > 200 ? line.slice(0, 197) + '...' : line))
      .join('\n');

    return `### ${headingName}\n${compressed}`;
  }
}
