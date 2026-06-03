import { describe, it, expect } from 'vitest';
import { IntentResolver } from '../../src/bridge/orchestrator/intent-resolver.js';
import type { IntentDefinition } from '../../src/bridge/orchestrator/types.js';

const bugfixIntent: IntentDefinition = {
  name: 'Bug修复',
  triggers: ['bug', '报错', '错误', '崩溃', '修', 'fix', 'error'],
  chain: [],
};

const featureIntent: IntentDefinition = {
  name: '新功能开发',
  triggers: ['新建', '创建', '开发', '实现', '添加', '做一个'],
  chain: [],
};

const reviewIntent: IntentDefinition = {
  name: '代码审查',
  triggers: ['审查', 'review', '检查代码', '看看代码'],
  chain: [],
};

describe('IntentResolver', () => {
  const resolver = new IntentResolver();

  it('returns the only intent when there is one', () => {
    const result = resolver.resolve('随便说点什么', [bugfixIntent]);
    expect(result.name).toBe('Bug修复');
  });

  it('matches bugfix keywords', () => {
    const cases = ['这个功能报错了', '有个bug要修', 'fix the error', '崩溃了'];
    for (const msg of cases) {
      expect(resolver.resolve(msg, [bugfixIntent, featureIntent, reviewIntent]).name).toBe('Bug修复');
    }
  });

  it('matches feature keywords', () => {
    const cases = ['新建一个API', '创建登录页面', '开发邮件功能', '添加导出按钮'];
    for (const msg of cases) {
      expect(resolver.resolve(msg, [bugfixIntent, featureIntent, reviewIntent]).name).toBe('新功能开发');
    }
  });

  it('matches review keywords', () => {
    const cases = ['审查一下这个PR', 'review代码', '检查代码质量', '看看代码'];
    for (const msg of cases) {
      expect(resolver.resolve(msg, [bugfixIntent, featureIntent, reviewIntent]).name).toBe('代码审查');
    }
  });

  it('returns first intent when no keyword matches (default)', () => {
    const result = resolver.resolve('今天天气不错', [bugfixIntent, featureIntent, reviewIntent]);
    expect(result.name).toBe('Bug修复'); // first in list
  });

  it('prioritizes longer keyword matches', () => {
    const intent1: IntentDefinition = {
      name: 'short match',
      triggers: ['修'],
      chain: [],
    };
    const intent2: IntentDefinition = {
      name: 'long match',
      triggers: ['修复'],
      chain: [],
    };
    const result = resolver.resolve('帮我修复一下', [intent1, intent2]);
    expect(result.name).toBe('long match');
  });

  it('throws when intents array is empty', () => {
    expect(() => resolver.resolve('hello', [])).toThrow('No intents defined');
  });
});
