import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

interface SidecarConfig {
  scriptPath: string;
  maxRestarts?: number;
}

const MAX_RESTARTS_DEFAULT = 3;

export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private restartCount = 0;

  constructor(private config: SidecarConfig) {
    super();
  }

  start(): void {
    this.proc = spawn(process.execPath, [this.config.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc.on('exit', (code) => this.handleExit(code));
    this.emit('started');
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }

  isRunning(): boolean {
    return this.proc !== null;
  }

  /** 仅测试用 */
  simulateCrash(): void {
    this.handleExit(1);
  }

  private handleExit(code: number | null): void {
    this.proc = null;
    const max = this.config.maxRestarts ?? MAX_RESTARTS_DEFAULT;
    if (this.restartCount < max) {
      this.restartCount++;
      this.emit('restarting', { attempt: this.restartCount });
      this.start();
    } else {
      this.restartCount = 0;
      this.emit('disabled');
    }
  }
}
