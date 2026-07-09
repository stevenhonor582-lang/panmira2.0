import { describe, expect, it } from 'vitest';
import {
  CONTEXT_PRESETS,
  buildModelBindingPatch,
  type ModelBindingProvider,
} from '../apps/web-next/app/(app)/employees/[id]/_components/tab-basics-config.js';

const providerA: ModelBindingProvider = {
  id: 'provider-a',
  name: 'MiniMax 主路由',
  model: 'MiniMax-M3',
  type: 'minimax',
};

const providerB: ModelBindingProvider = {
  id: 'provider-b',
  name: 'GLM 备用',
  model: 'GLM-5.2',
  type: 'glm',
};

describe('R36 tab-basics model binding helpers', () => {
  it('builds a routing-only PATCH when the model is unchanged', () => {
    const patch = buildModelBindingPatch({
      selectedProvider: providerA,
      currentProvider: providerA,
      useModelRouting: false,
      orchestration: {
        autoCompress: { enabled: true, thresholdPct: 80, ratioPct: 50 },
        useModelRouting: true,
      },
    });

    expect(patch).toEqual({
      orchestration: {
        autoCompress: { enabled: true, thresholdPct: 80, ratioPct: 50 },
        useModelRouting: false,
      },
    });
    expect(patch).not.toHaveProperty('default_model');
    expect(patch).not.toHaveProperty('default_engine');
  });

  it('binds provider and routing state in one PATCH when the model changes', () => {
    const patch = buildModelBindingPatch({
      selectedProvider: providerB,
      currentProvider: providerA,
      useModelRouting: false,
      orchestration: { useModelRouting: true },
    });

    expect(patch).toEqual({
      default_engine: 'glm',
      default_model: 'GLM-5.2',
      orchestration: { useModelRouting: false },
    });
  });
});


describe('R36 tab-basics context presets', () => {
  it('offers 512K as a first-class context window preset', () => {
    expect(CONTEXT_PRESETS.map((preset) => preset.value)).toContain(512000);
  });
});
