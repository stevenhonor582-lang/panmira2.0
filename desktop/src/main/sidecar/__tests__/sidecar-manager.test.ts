import { describe, it, expect, vi } from 'vitest';
import { SidecarManager } from '../sidecar-manager';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn()
  })),
  default: {
    spawn: vi.fn(() => ({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn()
    }))
  }
}));

describe('SidecarManager', () => {
  it('spawns the sidecar process on start', () => {
    const mgr = new SidecarManager({ scriptPath: '/tmp/sidecar.js' });
    mgr.start();
    expect(mgr.isRunning()).toBe(true);
  });

  it('respawns on crash up to 3 times', () => {
    const mgr = new SidecarManager({ scriptPath: '/tmp/sidecar.js' });
    mgr.start();
    mgr.simulateCrash();
    mgr.simulateCrash();
    mgr.simulateCrash();
    mgr.simulateCrash(); // 4th
    expect(mgr.isRunning()).toBe(false);
  });
});
