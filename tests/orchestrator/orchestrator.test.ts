import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../src/orchestrator/orchestrator.js';

describe('Orchestrator.identifyScene', () => {
  it('user explicit /数据 → data', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('随便', '/数据')).toBe('data');
  });

  it('user explicit /开发 → development', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('随便', '/开发')).toBe('development');
  });

  it('user explicit /内容 → content', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('随便', '/内容')).toBe('content');
  });

  it('keyword "GA4" → data', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('分析 GA4 数据')).toBe('data');
  });

  it('keyword "代码" → development', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('重构代码')).toBe('development');
  });

  it('keyword "选题" → content', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('今天做什么选题')).toBe('content');
  });

  it('unknown text → unknown', () => {
    const orch = new Orchestrator({});
    expect(orch.identifyScene('随便聊聊')).toBe('unknown');
  });
});
