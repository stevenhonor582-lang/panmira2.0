import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

interface WsConfig {
  url: string;
  token: string;
  maxBackoffMs?: number;
}

const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 30000];

type IncomingEvent =
  | { type: 'agent_step'; agent: string; status: string; message?: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'bus_event'; topic: string; payload: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class WsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private backoffIndex = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private _connected = false;

  constructor(private readonly config: WsConfig) {
    super();
  }

  async connect(): Promise<void> {
    const url = `${this.config.url}?token=${encodeURIComponent(this.config.token)}`;
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this._connected = true;
      this.backoffIndex = 0;
      this.emit('open');
    });
    this.ws.on('message', (data) => this.routeMessage(data.toString()));
    this.ws.on('close', () => this.handleDisconnect());
    this.ws.on('error', (err) => this.emit('error', err));
  }

  send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WS not connected');
    }
    this.ws.send(JSON.stringify(payload));
  }

  isConnected(): boolean {
    return this._connected;
  }

  close(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  /** 仅测试用 */
  simulateDisconnect(): void {
    this.handleDisconnect();
  }

  /** 仅测试用 */
  simulateMessage(raw: string): void {
    this.routeMessage(raw);
  }

  private routeMessage(raw: string): void {
    let event: IncomingEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      this.emit('error', new Error(`Bad WSS message: ${raw.slice(0, 100)}`));
      return;
    }
    this.emit(event.type, event);
    if (event.type === 'bus_event') {
      this.emit(`bus:${event.topic}`, event.payload);
    }
  }

  private handleDisconnect(): void {
    this._connected = false;
    this.emit('disconnect');
    const delay = BACKOFF_STEPS[Math.min(this.backoffIndex, BACKOFF_STEPS.length - 1)];
    this.backoffIndex++;
    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnect');
      this.connect().catch((err) => this.emit('error', err));
    }, delay);
  }
}
