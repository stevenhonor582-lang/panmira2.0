/**
 * R49-B Step 4 — GET /api/v3/health
 *
 * 升级点:
 * - 统一 envelope: { success, data, meta: { traceId, version, timestamp } }
 * - 全依赖检查: DB / Redis / MemoryServer / MCP / CC-SDK
 * - 失败时不返回 503,仍返回 200 + status='degraded'(让 k8s/PM2 liveness 区分)
 * - 详细 status 字段: ok | degraded | fail
 *
 * 与 /api/health (R36-R48 旧版) 并存 1 月,R49-B 内前端逐步切 v3
 */
import type * as http from 'node:http';
import net from 'node:net';
import { withErrorBoundary, sendOk } from '../middleware/unified-error.js';
import type { ApiVersion } from '../contract/index.js';

interface CheckResult {
  status: 'ok' | 'warn' | 'fail';
  message?: string;
  latencyMs?: number;
}

interface HealthData {
  status: 'ok' | 'degraded' | 'fail';
  uptime: number;
  version: string;
  checks: {
    db?: CheckResult;
    redis?: CheckResult;
    memory?: CheckResult;
    mcp?: CheckResult;
    cc_sdk?: CheckResult;
  };
  timestamp: string;
}

const startTime = Date.now();
const APP_VERSION = '1.0.0-r49-b';

// ── 依赖检查 helper ────────────────────────────────────────────────────
async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const { pool } = await import('../../db/index.js');
    const r = await pool.query('SELECT 1 AS alive');
    return {
      status: r.rows[0]?.alive === 1 ? 'ok' : 'fail',
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    return { status: 'fail', message: e?.message?.slice(0, 200), latencyMs: Date.now() - t0 };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ status: 'ok', latencyMs: Date.now() - t0 });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'warn', message: 'timeout', latencyMs: Date.now() - t0 });
    });
    socket.on('error', (e: any) => {
      resolve({ status: 'fail', message: e?.message?.slice(0, 100), latencyMs: Date.now() - t0 });
    });
    socket.connect(6379, '127.0.0.1');
  });
}

async function checkMemory(): Promise<CheckResult> {
  const t0 = Date.now();
  const url = process.env.MEMORY_SERVER_URL || 'http://127.0.0.1:9101';
  try {
    const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    return {
      status: resp.ok ? 'ok' : 'warn',
      message: `HTTP ${resp.status}`,
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    return { status: 'warn', message: e?.message?.slice(0, 100), latencyMs: Date.now() - t0 };
  }
}

async function checkMcp(): Promise<CheckResult> {
  // MCP servers 通过多个可能位置注册;这里尝试动态查找,找不到只 warn
  const t0 = Date.now();
  try {
    const candidates = [
      '../mcp-servers.js',
      '../mcp/mcp-servers.js',
      '../../mcp-servers.js',
      './mcp-servers.js',
    ];
    for (const path of candidates) {
      try {
        const mod = await import(/* @vite-ignore */ path);
        const fn = mod.getMcpRegistry || mod.default?.getMcpRegistry;
        if (typeof fn === 'function') {
          const registry = fn();
          const servers = registry?.list?.() ?? [];
          return {
            status: servers.length > 0 ? 'ok' : 'warn',
            message: `${servers.length} servers registered`,
            latencyMs: Date.now() - t0,
          };
        }
      } catch {
        // try next
      }
    }
    return { status: 'warn', message: 'mcp registry not found in known paths', latencyMs: Date.now() - t0 };
  } catch (e: any) {
    return { status: 'warn', message: e?.message?.slice(0, 100), latencyMs: Date.now() - t0 };
  }
}

async function checkCcSdk(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    // CC SDK 通过 import 检测版本号即可(实际启动在 lazy call)
    const pkg = await import('../../../package.json', { with: { type: 'json' } }).catch(() => null);
    const sdkVersion = (pkg as any)?.default?.dependencies?.['@anthropic-ai/claude-agent-sdk'] ?? 'unknown';
    return {
      status: 'ok',
      message: `sdk ${sdkVersion}`,
      latencyMs: Date.now() - t0,
    };
  } catch (e: any) {
    return { status: 'warn', message: e?.message?.slice(0, 100), latencyMs: Date.now() - t0 };
  }
}

// ── 路由 handler ──────────────────────────────────────────────────────
export async function handleV3HealthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (u.pathname !== '/api/v3/health') return false;
  if (method !== 'GET') return false;

  return withErrorBoundary(req, res, 'v3' as ApiVersion, async () => {
    // 并行跑所有检查(2s timeout each)
    const [db, redis, memory, mcp, cc_sdk] = await Promise.all([
      checkDb(),
      checkRedis(),
      checkMemory(),
      checkMcp(),
      checkCcSdk(),
    ]);

    const checks = { db, redis, memory, mcp, cc_sdk };
    const values = Object.values(checks);
    const hasFail = values.some((c) => c.status === 'fail');
    const hasWarn = values.some((c) => c.status === 'warn');
    const status: HealthData['status'] = hasFail ? 'degraded' : hasWarn ? 'degraded' : 'ok';

    const data: HealthData = {
      status,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: APP_VERSION,
      checks,
      timestamp: new Date().toISOString(),
    };

    sendOk(res, data, 'v3');
  });
}
