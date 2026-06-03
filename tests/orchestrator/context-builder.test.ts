import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/bridge/orchestrator/context-builder.js';
import type { AgentRuntimeConfig } from '../../src/bridge/orchestrator/types.js';

const mockAgentConfig: AgentRuntimeConfig = {
  agentId: 'test-agent-1',
  name: '测试工程师',
  systemPrompt: '> 全栈工程师 — 独立项目开发\n\n## 铁律\n1. 铁律一\n2. 铁律二\n## 其他',
  orchestration: { intents: [] },
  skills: [],
  boundary: {
    can: ['读写文件'],
    cannot: ['修改生产数据库'],
    escalate_when: ['需要合并到 main'],
  },
  ironLaws: ['铁律一', '铁律二'],
  knowledgeFolders: [],
};

describe('ContextBuilder', () => {
  const builder = new ContextBuilder();

  it('includes identity line from system prompt', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'test', prompt: '测试任务' },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 身份');
    expect(result).toContain('全栈工程师');
  });

  it('includes iron laws prominently', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'test', prompt: '测试任务' },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 铁律（不可违反）');
    expect(result).toContain('1. 铁律一');
    expect(result).toContain('2. 铁律二');
  });

  it('includes boundary can/cannot', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'test', prompt: '测试任务' },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 行为边界');
    expect(result).toContain('可以: 读写文件');
    expect(result).toContain('禁止: 修改生产数据库');
  });

  it('includes current task prompt', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'debug', prompt: '分析问题：{user_message}' },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 当前任务');
  });

  it('replaces {previous_output} in prompt', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'fix', prompt: '修复：\n{previous_output}' },
      skillContent: '',
      previousOutput: '[步骤 "debug" 完成]\n根因是空指针',
      userMessage: 'hello',
    });
    expect(result).toContain('根因是空指针');
  });

  it('includes skill content when provided', () => {
    const skillMd = '# Brainstorming Skill\n\n详细的技能说明内容';
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: { step: 'test', prompt: '测试' },
      skillContent: skillMd,
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 参考技能');
    expect(result).toContain(skillMd);
  });

  it('includes gate descriptions', () => {
    const result = builder.build({
      agentConfig: mockAgentConfig,
      step: {
        step: 'verify',
        prompt: '验证',
        gates: [{ type: 'test_pass' }, { type: 'coverage', threshold: 80 }],
      },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    expect(result).toContain('## 验证要求');
    expect(result).toContain('npm test 退出码 = 0');
    expect(result).toContain('覆盖率必须 >= 80%');
  });

  it('handles agent without boundary gracefully', () => {
    const configWithoutBoundary: AgentRuntimeConfig = {
      ...mockAgentConfig,
      boundary: { can: [], cannot: [], escalate_when: [] },
    };
    const result = builder.build({
      agentConfig: configWithoutBoundary,
      step: { step: 'test', prompt: '测试' },
      skillContent: '',
      previousOutput: '',
      userMessage: 'hello',
    });
    // Should not include empty boundary section
    expect(result).not.toContain('## 行为边界');
  });
});
