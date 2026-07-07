import { describe, it, expect, vi } from 'vitest';
import { buildTriggerUrl, triggerPipelineAsync } from '../pipeline-trigger';

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe('buildTriggerUrl (L6 async trigger URL)', () => {
  it('始终带 ?async=true (L6 default)', () => {
    expect(buildTriggerUrl('p1')).toBe('/api/v2/admin/pipelines/p1/trigger?async=true');
  });
  it('UUID pipelineId 也正确编码', () => {
    expect(buildTriggerUrl('abc-123-def')).toBe('/api/v2/admin/pipelines/abc-123-def/trigger?async=true');
  });
});

describe('triggerPipelineAsync (L6 async mode behavior)', () => {
  it('HTTP 202 → kind="accepted" 带 runId + pollUrl', async () => {
    const fetcher = mockFetch(async () => jsonResponse(202, {
      success: true,
      data: { runId: 'run-xyz-789', status: 'pending', pollUrl: '/api/v2/admin/pipelines/p1/runs/run-xyz-789' },
    }));
    const r = await triggerPipelineAsync({ pipelineId: 'p1', triggeredBy: 'user', initialInput: { foo: 'bar' } }, fetcher);
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.runId).toBe('run-xyz-789');
      expect(r.pollUrl).toContain('/runs/run-xyz-789');
    }
  });

  it('HTTP 202 → 发送 POST + body 包含 triggeredBy + initialInput', async () => {
    let captured: { url: string; init: RequestInit | undefined } = { url: '', init: undefined };
    const fetcher = mockFetch(async (url, init) => {
      captured = { url: String(url), init };
      return jsonResponse(202, { success: true, data: { runId: 'r1', status: 'pending' } });
    });
    await triggerPipelineAsync({ pipelineId: 'p7', triggeredBy: 'user', initialInput: { q: 'hello' } }, fetcher);
    expect(captured.url).toBe('/api/v2/admin/pipelines/p7/trigger?async=true');
    expect(captured.init?.method).toBe('POST');
    const body = JSON.parse(String(captured.init?.body));
    expect(body.triggeredBy).toBe('user');
    expect(body.initialInput).toEqual({ q: 'hello' });
  });

  it('HTTP 200 with data.error → kind="failed"', async () => {
    const fetcher = mockFetch(async () => jsonResponse(200, {
      success: true,
      data: { runId: 'r1', status: 'failed', error: 'LLM timeout' },
    }));
    const r = await triggerPipelineAsync({ pipelineId: 'p1' }, fetcher);
    expect(r.kind).toBe('failed');
    if (r.kind === 'failed') expect(r.error).toBe('LLM timeout');
  });

  it('HTTP 200 with status=completed → kind="completed"', async () => {
    const fetcher = mockFetch(async () => jsonResponse(200, {
      success: true,
      data: { runId: 'r1', status: 'completed', durationMs: 4321 },
    }));
    const r = await triggerPipelineAsync({ pipelineId: 'p1' }, fetcher);
    expect(r.kind).toBe('completed');
    if (r.kind === 'completed') {
      expect(r.runId).toBe('r1');
      expect(r.status).toBe('completed');
      expect(r.durationMs).toBe(4321);
    }
  });

  it('HTTP 500 → throw (caller 上 toast)', async () => {
    const fetcher = mockFetch(async () => jsonResponse(500, { error: 'server_exploded' }));
    await expect(triggerPipelineAsync({ pipelineId: 'p1' }, fetcher)).rejects.toThrow(/server_exploded/);
  });

  it('HTTP 401 → throw (api() 会处理 redirect,这里只确保 throw)', async () => {
    const fetcher = mockFetch(async () => jsonResponse(401, { error: 'unauthorized' }));
    await expect(triggerPipelineAsync({ pipelineId: 'p1' }, fetcher)).rejects.toThrow(/unauthorized/);
  });

  it('默认 triggeredBy="user" 当未指定', async () => {
    let capturedBody = '';
    const fetcher = mockFetch(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return jsonResponse(202, { success: true, data: { runId: 'r1', status: 'pending' } });
    });
    await triggerPipelineAsync({ pipelineId: 'p1' }, fetcher);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.triggeredBy).toBe('user');
  });

  it('默认值 initialInput={} 当未指定', async () => {
    let capturedBody = '';
    const fetcher = mockFetch(async (_url, init) => {
      capturedBody = String(init?.body ?? '');
      return jsonResponse(202, { success: true, data: { runId: 'r1', status: 'pending' } });
    });
    await triggerPipelineAsync({ pipelineId: 'p1', triggeredBy: 'bot' }, fetcher);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.initialInput).toEqual({});
    expect(parsed.triggeredBy).toBe('bot');
  });

  it('URL 始终带 ?async=true (回归测试: 不要丢失 query)', async () => {
    let capturedUrl = '';
    const fetcher = mockFetch(async (url) => {
      capturedUrl = String(url);
      return jsonResponse(202, { success: true, data: { runId: 'r1', status: 'pending' } });
    });
    await triggerPipelineAsync({ pipelineId: 'p1' }, fetcher);
    expect(capturedUrl).toMatch(/\?async=true$/);
  });
});
