import { useStore } from '../store';

type RequestOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  token?: string | null;
};

function getToken(): string | null {
  return useStore.getState().token;
}

function authHeaders(token?: string | null): Record<string, string> {
  const t = token !== undefined ? token : getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api<T = unknown>(url: string, options: RequestOptions = {}): Promise<T | null> {
  const { headers: customHeaders, token, ...rest } = options;
  const headers: Record<string, string> = {
    ...authHeaders(token),
    ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
    ...customHeaders,
  };

  const res = await fetch(url, { ...rest, headers });
  if (!res.ok) return null;

  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function apiSend(url: string, options: RequestOptions = {}): Promise<Response> {
  const { headers: customHeaders, token, ...rest } = options;
  const headers: Record<string, string> = {
    ...authHeaders(token),
    ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
    ...customHeaders,
  };
  return fetch(url, { ...rest, headers });
}

export async function apiOk(url: string, options: RequestOptions = {}): Promise<boolean> {
  const res = await apiSend(url, options);
  return res.ok;
}
