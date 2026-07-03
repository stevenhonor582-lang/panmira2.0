import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncTurn, flushOutbox } from '../nextcrm-sync.js';
import { pool } from '../../db/index.js';
import type { Logger } from '../../utils/logger.js';

vi.mock('../../db/index.js', () => ({ pool: { query: vi.fn() } }));

const query = vi.mocked(pool.query);
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function makeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

beforeEach(() => {
  query.mockReset();
  fetchMock.mockReset();
});

it('syncTurn writes a pending outbox row (never throws)', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ id: 'sess-1', platform: 'web' }] })
    .mockResolvedValueOnce({ rows: [{ lead_id: 'lead-9' }] })
    .mockResolvedValueOnce({ rows: [] });
  await expect(
    syncTurn({ botName: 'deyi', chatId: 'c1', prompt: 'hi', responseText: 'hello', claudeSessionId: 'cs1', logger: makeLogger() }),
  ).resolves.toBeUndefined();
  const insertCall = query.mock.calls[2][0] as string;
  expect(insertCall).toContain('INSERT INTO nextcrm_sync_outbox');
});

it('flushOutbox POSTs pending rows and marks done on 200', async () => {
  query.mockResolvedValueOnce({
    rows: [{ id: 1, payload: { externalId: 's1', source: 'web', messages: [] }, attempts: 0 }],
  });
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{}') });
  query.mockResolvedValueOnce({ rows: [] });
  process.env.NEXTCRM_URL = 'https://crm.sites.panmira.cn';
  process.env.NEXTCRM_SYNC_TOKEN = 'tok';
  const n = await flushOutbox(makeLogger());
  expect(n).toBe(1);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://crm.sites.panmira.cn/api/conversations/sync',
    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'tok' }) }),
  );
});

it('flushOutbox does not throw when fetch fails', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 2, payload: {}, attempts: 0 }] });
  fetchMock.mockRejectedValueOnce(new Error('network'));
  query.mockResolvedValueOnce({ rows: [] });
  process.env.NEXTCRM_URL = 'https://crm.sites.panmira.cn';
  process.env.NEXTCRM_SYNC_TOKEN = 'tok';
  await expect(flushOutbox(makeLogger())).resolves.toBe(0);
});
