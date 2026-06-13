import { describe, it, expect, vi } from 'vitest';
import { createKbSearchHandlers } from '../ipc.js';

describe('kbSearch IPC handlers', () => {
  it('retrieve handler calls Retriever and returns chunks', async () => {
    const retriever = { retrieve: vi.fn().mockResolvedValue([{ docId: 'd1', docName: 'x.pdf', position: 0, text: 'hi', score: 0.9 }]) };
    const handlers = createKbSearchHandlers({ retriever });
    const handler = handlers['kb-search:retrieve'];
    const result = await handler({ query: 'q', topK: 3 });
    expect(result).toEqual([{ docId: 'd1', docName: 'x.pdf', position: 0, text: 'hi', score: 0.9 }]);
    expect(retriever.retrieve).toHaveBeenCalledWith({ query: 'q', topK: 3 });
  });
});
