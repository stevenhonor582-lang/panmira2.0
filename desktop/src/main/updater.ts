import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { EventEmitter } from 'node:events';

export class UpdateChecker extends EventEmitter {
  constructor(private config: { feedUrl: string }) {
    super();
    autoUpdater.setFeedURL({ provider: 'generic', url: config.feedUrl });
    autoUpdater.on('update-available', (info: UpdateInfo) => this.emit('update-available', info));
    autoUpdater.on('update-downloaded', () => this.emit('update-downloaded'));
    autoUpdater.on('error', (err) => this.emit('error', err));
  }

  async check(): Promise<void> {
    await autoUpdater.checkForUpdates();
  }

  install(): void {
    autoUpdater.quitAndInstall();
  }

  /** 仅测试用 */
  simulateUpdate(info: { version: string }): void {
    this.emit('update-available', info);
  }
}
