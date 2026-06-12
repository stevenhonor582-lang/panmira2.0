import { describe, it, expect, vi } from 'vitest';
import { UpdateChecker } from '../updater';

vi.mock('electron-updater', () => ({
  autoUpdater: {
    setFeedURL: vi.fn(),
    on: vi.fn(),
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn()
  }
}));

describe('UpdateChecker', () => {
  it('emits update-available event', () => {
    const checker = new UpdateChecker({ feedUrl: 'https://panmira.example.com/updates' });
    const onUpdate = vi.fn();
    checker.on('update-available', onUpdate);
    checker.simulateUpdate({ version: '0.2.0' });
    expect(onUpdate).toHaveBeenCalledWith({ version: '0.2.0' });
  });
});
