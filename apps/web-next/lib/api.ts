import createClient from 'openapi-fetch';
import type { paths } from '../src/api/schema';

const baseUrl = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || '';

const realClient = createClient<paths>({ baseUrl, credentials: 'include' });

let authToken: string | null = null;
export function setAuthToken(token: string | null) { authToken = token; }
if (typeof window !== 'undefined') authToken = localStorage.getItem('panmira.token');

realClient.use({
  async onRequest({ request }) {
    if (authToken) request.headers.set('Authorization', `Bearer ${authToken}`);
    return request;
  },
  async onResponse({ response }) {
    if (response.status === 401 && typeof window !== 'undefined') window.location.href = '/login/';
    return response;
  },
});

export const typedApi = realClient;

function compatCall<T = any>(url: string, init?: { method?: string; body?: any; headers?: any; [k: string]: any }): Promise<T> {
  const token = authToken || (typeof window !== 'undefined' ? localStorage.getItem('panmira.token') : null);
  const headers: Record<string, string> = { ...((init?.headers as any) || {}) };
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
  return fetch(url, { ...init, headers, body, credentials: 'include' }).then(async (r) => {
    if (r.status === 401 && typeof window !== 'undefined') window.location.href = '/login/';
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
