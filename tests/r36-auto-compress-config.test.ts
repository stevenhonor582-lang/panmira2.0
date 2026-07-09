import { describe, expect, it } from 'vitest';
import {
  ContextManager,
  DEFAULT_AUTO_COMPRESS_CONFIG,
  normalizeAutoCompressConfig,
  resolveContextUsageAction,
  summaryCharLimitFromRetainRatio,
} from '../src/bridge/context-manager.js';

describe('R36 auto-compress configurable thresholds', () => {
  it('defaults to warning 50%, compression 70%, retain 50%', () => {
    expect(DEFAULT_AUTO_COMPRESS_CONFIG).toEqual({
      enabled: true,
      warnThreshold: 0.5,
      compressThreshold: 0.7,
      resetThreshold: 0.85,
      retainRatio: 0.5,
    });
  });

  it('normalizes percentages from orchestration.autoCompress and preserves legacy thresholdPct', () => {
    expect(
      normalizeAutoCompressConfig({
        enabled: true,
        warnThresholdPct: 55,
        thresholdPct: 72,
        resetThresholdPct: 88,
        ratioPct: 45,
      }),
    ).toEqual({
      enabled: true,
      warnThreshold: 0.55,
      compressThreshold: 0.72,
      resetThreshold: 0.88,
      retainRatio: 0.45,
    });
  });

  it('returns warn, compress, and reset at configured thresholds', () => {
    const config = normalizeAutoCompressConfig({ warnThresholdPct: 50, thresholdPct: 70, resetThresholdPct: 85, ratioPct: 50 });

    expect(resolveContextUsageAction(49_000, 100_000, config)).toBe('none');
    expect(resolveContextUsageAction(50_000, 100_000, config)).toBe('warn');
    expect(resolveContextUsageAction(70_000, 100_000, config)).toBe('compress');
    expect(resolveContextUsageAction(85_000, 100_000, config)).toBe('reset');
  });



  it('does not treat warning threshold as compression trigger', () => {
    const manager = new ContextManager();
    const config = normalizeAutoCompressConfig({ warnThresholdPct: 50, thresholdPct: 70, resetThresholdPct: 85 });

    expect(manager.shouldCompress(50_000, 100_000, config)).toBe(false);
    expect(manager.shouldCompress(70_000, 100_000, config)).toBe(true);
  });

  it('honors disabled auto-compress config', () => {
    const config = normalizeAutoCompressConfig({ enabled: false, warnThresholdPct: 10, thresholdPct: 20, resetThresholdPct: 30 });

    expect(resolveContextUsageAction(99_000, 100_000, config)).toBe('none');
  });

  it('uses retain ratio to compute summary character budget', () => {
    const config = normalizeAutoCompressConfig({ ratioPct: 25 });

    expect(summaryCharLimitFromRetainRatio(2000, config)).toBe(500);
  });
});
