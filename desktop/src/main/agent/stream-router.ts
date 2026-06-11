import { EventEmitter } from 'node:events';
import type { AgentName, StepStatus } from '../../shared/agent-types.js';

type StreamEvent =
  | { type: 'agent_step'; agent: AgentName; status: StepStatus; message?: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class StreamRouter extends EventEmitter {
  handleMessage(raw: string): void {
    let event: StreamEvent;
    try {
      event = JSON.parse(raw);
    } catch (err) {
      this.emit('error', new Error(`Failed to parse stream message: ${(err as Error).message}`));
      return;
    }
    switch (event.type) {
      case 'agent_step':
        this.emit('step', { agent: event.agent, status: event.status, message: event.message });
        break;
      case 'content_delta':
        this.emit('content', event.delta);
        break;
      case 'done':
        this.emit('done');
        break;
      case 'error':
        this.emit('error', new Error(event.message));
        break;
    }
  }
}
