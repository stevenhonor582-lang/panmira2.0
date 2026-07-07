// Verify trigger pipeline writes labelSnapshot to the pipeline_runs row.
// Mocks DB + oauth + pipeline-engine + pipeline-rate-limit + pipeline-events,
// then drives handlePipelineRoutes with a POST /api/v2/admin/pipelines/<id>/trigger
// and inspects the .values() arg passed to db.insert(pipelineRuns).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type http from 'node:http';

// Mutable holders — defined OUTSIDE the factory so test code can read/reset them.
const insertCalls: { table: unknown; values: unknown }[] = [];
let selectPipelineImpl: () => Promise<unknown[]> = async () => [];

vi.mock('../src/db/index.js', () => {
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((v: unknown) => {
      insertCalls.push({ table, values: v });
      return { returning: vi.fn(async () => [{ id: 'run-snap-1' }]) };
    }),
  }));
  const select = vi.fn((..._args: unknown[]) => {
    void _args;
    return {
      from: () => ({
        where: () => ({
          limit: async () => selectPipelineImpl(),
        }),
      }),
      orderBy: () => ({ limit: async () => [] }),
    };
  });
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  }));
  return {
    db: { insert, select, update, execute: vi.fn() },
    pool: { query: vi.fn() },
  };
});

vi.mock('../src/api/oauth-middleware.js', () => ({
  requireBearer: vi.fn(async () => ({ tenantId: 't-1', userId: 'u-1', scopes: ['agent:admin'] })),
  requireScopes: vi.fn(() => ({ ok: true, missing: [] })),
}));

vi.mock('../src/services/pipeline-engine.js', () => ({
  validatePipeline: vi.fn(() => ({ ok: true, errors: [] })),
  executePipeline: vi.fn(async () => ({
    status: 'completed', result: {}, error: undefined, durationMs: 1, nodeStates: {},
  })),
}));

vi.mock('../src/middleware/pipeline-rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  checkDailyTokenCap: vi.fn(() => ({ ok: true })),
  recordTokenUsage: vi.fn(),
}));

vi.mock('../src/api/pipeline-events.js', () => ({
  broadcastPipelineProgress: vi.fn(),
}));

// Re-import AFTER mocks are set up.
const { handlePipelineRoutes } = await import('../src/api/routes/pipeline-routes.js');

function makeReq(url: string, method: string, body: unknown = { triggeredBy: 'user' }): http.IncomingMessage {
  const json = JSON.stringify(body);
  const req = Readable.from([Buffer.from(json)]) as unknown as http.IncomingMessage;
  (req as unknown as { url: string }).url = url;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { headers: Record<string, string> }).headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(json)),
  };
  return req;
}
function makeRes(): http.ServerResponse {
  return {
    statusCode: 200,
    setHeader: () => undefined,
    writeHead: () => undefined,
    end: () => undefined,
  } as unknown as http.ServerResponse;
}

function defaultPipelineRow(): unknown {
  return [
    {
      id: 'p-1',
      name: 'P1',
      nodes: [
        { id: 'n1', label: 'Alpha', agentTemplateId: 'a-1' },
        { id: 'n2', label: 'Beta', agentTemplateId: 'a-2' },
        { id: 'n3', label: 'Gamma', agentTemplateId: 'a-3' },
      ],
      edges: [],
      timeoutMs: null,
      retryPolicy: null,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  selectPipelineImpl = defaultPipelineRow;
});

describe('trigger pipeline writes labelSnapshot', () => {
  it('persists current node labels as { nodeId: label }', async () => {
    const req = makeReq('/api/v2/admin/pipelines/p-1/trigger', 'POST');
    const res = makeRes();
    const handled = await handlePipelineRoutes(req, res, 'POST', req.url!);
    expect(handled).toBe(true);

    const hasLabel = insertCalls.some((c) => {
      const v = c.values as Record<string, unknown>;
      return v && typeof v === 'object' && 'labelSnapshot' in v;
    });
    expect(hasLabel).toBe(true);
  });

  it('snapshot maps nodeId → current label (not agentTemplateId)', async () => {
    const req = makeReq('/api/v2/admin/pipelines/p-1/trigger', 'POST');
    const res = makeRes();
    await handlePipelineRoutes(req, res, 'POST', req.url!);

    const runInsert = insertCalls.find((c) => {
      const v = c.values as Record<string, unknown>;
      return v && typeof v === 'object' && 'labelSnapshot' in v;
    });
    expect(runInsert).toBeDefined();
    const snap = (runInsert!.values as { labelSnapshot: Record<string, string> }).labelSnapshot;
    expect(snap).toEqual({
      n1: 'Alpha',
      n2: 'Beta',
      n3: 'Gamma',
    });
  });

  it('handles nodes with missing/empty label gracefully (defaults to empty string)', async () => {
    selectPipelineImpl = async () => [
      {
        id: 'p-2',
        name: 'P2',
        nodes: [
          { id: 'n1', label: 'X', agentTemplateId: 'a-1' },
          { id: 'n2', agentTemplateId: 'a-2' }, // no label
        ],
        edges: [],
        timeoutMs: null,
        retryPolicy: null,
      },
    ];

    const req = makeReq('/api/v2/admin/pipelines/p-2/trigger', 'POST');
    const res = makeRes();
    await handlePipelineRoutes(req, res, 'POST', req.url!);

    const runInsert = insertCalls.find((c) => {
      const v = c.values as Record<string, unknown>;
      return v && typeof v === 'object' && 'labelSnapshot' in v;
    });
    const snap = (runInsert!.values as { labelSnapshot: Record<string, string> }).labelSnapshot;
    expect(snap.n1).toBe('X');
    expect(snap.n2).toBe('');
  });
});
