import createClient from 'openapi-fetch';
import type { paths } from '../src/api/schema';
import { getToken, getRefresh, clearSession } from './auth';

const baseUrl = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || '';

const realClient = createClient<paths>({ baseUrl, credentials: 'include' });

// ═══════════════════════════════════════════════════════════
// 实时 token 读取 — 永远从 localStorage 拿,不要用模块级闭包
// ═══════════════════════════════════════════════════════════
function liveToken(): string | null {
  if (typeof window === 'undefined') return null;
  return getToken();
}

// ═══════════════════════════════════════════════════════════
// Refresh access token — 失败时 clear session 跳 login
// ═══════════════════════════════════════════════════════════
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // 多个 401 并发时,只发一次 refresh
  if (refreshing) return refreshing;

  refreshing = (async () => {
    if (typeof window === 'undefined') return null;
    const r = getRefresh();
    if (!r) return null;
    try {
      const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: r }),
        credentials: 'include',
      });
      if (!resp.ok) {
        clearSession();
        if (typeof window !== 'undefined') window.location.href = '/login/';
        return null;
      }
      const data = await resp.json();
      const next = data?.data?.accessToken ?? data?.accessToken;
      if (typeof window !== 'undefined' && next) {
        window.localStorage.setItem('panmira.token', next);
      }
      return next ?? null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// ═══════════════════════════════════════════════════════════
// fetch wrapper: 自动注入 token + 401 refresh + 429 retry
// ═══════════════════════════════════════════════════════════
async function fetchWith429Retry(url: string, init?: RequestInit): Promise<Response> {
  const injectToken = (req: RequestInit): RequestInit => {
    const t = liveToken();
    const headers = new Headers(req.headers);
    if (t) headers.set('Authorization', `Bearer ${t}`);
    return { ...req, headers };
  };

  let resp = await fetch(url, injectToken({ ...init }));

  // 401: access token 过期,refresh + retry 一次
  if (resp.status === 401 && typeof window !== 'undefined' && getRefresh()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      resp = await fetch(url, injectToken({ ...init }));
    }
  }

  // 429: rate limit, retry once after Retry-After
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('Retry-After') || '1', 10);
    const wait = Math.min(Math.max(retryAfter * 1000, 300), 3000);
    await new Promise((r) => setTimeout(r, wait));
    resp = await fetch(url, injectToken({ ...init }));
  }
  return resp;
}

// ═══════════════════════════════════════════════════════════
// typed openapi-fetch client (typedApi)
// ═══════════════════════════════════════════════════════════
export function setAuthToken(_token: string | null) {
  // no-op: liveToken() 实时从 localStorage 读
}

realClient.use({
  async onRequest({ request }) {
    const t = liveToken();
    if (t) request.headers.set('Authorization', `Bearer ${t}`);
    return request;
  },
  async onResponse({ response }) {
    return response;
  },
});

export const typedApi = realClient;

// ═══════════════════════════════════════════════════════════
// 通用 compat 调用 (旧 api<T>(url) API)
// ═══════════════════════════════════════════════════════════
function compatCall<T = any>(url: string, init?: { method?: string; body?: any; headers?: any; [k: string]: any }): Promise<T> {
  const headers: Record<string, string> = { ...((init?.headers as any) || {}) };
  // token 由 fetchWith429Retry 注入,这里不重复
  let body: BodyInit | undefined;
  if (init?.body !== undefined) {
    if (typeof init.body === 'string' || init.body instanceof FormData) {
      body = init.body;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(init.body);
    }
  }
  return fetchWith429Retry(url, { ...init, headers, body, credentials: 'include' }).then(async (r) => {
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    return data as T;
  });
}

export const api: <T = any>(url: string, init?: { method?: string; body?: any; headers?: any; [k: string]: any }) => Promise<T> = compatCall;
export const realApi = compatCall;

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: { total: number; page: number; limit: number };
};
