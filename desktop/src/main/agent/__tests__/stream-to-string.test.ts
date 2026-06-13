import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { streamToString } from '../stream-to-string.js';

describe('streamToString', () => {
  it('collects emitted content chunks into a single string', async () => {
    const router = new EventEmitter();
    const promise = streamToString('the prompt', router);
    router.emit('content', 'hello ');
    router.emit('content', 'world');
    router.emit('done');
    expect(await promise).toBe('hello world');
  });

  it('rejects when the router emits error', async () => {
    const router = new EventEmitter();
    const promise = streamToString('p', router);
    router.emit('error', new Error('boom'));
    await expect(promise).rejects.toThrow('boom');
  });
});
