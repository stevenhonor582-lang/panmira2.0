import createClient from 'openapi-fetch';
import type { paths } from '../src/api/schema';

const baseUrl = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || '';

const realClient = createClient<paths>({ baseUrl, credentials: 'include' });

let authToken: string | null = null;

async function fetchWith429Retry(url: string, init?: RequestInit): Promise<Response> {
  // 自动注入 live token (考虑 refresh)
  const injectToken = (req: RequestInit) => {
    const t = liveToken();
    if (t) {
      req.headers = { ...((init?.headers as any) || {}), Authorization: `Bearer ${t}` };
    }
    return req;
  };

  let resp = await fetch(url, injectToken({ ...init }));

  // 401: token 过期,refresh + retry 一次
  if (resp.status === 401 && typeof window !== 'undefined' && getRefresh()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      resp = await fetch(url, injectToken({ ...init }));
    }
  }

  // 429: rate limit, retry
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('Retry-After') || '1', 10);
    const wait = Math.min(Math.max(retryAfter * 1000, 300), 3000);
    await new Promise((r) => setTimeout(r, wait));
    resp = await fetch(url, injectToken({ ...init }));
  }
  return resp;
}
export function setAuthToken(token: string | null) { authToken = token; }
if (typeof window !== 'undefined') authToken = localStorage.getItem('panmira.token');

realClient.use({
  async onRequest({ request }) {
    if (authToken) request.headers.set('Authorization', `Bearer ${authToken}`);
    return request;
  },
  async onResponse({ response }) {
    // 401 处理由 compatCall 的 fetchWith429Retry 自动 refresh + 重试,不再强制跳
    return response;
  },
});

export const typedApi = realClient;

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const r = getRefresh();
  if (!r) return null;
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
  return next;
}

function compatCall<T = any>(url: string, init?: { method?: string; body?: any; headers?: any; [k: string]: any }): Promise<T> {
  const headers: Record<string, string> = { ...((init?.headers as any) || {}) };
  const token = liveToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
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
